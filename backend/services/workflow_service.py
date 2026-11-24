from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4
import logging

from agents.agent_registry import AgentRegistry
from constants import node_types
from graph.graph_builder import GraphBuilder
from models.workflow import Workflow, WorkflowCreate, WorkflowUpdate

logger = logging.getLogger(__name__)


class WorkflowService:
    def __init__(self) -> None:
        self._workflows: dict[UUID, Workflow] = {}
        self._graph_builder = GraphBuilder()
        self._agent_registry = AgentRegistry()
        # store last execution state per workflow to support pause/resume
        self._last_execution_state: dict[UUID, dict] = {}

    def _build_node_outputs(self, result: dict[str, Any], workflow_payload: dict[str, Any]) -> list[dict[str, Any]]:
        node_outputs: list[dict[str, Any]] = []
        node_map = {
            node.get("id"): node
            for node in workflow_payload.get("nodes") or []
            if isinstance(node, dict) and isinstance(node.get("id"), str)
        }

        for node_id in result.get("executed_nodes") or []:
            if not isinstance(node_id, str):
                continue
            node_meta = node_map.get(node_id, {}).get("data") or {}
            node_kind = str(node_meta.get("kind") or node_meta.get("type") or "unknown")
            outputs: dict[str, Any] = {}

            if node_kind == "scheduler":
                for key in ("scheduler_status", "scheduler_last_run", "scheduler_next_run_at"):
                    if result.get(key) is not None:
                        outputs[key] = result.get(key)
            elif node_kind in {"file-upload", "File Upload"}:
                for key in ("file_id", "file_reference", "file_name", "file_mime_type", "file_size"):
                    if result.get(key) is not None:
                        outputs[key] = result.get(key)
            elif node_kind in {"requirement-validation", "Requirement Validation"}:
                if result.get("validation_passed") is not None:
                    outputs["validation_passed"] = result.get("validation_passed")
                if result.get("errors"):
                    outputs["errors"] = result.get("errors")
            if node_id == result.get("current_node") or node_kind in {
                "classifier",
                "Classifier",
                "extractor",
                "Extractor",
                "summarizer",
                "Summarizer",
            }:
                if result.get("classification") is not None:
                    outputs["classification"] = result.get("classification")
                if result.get("extracted_data") is not None:
                    outputs["extracted_data"] = result.get("extracted_data")
                if result.get("summary") is not None:
                    outputs["summary"] = result.get("summary")

                if result.get("classifier_input_field") is not None:
                    outputs["classifier_input_field"] = result.get("classifier_input_field")
                if result.get("classifier_categories") is not None:
                    outputs["classifier_categories"] = result.get("classifier_categories")
                if result.get("classifier_provider") is not None:
                    outputs["classifier_provider"] = result.get("classifier_provider")
                if result.get("classifier_model") is not None:
                    outputs["classifier_model"] = result.get("classifier_model")

                if result.get("extractor_input_field") is not None:
                    outputs["extractor_input_field"] = result.get("extractor_input_field")
                if result.get("extractor_fields") is not None:
                    outputs["extractor_fields"] = result.get("extractor_fields")
                if result.get("extractor_provider") is not None:
                    outputs["extractor_provider"] = result.get("extractor_provider")
                if result.get("extractor_model") is not None:
                    outputs["extractor_model"] = result.get("extractor_model")

                if result.get("summary_input_field") is not None:
                    outputs["summary_input_field"] = result.get("summary_input_field")
                if result.get("summary_provider") is not None:
                    outputs["summary_provider"] = result.get("summary_provider")
                if result.get("summary_model") is not None:
                    outputs["summary_model"] = result.get("summary_model")

            if outputs:
                node_outputs.append({
                    "node_id": node_id,
                    "node_type": node_kind,
                    "outputs": outputs,
                })

        return node_outputs

    def create_workflow(self, payload: WorkflowCreate) -> Workflow:
        extra_data = payload.model_dump(exclude={"name", "description", "nodes", "edges"})
        workflow = Workflow.create(
            name=payload.name,
            description=payload.description,
            nodes=payload.nodes,
            edges=payload.edges,
            **extra_data,
        )
        self._workflows[workflow.workflow_id] = workflow
        return workflow

    def list_workflows(self) -> list[Workflow]:
        return list(self._workflows.values())

    def get_workflow(self, workflow_id: UUID) -> Workflow | None:
        return self._workflows.get(workflow_id)

    def update_workflow(self, workflow_id: UUID, payload: WorkflowUpdate) -> Workflow | None:
        workflow = self._workflows.get(workflow_id)
        if workflow is None:
            return None

        extra_data = payload.model_dump(exclude={"name", "description", "nodes", "edges"})
        updated = workflow.model_copy(update={
            "name": payload.name,
            "description": payload.description,
            "nodes": payload.nodes,
            "edges": payload.edges,
            "updated_at": datetime.now(timezone.utc),
            **extra_data,
        })
        self._workflows[workflow_id] = updated
        return updated

    def execute_workflow(self, workflow_id: UUID) -> dict[str, Any] | None:
        workflow = self._workflows.get(workflow_id)
        if workflow is None:
            return None

        workflow_payload = workflow.model_dump(mode="python")
        workflow_payload["workflow_id"] = str(workflow_payload["workflow_id"])
        execution_id = str(uuid4())
        logger.warning(
            "WORKFLOW_EXECUTE_DEBUG SERVICE execution_id=%s workflow_id=%s node_ids=%s",
            execution_id,
            workflow_payload["workflow_id"],
            [node.get("id") for node in workflow_payload.get("nodes") or []],
        )

        graph = self._graph_builder.build_graph(workflow_payload)
        result = graph.invoke(
            {
                "workflow_id": workflow_payload["workflow_id"],
                "execution_id": execution_id,
                "current_node": None,
                "execution_status": "pending",
                "execution_log": [],
                "workflow_data": workflow_payload,
            }
        )

        if result.get("execution_status") == "failed":
            failed_node_ids = [node for node in list(result.get("failed_node_ids") or []) if isinstance(node, str)]
            current_node = result.get("current_node")
            skipped_nodes = set(result.get("skipped_nodes") or [])
            if isinstance(current_node, str) and current_node not in failed_node_ids and current_node not in skipped_nodes:
                failed_node_ids.append(current_node)
            result["failed_node_ids"] = failed_node_ids

        monitoring_chain = [
            node_types.SUPERVISOR,
            node_types.FAILURE_DETECTION,
            node_types.RAG_INCIDENT_MEMORY,
            node_types.AUTO_HEALING,
        ]

        for node_type in monitoring_chain:
            agent = self._agent_registry.get_agent(node_type)
            if agent is not None:
                result = agent.execute(result)

        workflow_node_ids = [
            node.get("id")
            for node in workflow_payload.get("nodes") or []
            if isinstance(node, dict) and isinstance(node.get("id"), str)
        ]
        node_details = [dict(detail) for detail in (result.get("supervisor_node_details") or [])]
        failed_stage_names = {
            str(stage) for stage in (result.get("failed_stages") or []) if isinstance(stage, str)
        }
        failed_node_ids_state = {
            node_id for node_id in (result.get("failed_node_ids") or []) if isinstance(node_id, str)
        }
        skipped_node_ids_state = {
            node_id for node_id in (result.get("skipped_nodes") or []) if isinstance(node_id, str)
        }
        terminal_status: dict[str, str] = {}
        for entry in result.get("execution_log") or []:
            if not isinstance(entry, str):
                continue
            for detail in node_details:
                node_id = detail.get("node_id")
                if not isinstance(node_id, str):
                    continue
                if f"- {node_id} completed (" in entry:
                    terminal_status[node_id] = "completed"
                elif f"- {node_id} failed (" in entry:
                    terminal_status[node_id] = "failed"
        for detail in node_details:
            node_id = detail.get("node_id")
            if node_id in failed_node_ids_state or terminal_status.get(node_id) == "failed":
                detail["status"] = "failed"
            elif node_id in skipped_node_ids_state or terminal_status.get(node_id) == "skipped":
                detail["status"] = "skipped"
            elif terminal_status.get(node_id) == "completed":
                detail["status"] = "completed"
            elif terminal_status.get(node_id) == "failed" or detail.get("node_name") in failed_stage_names:
                detail["status"] = "failed"
        result["supervisor_node_details"] = node_details
        result["node_details"] = node_details
        failed_node_ids = [
            detail.get("node_id") for detail in node_details
            if detail.get("status") == "failed" and isinstance(detail.get("node_id"), str)
        ]
        skipped_node_ids = [
            detail.get("node_id") for detail in node_details
            if detail.get("status") == "skipped" and isinstance(detail.get("node_id"), str)
        ]
        executed_node_ids = [
            detail.get("node_id") for detail in node_details
            if detail.get("status") in {"completed", "failed", "skipped"}
            and isinstance(detail.get("node_id"), str)
        ]
        completed_node_ids = [
            detail.get("node_id") for detail in node_details
            if detail.get("status") == "completed" and isinstance(detail.get("node_id"), str)
        ]
        pending_node_ids = [
            node_id for node_id in workflow_node_ids
            if node_id not in completed_node_ids
            and node_id not in failed_node_ids
            and node_id not in skipped_node_ids
        ]
        if not pending_node_ids and not failed_node_ids:
            result["current_node"] = None
        result["completed_node_ids"] = completed_node_ids
        result["pending_node_ids"] = pending_node_ids
        result["current_running_node"] = result.get("supervisor_metrics", {}).get("current_running_node")

        node_outputs = self._build_node_outputs(result, workflow_payload)

        # persist last execution state for potential approval/resume
        try:
            self._last_execution_state[workflow_id] = result
        except Exception:
            pass

        return {
            "execution_id": execution_id,
            "workflow_id": workflow_payload["workflow_id"],
            "execution_status": result.get("execution_status", "unknown"),
            "workflow_health": result.get("workflow_health", "Unknown"),
            "workflow_summary": result.get("workflow_summary", ""),
            "completed_stages": result.get("completed_stages", []),
            "failed_stages": result.get("failed_stages", []),
            "skipped_stages": result.get("skipped_stages", []),
            "executed_node_ids": result.get("executed_nodes", []),
            "completed_node_ids": result.get("completed_node_ids", []),
            "failed_node_ids": result.get("failed_node_ids", []),
            "skipped_node_ids": result.get("skipped_nodes", []),
            "pending_node_ids": result.get("pending_node_ids", []),
            "current_node_id": result.get("current_running_node"),
            "classification": result.get("classification"),
            "classifier_input_field": result.get("classifier_input_field"),
            "classifier_categories": result.get("classifier_categories", []),
            "classifier_provider": result.get("classifier_provider"),
            "classifier_model": result.get("classifier_model"),
            "extracted_data": result.get("extracted_data"),
            "extractor_input_field": result.get("extractor_input_field"),
            "extractor_fields": result.get("extractor_fields", []),
            "extractor_provider": result.get("extractor_provider"),
            "extractor_model": result.get("extractor_model"),
            "summary": result.get("summary"),
            "summary_input_field": result.get("summary_input_field"),
            "summary_provider": result.get("summary_provider"),
            "summary_model": result.get("summary_model"),
            "failure_category": result.get("failure_category", "None"),
            "failure_severity": result.get("failure_severity", "Low"),
            "incident_matches": result.get("incident_matches", []),
            "recommended_resolution": result.get("recommended_resolution", ""),
            "healing_strategy": result.get("healing_strategy", "No Recovery Needed"),
            "healing_status": result.get("healing_status", "Not Required"),
            "supervisor_timeline": result.get("supervisor_timeline", []),
            "supervisor_metrics": result.get("supervisor_metrics", {}),
            "supervisor_node_details": result.get("supervisor_node_details", []),
            "node_details": result.get("node_details", []),
            "supervisor_summary": result.get("supervisor_summary", ""),
            "node_outputs": node_outputs,
            "execution_log": result.get("execution_log", []),
        }

    def delete_workflow(self, workflow_id: UUID) -> bool:
        return self._workflows.pop(workflow_id, None) is not None

    def approve_workflow(self, workflow_id: UUID, approver: str | None = None, reason: str | None = None) -> dict | None:
        workflow = self._workflows.get(workflow_id)
        if workflow is None:
            return None

        workflow_payload = workflow.model_dump(mode="python")
        workflow_payload["workflow_id"] = str(workflow_payload["workflow_id"])

        last_state = self._last_execution_state.get(workflow_id)
        if not last_state:
            # nothing to resume; run full execute
            return self.execute_workflow(workflow_id)

        # record approval decision and add explicit log entries
        approve_time = datetime.now(timezone.utc).isoformat()

        # Debug: log state before updating
        logger.debug("[approve_workflow] before update: workflow_id=%s, current_node=%s, execution_status=%s, approval_status=%s", workflow_id, last_state.get('current_node'), last_state.get('execution_status'), last_state.get('approval_status'))

        # Update approval metadata and transition state so execution can resume
        last_state["approval_status"] = "approved"
        last_state["execution_status"] = "running"
        last_state["approved_by"] = approver or "User"
        last_state["approval_reason"] = reason
        last_state["approval_timestamp"] = approve_time

        last_state.setdefault("execution_log", []).append(f"{approve_time} - Approval received by {approver or 'User'}: {reason or ''}")
        last_state.setdefault("execution_log", []).append(f"{approve_time} - Approved by {approver or 'User'}")
        last_state.setdefault("execution_log", []).append(f"{approve_time} - Workflow Resumed")
        last_state["approval"] = {"approver": approver, "reason": reason, "time": approve_time}

        # Debug: log state after approval update
        logger.debug("[approve_workflow] after update: approval_status=%s, execution_status=%s, current_node=%s", last_state.get('approval_status'), last_state.get('execution_status'), last_state.get('current_node'))

        # Attempt to advance the current_node to the approval node's outgoing target so the graph resumes
        approval_node = last_state.get("current_node")
        # If the recorded current_node isn't an approval node (common if graph advanced), try to find the last executed approval node
        nodes = workflow_payload.get("nodes") or []
        node_map = {n.get("id"): n for n in nodes if isinstance(n, dict)}
        approval_node_type = None
        if isinstance(approval_node, str) and node_map.get(approval_node):
            approval_node_type = (
                (node_map.get(approval_node).get("data") or {}).get("kind")
                or (node_map.get(approval_node).get("data") or {}).get("type")
                or node_map.get(approval_node).get("type")
            )

        if not isinstance(approval_node_type, str) or approval_node_type.lower() != "approval":
            # look through executed nodes in reverse to find the most recent approval node
            executed_nodes = list(last_state.get("executed_nodes") or [])
            found = None
            for nid in reversed(executed_nodes):
                meta = node_map.get(nid)
                if not meta:
                    continue
                kind = (
                    (meta.get("data") or {}).get("kind")
                    or (meta.get("data") or {}).get("type")
                    or meta.get("type")
                )
                if isinstance(kind, str) and kind.lower() == "approval":
                    found = nid
                    break
            if found:
                logger.debug("[approve_workflow] located approval node from executed_nodes: %s", found)
                approval_node = found
            else:
                logger.debug("[approve_workflow] current_node %s is not an approval node and no executed approval node found", last_state.get('current_node'))

        next_node = None
        edges = workflow_payload.get("edges") or []
        for edge in edges:
            if not isinstance(edge, dict):
                continue
            if edge.get("source") == approval_node:
                # prefer direct outgoing edge (no sourceHandle) if present
                if not edge.get("sourceHandle"):
                    next_node = edge.get("target")
                    break
                # otherwise, fallback to first matching edge
                if next_node is None:
                    next_node = edge.get("target")

        # If a next node was found, set current_node to it so graph.invoke will start executing from there
        if next_node:
            last_state["current_node"] = next_node
            logger.debug("[approve_workflow] advanced current_node to next_node=%s", next_node)
        else:
            # No outgoing edge found — keep current_node as-is. Graph invoke may not advance; we'll still call monitoring.
            logger.debug("[approve_workflow] no outgoing edge found from approval_node=%s; keeping current_node as-is", approval_node)

        # Debug: before invoking graph
        logger.debug("[approve_workflow] Invoking graph.invoke with current_node=%s execution_status=%s", last_state.get('current_node'), last_state.get('execution_status'))

        # Pre-invoke snapshot: capture key fields from last_state so we can compare with graph.invoke() output
        def _pre_snap(s: dict) -> dict:
            return {
                "execution_status": s.get("execution_status"),
                "workflow_health": s.get("workflow_health"),
                "workflow_summary": s.get("workflow_summary"),
                "completed_stages": s.get("completed_stages") or [],
                "failed_stages": s.get("failed_stages") or [],
                "skipped_stages": s.get("skipped_stages") or [],
                "executed_node_ids": s.get("executed_nodes") or [],
            }

        pre_invoke_last_state_snap = _pre_snap(last_state)
        logger.debug("[approve_workflow] pre-invoke last_state snapshot: %s", pre_invoke_last_state_snap)

        def _normalize_waiting_node_metrics(state: dict[str, any], completion_time: str) -> None:
            node_metrics = state.setdefault("node_metrics", {})
            executed_nodes = set(state.get("executed_nodes") or [])
            for node_id, metrics in node_metrics.items():
                status = metrics.get("status")
                if status in {"waiting_approval", "pending_manager_approval", "waiting_for_approval", "pending"} and node_id in executed_nodes:
                    metrics["status"] = "completed"
                    if not metrics.get("end_time"):
                        metrics["end_time"] = completion_time
                    if metrics.get("duration_ms") is None:
                        metrics["duration_ms"] = 0

        try:
            _normalize_waiting_node_metrics(last_state, approve_time)
        except Exception:
            logger.debug("[approve_workflow] failed to normalize waiting node metrics before resume; continuing")

        # resume execution from last state
        start_node = last_state.get("current_node")
        graph = self._graph_builder.build_graph(workflow_payload, start_node=start_node)
        result = graph.invoke(last_state)

        # Debug: after graph.invoke (before monitoring)
        def _snap(r: dict) -> dict:
            return {
                "execution_status": r.get("execution_status"),
                "workflow_health": r.get("workflow_health"),
                "workflow_summary": r.get("workflow_summary"),
                "completed_stages": r.get("completed_stages") or r.get("completed_stages", []),
                "failed_stages": r.get("failed_stages") or r.get("failed_stages", []),
                "skipped_stages": r.get("skipped_stages") or r.get("skipped_stages", []),
                "executed_node_ids": r.get("executed_nodes") or r.get("executed_nodes", []),
            }

        pre_monitor_snap = _snap(result)
        logger.debug("[approve_workflow] post-invoke (pre-monitor) snapshot: %s", pre_monitor_snap)
        logger.debug("[approve_workflow] execution_log (tail 10): %s", result.get('execution_log', [])[-10:])

        # run monitoring chain and trace changes after each agent
        monitoring_chain = [
            node_types.SUPERVISOR,
            node_types.FAILURE_DETECTION,
            node_types.RAG_INCIDENT_MEMORY,
            node_types.AUTO_HEALING,
        ]

        def _contains_keyword(lst, keyword: str) -> bool:
            if not isinstance(lst, (list, tuple)):
                return False
            for item in lst:
                if isinstance(item, str) and keyword.lower() in item.lower():
                    return True
            return False

        culprit = None
        for node_type in monitoring_chain:
            agent = self._agent_registry.get_agent(node_type)
            if agent is None:
                continue
            before_snap = _snap(result)
            logger.debug("[approve_workflow] BEFORE agent %s: %s", node_type, before_snap)

            result = agent.execute(result)

            after_snap = _snap(result)
            logger.debug("[approve_workflow] AFTER agent %s: %s", node_type, after_snap)

            # detect first time the stale indicators appear
            if not culprit and _contains_keyword(after_snap.get("failed_stages", []), "approval") and _contains_keyword(after_snap.get("skipped_stages", []), "supervisor"):
                culprit = node_type
                logger.debug("[approve_workflow] Agent that introduced stale state: %s", culprit)
                # continue to collect remaining agents' output for context but mark culprit

        if not culprit:
            logger.debug("[approve_workflow] No monitoring agent introduced the 'Approval failed / Supervisor skipped' pattern.")
        else:
            logger.debug("[approve_workflow] Culprit agent (first observed): %s", culprit)

        # append supervisor/completion logs
        ts = datetime.now(timezone.utc).isoformat()
        result.setdefault("execution_log", [])
        result.setdefault("executed_nodes", [])
        result.setdefault("completed_stages", [])
        result.setdefault("failed_stages", [])
        result.setdefault("skipped_stages", [])

        result.setdefault("execution_log", []).append(f"{ts} - Supervisor executed")
        # If the graph indicates completion, mark workflow completed log entry
        if result.get("execution_status") in ("completed", "success", "succeeded"):
            result.setdefault("execution_log", []).append(f"{ts} - Workflow completed")

        # Clean up lingering approval / waiting flags that may remain in state after approval
        for flag in ("waiting_approval", "pending_manager_approval", "waiting_for_approval", "pending"):
            if flag in result:
                result.pop(flag, None)

        # Ensure approval node metrics are marked completed when approval succeeded
        def _normalize_approval_metrics(state: dict[str, any], node_id: str | None, completion_time: str) -> None:
            if not node_id:
                return
            node_metrics = state.setdefault("node_metrics", {})
            metrics = node_metrics.setdefault(node_id, {})
            status = metrics.get("status")
            if status in {"waiting_approval", "pending_manager_approval", "waiting_for_approval", "pending", None}:
                metrics["status"] = "completed"
            if not metrics.get("end_time"):
                metrics["end_time"] = completion_time
            if metrics.get("duration_ms") is None:
                metrics["duration_ms"] = 0
            if node_id not in state.setdefault("executed_nodes", []):
                state["executed_nodes"].append(node_id)

        try:
            approval_id_local = approval_node if isinstance(approval_node, str) else None
            _normalize_approval_metrics(result, approval_id_local, ts)
        except Exception:
            logger.debug("[approve_workflow] failed to normalize approval node metrics; continuing")

        node_outputs = self._build_node_outputs(result, workflow_payload)

        # Recalculate stage lists and workflow summary so UI gets fresh state after resume
        nodes_list = workflow_payload.get("nodes") or []
        node_map = {n.get("id"): n for n in nodes_list if isinstance(n, dict)}

        def _node_display_name(nid: str) -> str:
            meta = node_map.get(nid) or {}
            data = meta.get("data") or {}
            return (
                data.get("name")
                or data.get("label")
                or data.get("title")
                or meta.get("name")
                or nid
            )

        executed_nodes = list(result.get("executed_nodes") or [])
        failed_node_ids = list(result.get("failed_node_ids") or [])
        # support legacy keys
        if not failed_node_ids:
            failed_node_ids = list(result.get("failed_nodes") or [])
        skipped_node_ids = list(result.get("skipped_node_ids") or [])
        if not skipped_node_ids:
            skipped_node_ids = list(result.get("skipped_nodes") or [])

        # If approval was just accepted, ensure approval node is not left in failed/skipped lists
        approval_id = None
        try:
            approval_id = approval_node if isinstance(approval_node, str) else None
        except Exception:
            approval_id = None

        # If approval succeeded according to the post-invoke result, ensure approval node is removed from failed/skipped lists
        if approval_id and result.get("approval_status") == "approved":
            if approval_id in failed_node_ids:
                failed_node_ids = [nid for nid in failed_node_ids if nid != approval_id]
            if approval_id in skipped_node_ids:
                skipped_node_ids = [nid for nid in skipped_node_ids if nid != approval_id]
            # Ensure approval appears in completed/executed if it was executed
            if approval_id in executed_nodes and approval_id not in result.get("executed_nodes", []):
                executed_nodes.append(approval_id)

        # Normalize lists: remove any skipped nodes that are actually executed or failed
        skipped_node_ids = [nid for nid in skipped_node_ids if nid not in executed_nodes and nid not in failed_node_ids]

        # Build human-friendly stage lists
        completed_node_ids = [nid for nid in executed_nodes if nid not in failed_node_ids]
        completed_stages = [_node_display_name(nid) for nid in completed_node_ids]
        failed_stages = [_node_display_name(nid) for nid in failed_node_ids]
        skipped_stages = [_node_display_name(nid) for nid in skipped_node_ids]

        # Compute pending nodes and completion percentage
        node_ids = [n.get("id") for n in nodes_list if isinstance(n, dict) and n.get("id")]
        total_nodes = len(node_ids)
        executed_set = set(executed_nodes)
        failed_set = set(failed_node_ids)
        skipped_set = set(skipped_node_ids)
        pending_node_ids = [nid for nid in node_ids if nid not in executed_set and nid not in failed_set and nid not in skipped_set]

        # If there are no pending runnable nodes, mark execution as completed
        if not pending_node_ids and result.get("execution_status") not in ("failed", "error"):
            result["execution_status"] = "completed"
            result["workflow_completion"] = 100
            result["workflow_completion_pct"] = 100
            result["current_node"] = None
            result["pending_node_ids"] = []
            result["pending_nodes"] = 0
        else:
            # compute workflow completion percent based on completed nodes
            completed_count = len([nid for nid in completed_node_ids]) if total_nodes > 0 else 0
            percent = int((completed_count / total_nodes) * 100) if total_nodes > 0 else 0
            result["workflow_completion"] = percent
            result["workflow_completion_pct"] = percent
            result["pending_node_ids"] = pending_node_ids
            result["pending_nodes"] = len(pending_node_ids)

        # Recompute workflow_health from the latest state after resuming execution.
        workflow_health = result.get("workflow_health")
        exec_status = str(result.get("execution_status") or "").lower()
        if exec_status in ("completed", "success", "succeeded"):
            # Completed workflows are healthy only when there are no failed stages.
            if failed_node_ids:
                workflow_health = "Failed"
            else:
                workflow_health = "Healthy"
        elif workflow_health is None:
            if exec_status == "waiting_approval":
                workflow_health = "Waiting"
            elif exec_status == "running":
                workflow_health = "Running"
            elif exec_status in ("failed", "error"):
                workflow_health = "Failed"
            else:
                workflow_health = "Warning"

        # Compose a fresh workflow summary
        if failed_stages:
            workflow_summary = f"Workflow health: {workflow_health} | Failed stages: {', '.join(failed_stages)}"
        else:
            workflow_summary = f"Workflow health: {workflow_health} | Completed stages: {', '.join(completed_stages)}"

        # Attach recalculated values back into result
        result["completed_stages"] = completed_stages
        result["failed_stages"] = failed_stages
        result["skipped_stages"] = skipped_stages
        result["workflow_health"] = workflow_health
        result["workflow_summary"] = workflow_summary
        result["failed_node_ids"] = failed_node_ids
        result["skipped_node_ids"] = skipped_node_ids
        result["executed_nodes"] = executed_nodes

        # ensure both legacy and new completion keys are present
        try:
            result["workflow_completion_pct"] = int(result.get("workflow_completion", 0))
            result["workflow_completion"] = int(result.get("workflow_completion", 0))
        except Exception:
            result["workflow_completion_pct"] = result.get("workflow_completion") or 0
            result["workflow_completion"] = result.get("workflow_completion") or 0

        # If workflow has completed, make sure the supervisor metrics reflect no running node
        supervisor_metrics = result.get("supervisor_metrics")
        if isinstance(supervisor_metrics, dict) and result.get("execution_status") in ("completed", "success", "succeeded"):
            supervisor_metrics["current_running_node"] = None
            supervisor_metrics["pending_nodes"] = 0
            supervisor_metrics["workflow_completion_pct"] = int(result.get("workflow_completion_pct", 0))
            result["supervisor_metrics"] = supervisor_metrics

        # persist updated execution state so subsequent Monitoring calls/readers see fresh state
        try:
            self._last_execution_state[workflow_id] = result
        except Exception:
            pass

        return {
            "execution_status": result.get("execution_status", "unknown"),
            "workflow_health": result.get("workflow_health", "Unknown"),
            "workflow_summary": result.get("workflow_summary", ""),
            "completed_stages": result.get("completed_stages", []),
            "failed_stages": result.get("failed_stages", []),
            "skipped_stages": result.get("skipped_stages", []),
            "executed_node_ids": result.get("executed_nodes", []),
            "failed_node_ids": result.get("failed_node_ids", []),
            "skipped_node_ids": result.get("skipped_node_ids", []),
            "current_node_id": result.get("current_node"),
            "classification": result.get("classification"),
            "classifier_input_field": result.get("classifier_input_field"),
            "classifier_categories": result.get("classifier_categories", []),
            "classifier_provider": result.get("classifier_provider"),
            "classifier_model": result.get("classifier_model"),
            "extracted_data": result.get("extracted_data"),
            "extractor_input_field": result.get("extractor_input_field"),
            "extractor_fields": result.get("extractor_fields", []),
            "extractor_provider": result.get("extractor_provider"),
            "extractor_model": result.get("extractor_model"),
            "summary": result.get("summary"),
            "summary_input_field": result.get("summary_input_field"),
            "summary_provider": result.get("summary_provider"),
            "summary_model": result.get("summary_model"),
            "failure_category": result.get("failure_category", "None"),
            "failure_severity": result.get("failure_severity", "Low"),
            "incident_matches": result.get("incident_matches", []),
            "recommended_resolution": result.get("recommended_resolution", ""),
            "healing_strategy": result.get("healing_strategy", "No Recovery Needed"),
            "healing_status": result.get("healing_status", "Not Required"),
            "supervisor_timeline": result.get("supervisor_timeline", []),
            "supervisor_metrics": result.get("supervisor_metrics", {}),
            "supervisor_node_details": result.get("supervisor_node_details", []),
            "supervisor_summary": result.get("supervisor_summary", ""),
            "node_outputs": node_outputs,
            "execution_log": result.get("execution_log", []),
            "workflow_completion_pct": result.get("workflow_completion_pct", 0),
        }

    def reject_workflow(self, workflow_id: UUID, rejected_by: str | None = None, reason: str | None = None) -> dict | None:
        workflow = self._workflows.get(workflow_id)
        if workflow is None:
            return None

        last_state = self._last_execution_state.get(workflow_id)
        if not last_state:
            # no prior execution — mark as failed
            last_state = {"execution_status": "failed", "execution_log": []}

        last_state["execution_status"] = "failed"
        rej_time = datetime.now(timezone.utc).isoformat()
        last_state.setdefault("execution_log", []).append(f"{rej_time} - Approval requested")
        last_state.setdefault("execution_log", []).append(f"{rej_time} - Rejected by {rejected_by or 'User'}: {reason or ''}")
        last_state.setdefault("execution_log", []).append(f"{rej_time} - Workflow Terminated")

        # persist
        try:
            self._last_execution_state[workflow_id] = last_state
        except Exception:
            pass

        return {
            "execution_status": last_state.get("execution_status", "failed"),
            "workflow_health": last_state.get("workflow_health", "Failed"),
            "workflow_summary": last_state.get("workflow_summary", ""),
            "completed_stages": last_state.get("completed_stages", []),
            "failed_stages": last_state.get("failed_stages", []),
            "skipped_stages": last_state.get("skipped_stages", []),
            "executed_node_ids": last_state.get("executed_nodes", []),
            "failed_node_ids": last_state.get("failed_node_ids", []),
            "skipped_node_ids": last_state.get("skipped_nodes", []),
            "current_node_id": last_state.get("current_node"),
            "supervisor_timeline": last_state.get("supervisor_timeline", []),
            "supervisor_metrics": last_state.get("supervisor_metrics", {}),
            "supervisor_node_details": last_state.get("supervisor_node_details", []),
            "supervisor_summary": last_state.get("supervisor_summary", ""),
            "node_outputs": [],
            "execution_log": last_state.get("execution_log", []),
        }

