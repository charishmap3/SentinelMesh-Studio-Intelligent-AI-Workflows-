from __future__ import annotations

from collections import deque
from collections.abc import Callable
from datetime import datetime, timezone
import json
import logging
from typing import Any

try:
    from langgraph.constants import END
    from langgraph.graph import StateGraph
except ModuleNotFoundError:  # pragma: no cover - fallback for test environments without langgraph installed
    END = "END"
    StateGraph = None

from agents.agent_registry import AgentRegistry
from graph.state import WorkflowState

logger = logging.getLogger(__name__)


def _safe_failure_context(state: WorkflowState, node_id: str | None, node_type: str | None, error: Exception | None = None) -> dict[str, Any]:
    message = str(error) if error is not None else "Unknown workflow node failure"
    error_type = type(error).__name__ if error is not None else "UnknownError"
    return {
        "failed_node_id": node_id,
        "failed_node_type": node_type,
        "failure_message": message,
        "failure_error_type": error_type,
        "execution_timestamp": datetime.now(timezone.utc).isoformat(),
        "safe_context": {
            "current_node": state.get("current_node"),
            "execution_status": state.get("execution_status"),
            "errors": list(state.get("errors") or []),
        },
    }


class GraphBuilder:
    def __init__(self) -> None:
        # cache compiled graphs keyed by (workflow_id, start_node) to avoid reusing a graph
        # compiled with a different entry point
        self._graph_cache: dict[tuple[str | None, str | None], Any] = {}
        self._agent_registry = AgentRegistry()

    def _validate_workflow(self, workflow_json: dict[str, Any]) -> list[str]:
        errors: list[str] = []

        if not workflow_json:
            return ["Workflow is empty."]

        nodes = workflow_json.get("nodes") or []
        edges = workflow_json.get("edges") or []

        if not isinstance(nodes, list) or not nodes:
            errors.append("Workflow must contain at least one node.")

        if not isinstance(edges, list):
            errors.append("Workflow edges must be a list.")

        node_ids = {node.get("id") for node in nodes if isinstance(node, dict) and node.get("id")}
        if not node_ids:
            errors.append("Workflow does not contain any valid node IDs.")

        for edge in edges if isinstance(edges, list) else []:
            if not isinstance(edge, dict):
                errors.append("Each edge must be an object.")
                continue
            source = edge.get("source")
            target = edge.get("target")
            if source not in node_ids or target not in node_ids:
                errors.append(f"Invalid edge reference: {source} -> {target}")

        entry_node = None
        for node in nodes if isinstance(nodes, list) else []:
            if isinstance(node, dict) and node.get("id"):
                entry_node = node.get("id")
                break

        if entry_node is None:
            errors.append("Missing entry node.")

        if not errors:
            adjacency = {node_id: [] for node_id in node_ids}
            for edge in edges if isinstance(edges, list) else []:
                if isinstance(edge, dict):
                    source = edge.get("source")
                    target = edge.get("target")
                    if source in adjacency and target in adjacency:
                        adjacency[source].append(target)

            visited: set[str] = set()
            stack: set[str] = set()

            def visit(node_id: str) -> None:
                if node_id in stack:
                    errors.append("Cyclic workflow detected.")
                    return
                if node_id in visited:
                    return
                stack.add(node_id)
                for neighbor in adjacency.get(node_id, []):
                    visit(neighbor)
                stack.remove(node_id)
                visited.add(node_id)

            for node_id in adjacency:
                visit(node_id)

        return errors

    def _normalize_categories(self, categories: Any) -> list[str]:
        if isinstance(categories, str):
            parsed = [item.strip() for item in categories.split(",") if item.strip()]
            return [category.lower() for category in parsed]
        if isinstance(categories, list):
            normalized = []
            for category in categories:
                if isinstance(category, str):
                    cleaned = category.strip()
                    if cleaned:
                        normalized.append(cleaned.lower())
            return normalized
        return []

    def _build_placeholder_node(self, node_id: str) -> Any:
        def placeholder(state: WorkflowState) -> WorkflowState:
            state["current_node"] = node_id
            # Short-circuit: if upstream indicated no work, skip executing placeholders
            if state.get("execution_status") == "no_messages":
                state.setdefault("execution_log", []).append(f"{node_id} skipped due to no_messages")
                state.setdefault("skipped_nodes", []).append(node_id)
                return state
            # Resume guard: skip if already executed
            executed_nodes = list(state.get("executed_nodes") or [])
            if node_id in executed_nodes:
                state.setdefault("execution_log", []).append(f"{node_id} skipped (already executed)")
                state.setdefault("skipped_nodes", []).append(node_id)
                return state
            state.setdefault("execution_log", []).append(f"Executed {node_id}")
            state.setdefault("executed_nodes", []).append(node_id)
            state["execution_status"] = "running"
            return state

        return placeholder

    def _build_runtime_output(self, node: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        data = node.get("data") if isinstance(node.get("data"), dict) else {}
        kind = str(data.get("kind") or node.get("type") or "")
        output: dict[str, Any] = {}
        if kind in {"file-upload", "File Upload"}:
            for key in ("file_id", "file_reference", "file_name", "file_mime_type", "file_size", "file_content", "input_text"):
                if state.get(key) is not None:
                    output[key] = state.get(key)
        elif kind in {"email-trigger", "Email Trigger"}:
            for key in ("email_subject", "email_body", "input_text"):
                if state.get(key) is not None:
                    output[key] = state.get(key)
        elif kind in {"extractor", "Extractor"}:
            if state.get("extracted_data") is not None:
                output["extracted_data"] = state.get("extracted_data")
                output["text"] = json.dumps(state.get("extracted_data"), ensure_ascii=False)
        elif kind in {"summarizer", "Summarizer"}:
            if state.get("summary") is not None:
                output["summary"] = state.get("summary")
                output["text"] = str(state.get("summary"))
        elif kind in {"classifier", "Classifier"}:
            if state.get("category") is not None:
                output["category"] = state.get("category")
            if state.get("classification") is not None:
                output["classification"] = state.get("classification")
        else:
            for key in ("current_input", "input_text", "llm_output", "summary", "extracted_data"):
                if state.get(key) is not None:
                    output[key] = state.get(key)
        return output

    def _log_extractor_runtime(self, state: WorkflowState, node: dict[str, Any]) -> None:
        node_data = node.get("data") if isinstance(node.get("data"), dict) else {}
        workflow_data = state.get("workflow_data") or {}
        node_id = node.get("id")
        upstream_ids = [
            edge.get("source")
            for edge in workflow_data.get("edges") or []
            if isinstance(edge, dict) and edge.get("target") == node_id
        ]
        runtime_outputs = state.get("runtime_node_outputs") or {}
        upstream_outputs = [runtime_outputs.get(upstream_id) or {} for upstream_id in upstream_ids]

        def info(value: Any) -> dict[str, Any]:
            if value is None:
                return {"present": False, "type": "NoneType", "length": 0}
            return {"present": bool(value), "type": type(value).__name__, "length": len(value) if hasattr(value, "__len__") else None}

        logger.warning(
            "EXTRACTOR_RUNTIME_DEBUG execution_id=%s node_id=%s inputField=%s state_keys=%s input_text=%s file_content=%s current_input=%s upstream_node_ids=%s upstream_output_available=%s node_input_available=%s",
            state.get("execution_id"),
            node_id,
            node_data.get("inputField"),
            sorted(state.keys()),
            info(state.get("input_text")),
            info(state.get("file_content")),
            info(state.get("current_input")),
            upstream_ids,
            any(bool(output) for output in upstream_outputs),
            any(bool(output.get("input_text") or output.get("file_content") or output.get("text") or output.get("extracted_data")) for output in upstream_outputs),
        )

    def _build_node_handler(self, node: dict[str, Any]) -> Any:
        node_id = node.get("id")
        node_data = node.get("data") if isinstance(node.get("data"), dict) else {}
        semantic_kind = node_data.get("kind")

        kind_aliases = {
            "requirement-validation": "Requirement Validation",
            "inventory": "Inventory",
            "email-trigger": "Email Trigger",
            "llm": "LLM",
            "send-email": "Send Email",
            "vendor-selection": "Vendor Selection",
            "budget-validation": "Budget Validation",
            "approval": "Approval",
            "purchase-order": "Purchase Order",
            "condition": "Condition",
            "router": "Router",
            "classifier": "Classifier",
            "extractor": "Extractor",
            "summarizer": "Summarizer",
            "supervisor": "Supervisor",
            "failure-detection": "Failure Detection",
            "rag-incident-memory": "RAG Incident Memory",
            "auto-healing": "Auto Healing",
            "scheduler": "Scheduler",
            "file-upload": "File Upload",
        }

        node_type = kind_aliases.get(semantic_kind, semantic_kind or node.get("type"))
        agent = self._agent_registry.get_agent(node_type)
        if agent is not None:
            def handler(state: WorkflowState) -> WorkflowState:
                import time
                new_state = {**state, "current_node": node_id}
                upstream_node_ids = [
                    edge.get("source")
                    for edge in (new_state.get("workflow_data") or {}).get("edges") or []
                    if isinstance(edge, dict)
                    and edge.get("target") == node_id
                    and isinstance(edge.get("source"), str)
                ]
                node_metrics = new_state.get("node_metrics") or {}
                failed_upstreams = [
                    upstream_id
                    for upstream_id in upstream_node_ids
                    if upstream_id in set(new_state.get("failed_node_ids") or [])
                    or (isinstance(node_metrics.get(upstream_id), dict) and node_metrics[upstream_id].get("status") == "failed")
                ]
                skipped_upstreams = [
                    upstream_id
                    for upstream_id in upstream_node_ids
                    if upstream_id in set(new_state.get("skipped_nodes") or [])
                    or (isinstance(node_metrics.get(upstream_id), dict) and node_metrics[upstream_id].get("status") == "skipped")
                ]
                if failed_upstreams or skipped_upstreams:
                    reason = (
                        f"Upstream node(s) failed: {', '.join(failed_upstreams)}."
                        if failed_upstreams
                        else f"Upstream node(s) skipped: {', '.join(skipped_upstreams)}."
                    )
                    new_state.setdefault("skipped_nodes", []).append(node_id)
                    new_state.setdefault("execution_log", []).append(
                        f"{datetime.now(timezone.utc).isoformat()} - {node_id} skipped: {reason}"
                    )
                    new_state.setdefault("node_metrics", {})[node_id] = {
                        "node_id": node_id,
                        "status": "skipped",
                        "warnings": [reason],
                        "errors": [],
                        "retry_count": 0,
                        "output_summary": None,
                    }
                    logger.warning(
                        "GRAPH_DEPENDENCY_DEBUG node_id=%s upstream_node_ids=%s failed_upstreams=%s skipped_upstreams=%s status=skipped",
                        node_id,
                        upstream_node_ids,
                        failed_upstreams,
                        skipped_upstreams,
                    )
                    return new_state
                if semantic_kind in {"extractor", "Extractor"}:
                    self._log_extractor_runtime(new_state, node)
                if new_state.get("execution_status") == "no_messages":
                    new_state.setdefault("execution_log", []).append(f"{node_id} skipped due to no_messages")
                    new_state.setdefault("skipped_nodes", []).append(node_id)
                    return new_state
                # Resume guard: skip node if already executed to avoid duplicate side-effects
                executed_nodes = list(new_state.get("executed_nodes") or [])
                if node_id in executed_nodes:
                    new_state.setdefault("execution_log", []).append(f"{node_id} skipped (already executed)")
                    new_state.setdefault("skipped_nodes", []).append(node_id)
                    return new_state
                # ensure executed_nodes list exists but don't append yet
                new_state.setdefault("executed_nodes", [])

                # Instrumentation: record node start time and initialize metrics
                start_dt = datetime.now(timezone.utc)
                start_iso = start_dt.isoformat()
                perf_start = time.perf_counter()
                node_metrics = new_state.setdefault("node_metrics", {})
                node_metrics.setdefault(node_id, {})
                node_metrics[node_id].update({
                    "node_id": node_id,
                    "start_time": start_iso,
                    "status": "running",
                    "warnings": [],
                    "errors": [],
                    "retry_count": 0,
                    "output_summary": None,
                })
                # Append structured start log
                new_state.setdefault("execution_log", []).append(f"{start_iso} - {node_id} started")

                try:
                    result_state = agent.execute(new_state)
                    runtime_outputs = dict(result_state.get("runtime_node_outputs") or {})
                    runtime_outputs[node_id] = self._build_runtime_output(node, result_state)
                    result_state["runtime_node_outputs"] = runtime_outputs

                    # record end time and duration
                    end_dt = datetime.now(timezone.utc)
                    end_iso = end_dt.isoformat()
                    perf_end = time.perf_counter()
                    duration_ms = int((perf_end - perf_start) * 1000)

                        # If the node is an approval and it paused the workflow, short-circuit and stop further execution
                    if result_state.get("execution_status") in ("waiting_approval", "pending_manager_approval", "pending"):
                        # mark node as awaiting approval in metrics and logs, ensure executed_nodes records it
                        node_metrics[node_id].update({
                            "end_time": end_iso,
                            "duration_ms": duration_ms,
                            "status": result_state.get("execution_status"),
                            "warnings": [],
                            "errors": [],
                            "retry_count": 0,
                            "output_summary": None,
                        })
                        result_state.setdefault("execution_log", []).append(f"{end_iso} - {node_id} waiting for approval")
                        if node_id not in result_state.setdefault("executed_nodes", []):
                            result_state["executed_nodes"].append(node_id)
                        return result_state

                    # aggregate status information
                    node_status = "completed"
                    node_label = str(node_data.get("label") or semantic_kind or node_type or node_id).lower()
                    node_failure_logged = any(
                        isinstance(entry, str)
                        and (
                            node_label in entry.lower()
                            or f"- {node_id} failed (" in entry
                        )
                        and (
                            "execution failed" in entry.lower()
                            or f"{node_label} failed" in entry.lower()
                            or "failed:" in entry.lower()
                        )
                        for entry in (result_state.get("execution_log") or [])
                    )
                    if (
                        result_state.get("execution_status") == "failed"
                        or (result_state.get("failed_node_ids") and node_id in (result_state.get("failed_node_ids") or []))
                        or node_failure_logged
                    ):
                        node_status = "failed"
                    elif node_id in (result_state.get("skipped_nodes") or []):
                        node_status = "skipped"

                    # capture warnings/errors if present in state
                    warnings = list(result_state.get("warnings") or []) if isinstance(result_state.get("warnings"), list) else []
                    errors = list(result_state.get("errors") or []) if isinstance(result_state.get("errors"), list) else []
                    retry_count = int(result_state.get("retry_count") or 0) if isinstance(result_state.get("retry_count"), int) or result_state.get("retry_count") is not None else 0

                    # attempt to summarize output fields
                    output_summary = None
                    outputs = {}
                    for key in ("summary", "classification", "extracted_data"):
                        if key in result_state and result_state.get(key) is not None:
                            outputs[key] = result_state.get(key)
                    if outputs:
                        output_summary = outputs

                    node_metrics[node_id].update({
                        "end_time": end_iso,
                        "duration_ms": duration_ms,
                        "status": node_status,
                        "warnings": warnings,
                        "errors": errors,
                        "retry_count": retry_count,
                        "output_summary": output_summary,
                    })

                    # Append structured completion log
                    if node_status == "failed":
                        if node_id not in result_state.setdefault("failed_node_ids", []):
                            result_state["failed_node_ids"].append(node_id)
                        result_state["failure_context"] = _safe_failure_context(
                            result_state,
                            node_id,
                            node_type,
                            RuntimeError("; ".join(errors) if errors else f"{node_id} failed"),
                        )
                        result_state.setdefault("execution_log", []).append(f"{end_iso} - {node_id} failed ({duration_ms}ms)")
                    else:
                        result_state.setdefault("execution_log", []).append(f"{end_iso} - {node_id} completed ({duration_ms}ms)")
                    # Ensure executed_nodes records this execution (avoid duplicates)
                    if node_id not in result_state.setdefault("executed_nodes", []):
                        result_state["executed_nodes"].append(node_id)

                    return result_state
                except Exception as exc:
                    # record end time and failure
                    end_dt = datetime.now(timezone.utc)
                    end_iso = end_dt.isoformat()
                    perf_end = time.perf_counter()
                    duration_ms = int((perf_end - perf_start) * 1000)

                    failure_context = _safe_failure_context(new_state, node_id, node_type, exc)
                    new_state["execution_status"] = "failed"
                    new_state["errors"] = [str(exc)]
                    new_state.setdefault("failed_node_ids", []).append(node_id)
                    new_state["failure_context"] = failure_context

                    node_metrics[node_id].update({
                        "end_time": end_iso,
                        "duration_ms": duration_ms,
                        "status": "failed",
                        "warnings": [],
                        "errors": [str(exc)],
                        "retry_count": 0,
                        "output_summary": None,
                    })

                    new_state.setdefault("execution_log", []).append(
                        f"{end_iso} Node failure captured: node={node_id}, error={exc}"
                    )
                    # ensure executed_nodes records this attempt
                    if node_id not in new_state.setdefault("executed_nodes", []):
                        new_state["executed_nodes"].append(node_id)
                    return new_state

            return handler

        return self._build_placeholder_node(node_id or "unknown")

    def build_graph(self, workflow_json: dict[str, Any], start_node: str | None = None) -> Any:
        errors = self._validate_workflow(workflow_json)
        if errors:
            raise ValueError("; ".join(errors))

        nodes = workflow_json.get("nodes") or []
        edges = workflow_json.get("edges") or []
        node_ids = [node["id"] for node in nodes if isinstance(node, dict) and node.get("id")]

        if StateGraph is None:
            raise RuntimeError("langgraph is not installed")

        # If a compiled graph already exists in cache for this workflow and start_node, reuse it
        workflow_id = str(workflow_json.get("workflow_id") or None)
        cache_key = (workflow_id, start_node)
        cached = self._graph_cache.get(cache_key)
        if cached is not None:
            return cached

        graph = StateGraph(WorkflowState)
        condition_outgoing: dict[str, dict[str, str]] = {}

        for node in nodes:
            if isinstance(node, dict):
                node_id = node.get("id")
                if node_id:
                    graph.add_node(node_id, self._build_node_handler(node))

        # Collect edges first. For edges with sourceHandle treat them as conditional branches;
        # for unconditional edges, postpone adding them so approval nodes can be converted to conditional branches.
        unconditional_edges: list[tuple[str, str]] = []
        for edge in edges if isinstance(edges, list) else []:
            if not isinstance(edge, dict):
                continue
            source = edge.get("source")
            target = edge.get("target")
            source_handle = edge.get("sourceHandle")
            if source in node_ids and target in node_ids and isinstance(source_handle, str):
                condition_outgoing.setdefault(source, {})[source_handle] = target
            elif source in node_ids and target in node_ids:
                # unconditional edge - defer adding
                unconditional_edges.append((source, target))

        def make_condition_path_fn(branches: dict[str, str]) -> Callable[[WorkflowState], str]:
            def path(state: WorkflowState) -> str:
                # Allow resumed executions (status 'running') to evaluate condition branches.
                status = state.get("execution_status")
                if status == "no_messages":
                    return "false"
                # Only proceed when the workflow is in a state that represents completion of the upstream node
                # or when resuming execution ('running'). Otherwise, short-circuit to END.
                if status not in ("completed", "running"):
                    return END
                return "true" if bool(state.get("condition_result")) else "false"

            return path

        def make_router_path_fn(node_data: dict[str, Any], branches: dict[str, str]) -> Callable[[WorkflowState], str]:
            default_route = str(node_data.get("defaultRoute") or "").strip()

            def path(state: WorkflowState) -> str:
                # Allow resumed executions (status 'running') to evaluate router branches.
                status = state.get("execution_status")
                if status not in ("completed", "running"):
                    return END
                selected = state.get("router_result")
                if isinstance(selected, str):
                    if selected in branches:
                        return selected
                    if default_route and selected == default_route and "default" in branches:
                        return "default"
                return END

            return path

        def make_classifier_path_fn(node_data: dict[str, Any], branches: dict[str, str]) -> Callable[[WorkflowState], str]:
            def path(state: WorkflowState) -> str:
                # Allow resumed executions (status 'running') to evaluate classifier branches.
                status = state.get("execution_status")
                if status not in ("completed", "running"):
                    return END
                selected = state.get("classification")
                if isinstance(selected, str):
                    normalized = selected.strip().lower()
                    if normalized in branches:
                        return normalized
                return END

            return path

        def make_approval_path_fn(node_data: dict[str, Any], branches: dict[str, str]) -> Callable[[WorkflowState], str]:
            def path(state: WorkflowState) -> str:
                # If workflow is paused waiting for approval, do not follow outgoing edges
                status = state.get("execution_status")
                if status == "waiting_approval":
                    return END
                # If approved, take the 'approved' branch
                approval_status = state.get("approval_status")
                if isinstance(approval_status, str):
                    if approval_status == "approved" and "approved" in branches:
                        return "approved"
                    if approval_status == "rejected" and "rejected" in branches:
                        return "rejected"
                # Default: do not proceed
                return END

            return path

        # identify approval nodes so we can avoid adding unconditional edges that would bypass pause behavior
        approval_node_ids = { (n.get('id')) for n in nodes if isinstance(n, dict) and isinstance(n.get('data'), dict) and n.get('data').get('kind') == 'approval' }

        for node in nodes if isinstance(nodes, list) else []:
            if not isinstance(node, dict):
                continue
            node_id = node.get("id")
            node_data = node.get("data") if isinstance(node.get("data"), dict) else {}
            if node_id and isinstance(node_data, dict):
                kind = node_data.get("kind")
                if kind == "condition":
                    branches = condition_outgoing.get(node_id, {})
                    if branches:
                        graph.add_conditional_edges(
                            node_id,
                            make_condition_path_fn(branches),
                            path_map={**{route_name: target for route_name, target in branches.items()}, END: END},
                        )
                elif kind == "router":
                    branches = condition_outgoing.get(node_id, {})
                    if branches:
                        graph.add_conditional_edges(
                            node_id,
                            make_router_path_fn(node_data, branches),
                            path_map={**{route_name: target for route_name, target in branches.items()}, END: END},
                        )
                elif kind == "classifier":
                    branches = condition_outgoing.get(node_id, {})
                    configured_categories = set()
                    raw_categories = node_data.get("categories")
                    if isinstance(raw_categories, str):
                        configured_categories = {
                            str(item).strip().lower()
                            for item in raw_categories.split(",")
                            if str(item).strip()
                        }
                    elif isinstance(raw_categories, list):
                        configured_categories = {
                            str(item).strip().lower()
                            for item in raw_categories
                            if isinstance(item, str) and item.strip()
                        }

                    missing_categories = sorted(
                        category for category in configured_categories if category not in {str(key).strip().lower() for key in branches}
                    )
                    if branches and configured_categories and missing_categories:
                        raise ValueError(
                            f"Classifier node {node_id} requires outgoing edge for category '{missing_categories[0]}'."
                        )
                    if branches:
                        graph.add_conditional_edges(
                            node_id,
                            make_classifier_path_fn(node_data, branches),
                            path_map={**{route_name: target for route_name, target in branches.items()}, END: END},
                        )
                elif kind == "approval":
                    branches = condition_outgoing.get(node_id, {})
                    # If no explicit conditional branches found, fall back to an unconditional outgoing edge as 'approved'
                    if "approved" not in branches:
                        fallback_target = None
                        for e in edges:
                            if isinstance(e, dict) and e.get("source") == node_id and not e.get("sourceHandle"):
                                fallback_target = e.get("target")
                                break
                        if fallback_target:
                            branches = {**branches, "approved": fallback_target}

                    # approval node must define at least the 'approved' outgoing edge
                    if "approved" not in branches:
                        raise ValueError(f"Approval node {node_id} requires an 'approved' outgoing edge.")

                    # 'rejected' is optional; if absent, map to END
                    graph.add_conditional_edges(
                        node_id,
                        make_approval_path_fn(node_data, branches),
                        path_map={
                            "approved": branches.get("approved"),
                            "rejected": branches.get("rejected", END),
                            END: END,
                        },
                    )

        # After registering conditional edges, add unconditional edges for sources that are not approval nodes
        for source, target in unconditional_edges:
            if source not in node_ids or target not in node_ids:
                continue
            if source in approval_node_ids:
                # skip adding unconditional edge for approval nodes - they should use conditional branching
                continue
            graph.add_edge(source, target)

        entry_node = start_node if start_node is not None else (node_ids[0] if node_ids else None)
        if entry_node is not None:
            if entry_node not in node_ids:
                raise ValueError(f"start_node {entry_node} is not a valid node in the workflow")
            graph.set_entry_point(entry_node)

        # compile and cache the graph keyed by workflow id + start_node
        compiled = graph.compile()
        cache_key = (workflow_id, entry_node)
        self._graph_cache[cache_key] = compiled
        return compiled

    def execute_workflow(self, workflow_json: dict[str, Any]) -> dict[str, Any]:
        if not workflow_json:
            return {
                "status": "error",
                "visited_nodes": [],
                "execution_log": [],
                "errors": ["Workflow is empty."],
            }

        try:
            graph = self.build_graph(workflow_json)
        except ValueError as exc:
            return {
                "status": "error",
                "visited_nodes": [],
                "execution_log": [],
                "errors": [str(exc)],
            }

        initial_state: WorkflowState = {
            "workflow_id": str(workflow_json.get("workflow_id") or "unknown"),
            "current_node": None,
            "execution_status": "pending",
            "execution_log": [],
            "workflow_data": workflow_json,
        }

        result = graph.invoke(initial_state)

        visited_nodes = []
        for entry in result.get("execution_log", []):
            if entry.startswith("Executed "):
                visited_nodes.append(entry.replace("Executed ", ""))

        return {
            "status": "completed",
            "visited_nodes": visited_nodes,
            "execution_log": result.get("execution_log", []),
            "errors": [],
        }
