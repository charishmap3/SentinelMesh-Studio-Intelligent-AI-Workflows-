from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from agents.base_agent import BaseAgent
from constants import node_types
from graph.state import WorkflowState


class SupervisorAgent(BaseAgent):
    def _workflow_nodes(self, state: WorkflowState) -> list[dict[str, Any]]:
        workflow_data = state.get("workflow_data") or {}
        nodes = workflow_data.get("nodes") or []
        return [node for node in nodes if isinstance(node, dict)]

    def _workflow_node_names(self, state: WorkflowState) -> set[str]:
        names: set[str] = set()
        for node in self._workflow_nodes(state):
            node_data = node.get("data") if isinstance(node.get("data"), dict) else {}
            node_type = node_data.get("kind") or node.get("type")
            if node_type:
                names.add(str(node_type))
        return names

    def _workflow_stage_names(self, state: WorkflowState) -> list[str]:
        stage_names: list[str] = []
        for node in self._workflow_nodes(state):
            node_data = node.get("data") if isinstance(node.get("data"), dict) else {}
            label = node_data.get("label") or node.get("id") or node.get("type")
            node_kind = node_data.get("kind") or node.get("type")
            if node_kind in {"email-trigger", "Email Trigger", "condition", "Condition", "llm", "LLM", "send-email", "Send Email"}:
                stage_names.append(str(label))
        return stage_names

    def _display_label(self, node: dict[str, Any]) -> str:
        node_data = node.get("data") if isinstance(node.get("data"), dict) else {}
        label = node_data.get("label")
        if isinstance(label, str) and label.strip():
            return label.strip()

        kind = node_data.get("kind") or node.get("type")
        if isinstance(kind, str) and kind.strip():
            return " ".join(part.capitalize() for part in kind.replace("_", "-").split("-"))

        return str(node.get("id") or node.get("type") or "Node")

    def _is_generic_execution_node(self, node: dict[str, Any]) -> bool:
        node_data = node.get("data") if isinstance(node.get("data"), dict) else {}
        node_kind = node_data.get("kind") or node.get("type")
        if node_kind in {None, "supervisor", "Supervisor", "failure-detection", "Failure Detection", "rag-incident-memory", "RAG Incident Memory", "auto-healing", "Auto Healing"}:
            return False
        if node_kind in {"requirement-validation", "Requirement Validation", "inventory", "Inventory", "vendor-selection", "Vendor Selection", "budget-validation", "Budget Validation", "approval", "Approval", "purchase-order", "Purchase Order"}:
            return False
        return True

    def _stage_key(self, node_kind: str | None) -> str | None:
        if node_kind is None:
            return None
        if node_kind in {"requirement-validation", "Requirement Validation"}:
            return node_types.REQUIREMENT_VALIDATION
        if node_kind in {"inventory", "Inventory"}:
            return node_types.INVENTORY
        if node_kind in {"vendor-selection", "Vendor Selection"}:
            return node_types.VENDOR_SELECTION
        if node_kind in {"budget-validation", "Budget Validation"}:
            return node_types.BUDGET_VALIDATION
        if node_kind in {"approval", "Approval"}:
            return node_types.APPROVAL
        if node_kind in {"purchase-order", "Purchase Order"}:
            return node_types.PURCHASE_ORDER
        if node_kind in {"email-trigger", "Email Trigger", "condition", "Condition", "llm", "LLM", "send-email", "Send Email"}:
            return str(node_kind)
        return None

    def execute(self, state: WorkflowState) -> WorkflowState:
        # Debug: indicate supervisor execution entry
        import logging
        logger = logging.getLogger(__name__)
        try:
            logger.debug("[SupervisorAgent] executed: current_node=%s, execution_status=%s", state.get('current_node'), state.get('execution_status'))
        except Exception:
            logger.debug("[SupervisorAgent] executed (failed to read state)")
        execution_log = list(state.get("execution_log") or [])
        errors = list(state.get("errors") or [])
        execution_status = state.get("execution_status")
        workflow_nodes = self._workflow_node_names(state)
        available_stages = {self._stage_key(node_kind) for node_kind in workflow_nodes if self._stage_key(node_kind) is not None}
        procurement_stage_names = {
            node_types.REQUIREMENT_VALIDATION,
            node_types.INVENTORY,
            node_types.VENDOR_SELECTION,
            node_types.BUDGET_VALIDATION,
            node_types.APPROVAL,
            node_types.PURCHASE_ORDER,
        }
        generic_stage_names = {
            "email-trigger",
            "Email Trigger",
            "condition",
            "Condition",
            "llm",
            "LLM",
            "send-email",
            "Send Email",
        }
        has_procurement_nodes = any(stage in procurement_stage_names for stage in available_stages)
        has_generic_nodes = any(stage in generic_stage_names for stage in available_stages)
        has_procurement_state = any(
            state.get(field_name) is not None
            for field_name in [
                "validation_passed",
                "inventory_checked",
                "vendor_selection_completed",
                "budget_validation_passed",
                "approval_status",
                "purchase_order_generated",
            ]
        )
        if not workflow_nodes and not has_procurement_state:
            available_stages.update(procurement_stage_names)
        if state.get("validation_passed") is not None:
            available_stages.add(node_types.REQUIREMENT_VALIDATION)
        if state.get("inventory_checked") is not None:
            available_stages.add(node_types.INVENTORY)
        if state.get("vendor_selection_completed") is not None:
            available_stages.add(node_types.VENDOR_SELECTION)
        if state.get("budget_validation_passed") is not None:
            available_stages.add(node_types.BUDGET_VALIDATION)
        if state.get("approval_status") is not None:
            available_stages.add(node_types.APPROVAL)
        if state.get("purchase_order_generated") is not None:
            available_stages.add(node_types.PURCHASE_ORDER)
        has_procurement_nodes = any(stage in procurement_stage_names for stage in available_stages)
        is_explicitly_generic_workflow = bool(workflow_nodes) and not has_procurement_nodes and has_generic_nodes

        completed_stages: list[str] = []
        failed_stages: list[str] = []
        skipped_stages: list[str] = []
        waiting_stages: list[str] = []

        generic_nodes: list[dict[str, Any]] = []
        for node in self._workflow_nodes(state):
            if self._is_generic_execution_node(node):
                generic_nodes.append(node)
        

        executed_nodes = list(state.get("executed_nodes") or [])
        skipped_nodes = list(state.get("skipped_nodes") or [])
        failed_node_ids_state = {
            node_id for node_id in (state.get("failed_node_ids") or []) if isinstance(node_id, str)
        }
        terminal_node_status: dict[str, str] = {}
        for entry in execution_log:
            if not isinstance(entry, str):
                continue
            for node_id in [node.get("id") for node in self._workflow_nodes(state) if isinstance(node.get("id"), str)]:
                if f"- {node_id} completed (" in entry:
                    terminal_node_status[node_id] = "completed"
                elif f"- {node_id} failed (" in entry:
                    terminal_node_status[node_id] = "failed"
        current_node_id = state.get("current_node")
        
        failure_node_id = current_node_id if (execution_status == "failed" or errors) and current_node_id else None
        no_messages_detected = execution_status == "no_messages" and any(
            "found no matching messages" in entry for entry in execution_log
        )

        failure_index = None
        generic_node_ids = [node.get("id") for node in generic_nodes]
        if failure_node_id is not None and failure_node_id in generic_node_ids:
            failure_index = generic_node_ids.index(failure_node_id)

        # If there is no explicit executed_nodes list, infer progress from current_node
        success_index = None
        current_node_id = state.get("current_node")
        if executed_nodes == [] and current_node_id and execution_status in {"received", "completed"}:
            try:
                success_index = [node.get("id") for node in generic_nodes].index(current_node_id)
            except ValueError:
                success_index = None
        

        # If this is an explicitly generic workflow and we have no executed_nodes recorded
        # but the workflow status indicates work was received/completed, assume generic
        # nodes were completed (e.g., Email Trigger-only flows that report `received`).
        generic_auto_completed = False
        if is_explicitly_generic_workflow and execution_status in {"received", "completed"} and not executed_nodes and not skipped_nodes:
            # Only auto-complete email-trigger nodes for received-only generic workflows.
            auto_completed: list[str] = []
            for node in generic_nodes:
                node_data = node.get("data") if isinstance(node.get("data"), dict) else {}
                if node_data.get("kind") in {"email-trigger", "Email Trigger"}:
                    label = node_data.get("label") or node.get("id") or node.get("type")
                    auto_completed.append(str(label))
            if auto_completed and all((n.get("data") or {}).get("kind") in {"email-trigger", "Email Trigger"} for n in generic_nodes):
                completed_stages.extend(auto_completed)
                # Only short-circuit when the workflow contains nothing but email-trigger nodes
                generic_auto_completed = True
        

        failure_context = state.get("failure_context") if isinstance(state.get("failure_context"), dict) else {}
        if failure_context and execution_status == "failed":
            failed_node_id = str(failure_context.get("failed_node_id") or "")
            failed_node_type = str(failure_context.get("failed_node_type") or "Unknown")
            failure_message = str(failure_context.get("failure_message") or "")
            failure_error_type = str(failure_context.get("failure_error_type") or "UnknownError")
            diagnosis_parts = [
                f"Node {failed_node_id} failed during execution",
                f"Node type: {failed_node_type}",
                f"Error: {failure_message}",
                f"Exception type: {failure_error_type}",
            ]
            state["supervisor_diagnosis"] = " | ".join(diagnosis_parts)
            execution_log.append(f"Supervisor diagnosis: {state['supervisor_diagnosis']}")

        # Precompute outgoing targets by node id and source handle.
        branch_outgoing: dict[str, dict[str, str]] = {}
        for edge in (state.get("workflow_data") or {}).get("edges", []) if isinstance((state.get("workflow_data") or {}).get("edges", []), list) else []:
            src = edge.get("source")
            handle = edge.get("sourceHandle")
            tgt = edge.get("target")
            if isinstance(src, str) and isinstance(handle, str) and isinstance(tgt, str):
                branch_outgoing.setdefault(src, {})[handle] = tgt

        marked_nodes: set[str] = set()

        for index, node in enumerate(generic_nodes):
            if generic_auto_completed:
                # we've already recorded completions for generic nodes
                break
            node_data = node.get("data") if isinstance(node.get("data"), dict) else {}
            label = self._display_label(node)
            node_id = node.get("id")
            # Special-case Condition nodes: mark only the taken branch completed
            if node_data.get("kind") in {"condition", "Condition"}:
                completed_stages.append(str(label))
                marked_nodes.add(node_id)
                branches = branch_outgoing.get(node_id, {})
                taken = None
                if state.get("condition_result") is True:
                    taken = branches.get("true")
                elif state.get("condition_result") is False:
                    taken = branches.get("false")
                # mark taken branch as completed and the other branch as skipped
                for handle, target in branches.items():
                    if not target:
                        continue
                    target_label = None
                    for n in generic_nodes:
                        if n.get("id") == target:
                            target_label = self._display_label(n)
                            break
                    if target == taken:
                        if target not in marked_nodes:
                            completed_stages.append(str(target_label or target))
                            marked_nodes.add(target)
                    else:
                        if target not in marked_nodes:
                            skipped_stages.append(str(target_label or target))
                            marked_nodes.add(target)
                # move to next node
                continue
            if node_data.get("kind") in {"router", "Router"}:
                router_failed = terminal_node_status.get(node_id) == "failed" or (
                    node_id in failed_node_ids_state
                    or (failure_node_id and node_id == failure_node_id and node_id not in skipped_nodes)
                )
                if router_failed:
                    failed_stages.append(str(label))
                elif node_id in skipped_nodes:
                    skipped_stages.append(str(label))
                else:
                    completed_stages.append(str(label))
                marked_nodes.add(node_id)
                branches = branch_outgoing.get(node_id, {})
                taken = None
                selected_route = state.get("router_result")
                if isinstance(selected_route, str):
                    taken = branches.get(selected_route)
                for handle, target in branches.items():
                    if not target:
                        continue
                    target_label = None
                    for n in generic_nodes:
                        if n.get("id") == target:
                            target_label = self._display_label(n)
                            break
                    if not router_failed and target == taken:
                        if target not in marked_nodes:
                            completed_stages.append(str(target_label or target))
                            marked_nodes.add(target)
                    else:
                        if target not in marked_nodes:
                            skipped_stages.append(str(target_label or target))
                            marked_nodes.add(target)
                continue
            if node_id in marked_nodes:
                continue
            if terminal_node_status.get(node_id) == "failed" or (
                terminal_node_status.get(node_id) != "completed"
                and (
                    node_id in failed_node_ids_state
                    or (failure_node_id and node_id == failure_node_id and node_id not in skipped_nodes)
                )
            ):
                failed_stages.append(str(label))
            elif node_id in skipped_nodes:
                skipped_stages.append(str(label))
            elif node_id in executed_nodes:
                completed_stages.append(str(label))
            elif execution_status in {"waiting_approval", "pending_manager_approval", "pending"}:
                # Downstream nodes remain pending while the approval gate is paused.
                continue
            elif success_index is not None and index <= success_index:
                completed_stages.append(str(label))
            elif no_messages_detected:
                if node_data.get("kind") in {"email-trigger", "Email Trigger"}:
                    completed_stages.append(str(label))
                else:
                    skipped_stages.append(str(label))
            elif failure_index is not None and index < failure_index:
                completed_stages.append(str(label))
            else:
                skipped_stages.append(str(label))

        if node_types.REQUIREMENT_VALIDATION in available_stages:
            if state.get("validation_passed") is True:
                completed_stages.append(node_types.REQUIREMENT_VALIDATION)
            elif state.get("validation_passed") is None:
                skipped_stages.append(node_types.REQUIREMENT_VALIDATION)
            else:
                failed_stages.append(node_types.REQUIREMENT_VALIDATION)

        if node_types.INVENTORY in available_stages:
            inventory_checked = state.get("inventory_checked")
            if inventory_checked is True and execution_status not in {"failed", "rejected"}:
                completed_stages.append(node_types.INVENTORY)
            elif inventory_checked is None:
                skipped_stages.append(node_types.INVENTORY)
            else:
                failed_stages.append(node_types.INVENTORY)

        if node_types.VENDOR_SELECTION in available_stages:
            vendor_selection_completed = state.get("vendor_selection_completed")
            if vendor_selection_completed is True and execution_status not in {"failed", "rejected"}:
                completed_stages.append(node_types.VENDOR_SELECTION)
            elif vendor_selection_completed is None:
                skipped_stages.append(node_types.VENDOR_SELECTION)
            else:
                failed_stages.append(node_types.VENDOR_SELECTION)

        if node_types.BUDGET_VALIDATION in available_stages:
            if state.get("budget_validation_passed") is True:
                completed_stages.append(node_types.BUDGET_VALIDATION)
            elif state.get("budget_validation_passed") is None:
                skipped_stages.append(node_types.BUDGET_VALIDATION)
            else:
                failed_stages.append(node_types.BUDGET_VALIDATION)

        if node_types.APPROVAL in available_stages:
            approval_status_raw = state.get("approval_status")
            approval_status = approval_status_raw.lower().strip() if isinstance(approval_status_raw, str) else None
            approval_stage_label = next(
                (
                    self._display_label(node)
                    for node in self._workflow_nodes(state)
                    if ((node.get("data") or {}).get("kind") if isinstance(node.get("data"), dict) else None) in {"approval", "Approval"}
                ),
                node_types.APPROVAL,
            )
            # treat various pending/queued values as "completed" for the Approval stage (approval node executed and awaiting user action)
            if approval_status in {"approved", "approved_by_manager", "approved_by_user"}:
                completed_stages.append(approval_stage_label)
            elif approval_status in {"pending manager approval", "pending_manager_approval", "waiting_approval", "pending"}:
                waiting_stages.append(approval_stage_label)
            elif approval_status in {"rejected", "denied"}:
                failed_stages.append(approval_stage_label)
            elif approval_status is None:
                skipped_stages.append(approval_stage_label)
            else:
                # Any unknown textual value should not be immediately treated as failure; treat as skipped to be conservative
                skipped_stages.append(approval_stage_label)

        if node_types.PURCHASE_ORDER in available_stages:
            purchase_order_generated = state.get("purchase_order_generated")
            if purchase_order_generated is True:
                completed_stages.append(node_types.PURCHASE_ORDER)
            elif purchase_order_generated is None:
                skipped_stages.append(node_types.PURCHASE_ORDER)
            elif state.get("approval_status") == "Pending Manager Approval":
                skipped_stages.append(node_types.PURCHASE_ORDER)
            elif execution_status == "failed" or errors:
                failed_stages.append(node_types.PURCHASE_ORDER)
            else:
                skipped_stages.append(node_types.PURCHASE_ORDER)

        failed_stages = list(dict.fromkeys(failed_stages))

        if execution_status in {"waiting_approval", "pending_manager_approval", "pending"}:
            workflow_health = "Waiting for Approval"
        elif execution_status == "failed" or errors:
            workflow_health = "Failed"
        elif state.get("approval_status") == "Pending Manager Approval" and not state.get("purchase_order_generated"):
            workflow_health = "Warning"
        elif not errors and (execution_status == "received" or execution_status == "completed") and not failed_stages and not skipped_stages:
            workflow_health = "Healthy"
        elif not errors and state.get("purchase_order_generated") is True:
            workflow_health = "Healthy"
        elif execution_status == "no_messages" and not errors:
            workflow_health = "Healthy"
        elif is_explicitly_generic_workflow and execution_status in {"received", "completed"}:
            workflow_health = "Healthy"
        elif not errors and state.get("validation_passed") is None and state.get("inventory_checked") is None and state.get("vendor_selection_completed") is None and state.get("budget_validation_passed") is None and state.get("approval_status") is None and state.get("purchase_order_generated") is None:
            workflow_health = "Warning"
        else:
            workflow_health = "Warning"

        summary_parts = [f"Workflow health: {workflow_health}"]
        if completed_stages:
            summary_parts.append(f"Completed stages: {', '.join(completed_stages)}")
        if failed_stages:
            summary_parts.append(f"Failed stages: {', '.join(failed_stages)}")
        if skipped_stages:
            summary_parts.append(f"Skipped stages: {', '.join(skipped_stages)}")
        if waiting_stages:
            summary_parts.append(f"Waiting stages: {', '.join(waiting_stages)}")
        workflow_summary = " | ".join(summary_parts)

        # Build node-level metrics and timeline from instrumentation (node_metrics)
        node_metrics_map = state.get("node_metrics") or {}
        workflow_node_list = self._workflow_nodes(state)
        workflow_node_ids = [
            node.get("id")
            for node in workflow_node_list
            if isinstance(node.get("id"), str)
        ]
        executed_node_ids = {
            node_id for node_id in (state.get("executed_nodes") or []) if isinstance(node_id, str)
        }
        failed_node_ids = {
            node_id for node_id in (state.get("failed_node_ids") or []) if isinstance(node_id, str)
        }
        skipped_node_ids = {
            node_id for node_id in (state.get("skipped_nodes") or []) if isinstance(node_id, str)
        }
        node_details: list[dict[str, Any]] = []
        timeline: list[dict[str, Any]] = []
        durations: list[int] = []
        total_nodes = 0
        completed_nodes_count = 0
        failed_nodes_count = 0
        pending_nodes_count = 0
        skipped_nodes_count = 0
        total_retries = 0

        # map node id -> node meta for display
        node_meta_map = {node.get("id"): node for node in self._workflow_nodes(state)}

        for nid in workflow_node_ids:
            metrics = node_metrics_map.get(nid) or {}
            total_nodes += 1
            node_obj = node_meta_map.get(nid) or {}
            node_data = node_obj.get("data") if isinstance(node_obj.get("data"), dict) else {}
            node_kind = node_data.get("kind") or node_obj.get("type")
            node_name = self._display_label(node_obj) if node_obj else str(nid)

            start_time = metrics.get("start_time")
            end_time = metrics.get("end_time")
            duration = metrics.get("duration_ms")
            status = metrics.get("status")
            if nid in failed_node_ids or terminal_node_status.get(nid) == "failed":
                status = "failed"
            elif nid in skipped_node_ids:
                status = "skipped"
            elif terminal_node_status.get(nid) is not None:
                status = terminal_node_status[nid]
            if terminal_node_status.get(nid) == "completed" and nid not in failed_node_ids and nid not in skipped_node_ids:
                status = "completed"
            elif status in {"failed", "skipped"}:
                status = status
            elif status in {"completed", "success", "succeeded"} or nid in executed_node_ids:
                status = "completed"
            elif status in {"waiting_approval", "pending_manager_approval", "pending"}:
                status = "waiting_approval"
            else:
                status = "pending"
            warnings = metrics.get("warnings") or []
            errors_list = metrics.get("errors") or []
            retry_count = int(metrics.get("retry_count") or 0)
            output_summary = metrics.get("output_summary")

            node_details.append({
                "node_id": nid,
                "node_name": node_name,
                "node_type": str(node_kind) if node_kind is not None else "unknown",
                "start_time": start_time,
                "end_time": end_time,
                "duration_ms": duration,
                "status": status,
                "warnings": warnings,
                "errors": errors_list,
                "retry_count": retry_count,
                "output_summary": output_summary,
            })

            # timeline: started and completed events
            if start_time:
                timeline.append({"timestamp": start_time, "node_id": nid, "node_name": node_name, "event": "started"})
            if end_time:
                timeline.append({
                    "timestamp": end_time,
                    "node_id": nid,
                    "node_name": node_name,
                    "event": "failed" if status == "failed" else "completed",
                    "duration_ms": duration,
                })

            if isinstance(duration, int):
                durations.append(duration)
            if status == "completed":
                completed_nodes_count += 1
            elif status == "failed":
                failed_nodes_count += 1
            elif status == "skipped":
                skipped_nodes_count += 1
            else:
                pending_nodes_count += 1

            total_retries += retry_count

        # sort timeline by timestamp
        try:
            timeline.sort(key=lambda e: e.get("timestamp") or "")
        except Exception:
            pass

        # compute metrics
        average_latency = int(sum(durations) / len(durations)) if durations else 0
        total_execution_time = 0
        if durations:
            total_execution_time = sum(durations)

        workflow_completion_pct = int((completed_nodes_count / total_nodes) * 100) if total_nodes > 0 else 0
        current_running_node = next(
            (
                detail["node_id"]
                for detail in node_details
                if detail.get("status") in {"running", "active", "waiting_approval"}
            ),
            None,
        )
        completed_node_ids = [
            detail["node_id"] for detail in node_details if detail.get("status") == "completed"
        ]
        failed_node_ids_list = [
            detail["node_id"] for detail in node_details if detail.get("status") == "failed"
        ]
        pending_node_ids = [
            detail["node_id"] for detail in node_details if detail.get("status") == "pending"
        ]

        supervisor_metrics = {
            "total_execution_time_ms": total_execution_time,
            "average_node_latency_ms": average_latency,
            "completed_nodes": completed_nodes_count,
            "failed_nodes": failed_nodes_count,
            "pending_nodes": pending_nodes_count,
            "skipped_nodes": skipped_nodes_count,
            "retry_count": total_retries,
            "workflow_completion_pct": workflow_completion_pct,
            "current_running_node": current_running_node,
        }

        # Determine health more holistically
        # If failure detection already populated failure info, preserve existing workflow_health
        preserve_failure = False
        if state.get("failure_category") and str(state.get("failure_category")).strip() and str(state.get("failure_category")).lower() != "none":
            preserve_failure = True

        if not preserve_failure:
            if failed_nodes_count > 0 or (state.get("execution_status") == "failed"):
                workflow_health = "Failed"
            elif state.get("approval_status") in {"waiting_approval", "Pending Manager Approval"}:
                workflow_health = "Waiting for Approval"
            elif (
                total_nodes > 0
                and completed_nodes_count == total_nodes
                and failed_nodes_count == 0
                and pending_nodes_count == 0
                and skipped_nodes_count == 0
            ):
                workflow_health = "Healthy"
            else:
                workflow_health = workflow_health
        else:
            # preserve any workflow_health value set by failure detection or earlier agents
            workflow_health = state.get("workflow_health", workflow_health)

        summary_parts = [f"Workflow health: {workflow_health}"]
        if completed_stages:
            summary_parts.append(f"Completed stages: {', '.join(completed_stages)}")
        if failed_stages:
            summary_parts.append(f"Failed stages: {', '.join(failed_stages)}")
        if skipped_stages:
            summary_parts.append(f"Skipped stages: {', '.join(skipped_stages)}")
        workflow_summary = " | ".join(summary_parts)

        # Human readable summary
        summary_lines: list[str] = []
        if completed_nodes_count > 0:
            summary_lines.append(f"{completed_nodes_count} nodes completed.")
        if failed_nodes_count > 0:
            summary_lines.append(f"{failed_nodes_count} nodes failed.")
        if skipped_nodes_count > 0:
            summary_lines.append(f"{skipped_nodes_count} nodes skipped.")
        if total_retries > 0:
            summary_lines.append(f"{total_retries} retries recorded.")
        if not summary_lines:
            summary_lines.append("No notable events detected.")
        supervisor_summary = " ".join(summary_lines)

        execution_log = [
            entry for entry in execution_log
            if not entry.startswith("Workflow health:")
        ]
        execution_log.append(f"Workflow health: {workflow_health}")
        execution_log.append(workflow_summary)

        # merge back into state
        state["workflow_health"] = workflow_health
        state["completed_stages"] = completed_stages
        state["failed_stages"] = failed_stages
        state["skipped_stages"] = skipped_stages
        state["workflow_summary"] = workflow_summary
        state["supervisor_timestamp"] = datetime.now(timezone.utc).isoformat()
        state["execution_log"] = execution_log
        state["supervisor_timeline"] = timeline
        state["supervisor_metrics"] = supervisor_metrics
        state["supervisor_node_details"] = node_details
        state["supervisor_summary"] = supervisor_summary
        state["completed_node_ids"] = completed_node_ids
        state["failed_node_ids"] = failed_node_ids_list
        state["pending_node_ids"] = pending_node_ids
        state["current_running_node"] = current_running_node
        if "supervisor_diagnosis" not in state:
            state["supervisor_diagnosis"] = ""

        return state
