from __future__ import annotations

from datetime import datetime, timezone

from agents.base_agent import BaseAgent
from graph.state import WorkflowState


class ApprovalAgent(BaseAgent):
    """
    Generic human Approval agent.

    Behavior:
    - When executed, it marks the workflow as waiting for human approval and appends structured logs.
    - It does NOT perform workflow-specific validations (procurement checks, budget checks, auto-approval, or auto-rejection).
    - Actual approve/reject decisions are handled via external actions (e.g., /approve and /reject endpoints) which resume or terminate execution.
    """

    def __init__(self, node_id: str | None = None) -> None:
        self.node_id = node_id

    def execute(self, state: WorkflowState) -> WorkflowState:
        # mark approval requested and pause the workflow until human input
        requested_at = datetime.now(timezone.utc).isoformat()

        state["approval_requested_at"] = requested_at
        # Determine whether this is a procurement workflow (look for procurement-specific fields or nodes)
        workflow_data = state.get("workflow_data") or {}
        nodes = workflow_data.get("nodes") or []
        procurement_node_kinds = {"requirement-validation", "inventory", "vendor-selection", "budget-validation", "purchase-order"}
        is_procurement = False
        # Check node kinds for procurement indicators
        for node in nodes if isinstance(nodes, list) else []:
            if isinstance(node, dict) and isinstance(node.get("data"), dict):
                kind = node.get("data").get("kind")
                if isinstance(kind, str) and kind in procurement_node_kinds:
                    is_procurement = True
                    break
        # Check state keys for procurement indicators
        procurement_state_keys = {"budget_validation_passed", "total_cost", "approval_threshold", "purchase_order_generated", "vendor_selection_completed", "validation_passed", "inventory_checked"}
        if any(k in state for k in procurement_state_keys):
            is_procurement = True

        # If not a procurement workflow, behave as a generic incident approval: always request human approval and pause
        if not is_procurement:
            # generic incident approval: pause and send configured approval email
            state.setdefault("approved_by", None)
            state.setdefault("approval_reason", None)
            state.setdefault("approval_timestamp", None)
            state["approval_status"] = "waiting_approval"
            state["execution_status"] = "waiting_approval"
            state.setdefault("execution_log", []).append(f"{requested_at} - Approval Requested")
            state.setdefault("execution_log", []).append(f"{requested_at} - Waiting for Human Approval")

            # Send an approval notification email once (do not duplicate on resume)
            try:
                if not state.get("approval_email_sent"):
                    # Resolve the approval recipient from workflow/user configuration only.
                    recipient = None
                    node_cfg = None
                    current_node_id = state.get("current_node")
                    for node in nodes if isinstance(nodes, list) else []:
                        if isinstance(node, dict) and node.get("id") == current_node_id:
                            node_cfg = node.get("data") if isinstance(node.get("data"), dict) else {}
                            break

                    if node_cfg:
                        recipient = node_cfg.get("approverEmail") or node_cfg.get("approver_email")

                    recipient = recipient or state.get("approver_email") or state.get("approverEmail")

                    import os
                    recipient = recipient or os.getenv("APPROVAL_EMAIL", "").strip()

                    if not recipient:
                        state.setdefault("execution_log", []).append(
                            f"{datetime.now(timezone.utc).isoformat()} - Approval email not sent: approval recipient is not configured."
                        )
                        state["approval_email_sent"] = False
                        state["approval_email_error"] = "Approval recipient is not configured."
                        return state

                    # Build email
                    from services.email_service import send_email
                    workflow_id = state.get("workflow_id") or (workflow_data.get("workflow_id") if isinstance(workflow_data, dict) else None)
                    requested_at_str = requested_at
                    subject = "SentinelMesh Approval Required"
                    approve_url = f"http://localhost:8000/workflows/{workflow_id}/approve" if workflow_id else "http://localhost:8000/workflows/<workflow_id>/approve"
                    reject_url = f"http://localhost:8000/workflows/{workflow_id}/reject" if workflow_id else "http://localhost:8000/workflows/<workflow_id>/reject"
                    body = (
                        f"Workflow ID:\n{workflow_id}\n\n"
                        f"Status:\nWaiting for Human Approval\n\n"
                        f"Requested At:\n{requested_at_str}\n\n"
                        f"Please review this workflow.\n\n"
                        f"Approve:\n{approve_url}\n\n"
                        f"Reject:\n{reject_url}\n"
                    )

                    success, err = send_email(recipient, subject, body)
                    if success:
                        state.setdefault("execution_log", []).append(f"{datetime.now(timezone.utc).isoformat()} - Approval email sent to {recipient}.")
                        state["approval_email_sent"] = True
                    else:
                        state.setdefault("execution_log", []).append(f"{datetime.now(timezone.utc).isoformat()} - Failed to send approval email: {err}")
                        state["approval_email_sent"] = False
                        state["approval_email_error"] = str(err)
            except Exception as exc:  # do not let email failures crash the workflow; just log
                state.setdefault("execution_log", []).append(f"{datetime.now(timezone.utc).isoformat()} - Failed to send approval email: {exc}")
                state["approval_email_sent"] = False
                state["approval_email_error"] = str(exc)

            return state

        # Procurement-specific business rules: auto-approve / reject / pending manager approval based on budget checks
        # Default approval threshold if missing
        threshold = int(state.get("approval_threshold") or 50000)
        state.setdefault("approval_threshold", threshold)

        # If budget validation failed, reject immediately
        if state.get("budget_validation_passed") is False:
            state["approval_status"] = "Rejected"
            state["approved_by"] = None
            state["approval_reason"] = "Budget validation failed."
            state["approval_timestamp"] = None
            state["execution_status"] = "rejected"
            requested_at_str = requested_at
            state.setdefault("execution_log", []).append(f"{requested_at_str} - Approval Decision: Rejected (budget validation failed)")
            return state

        # If total_cost is missing, treat as pending manager approval
        total_cost = state.get("total_cost")
        try:
            total_cost_val = float(total_cost) if total_cost is not None else None
        except Exception:
            total_cost_val = None

        if total_cost_val is None:
            # No cost info - require manual approval
            state["approval_status"] = "Pending Manager Approval"
            state["approved_by"] = None
            state["approval_reason"] = "Missing cost information; requires manager approval."
            state["execution_status"] = "pending_manager_approval"
            state.setdefault("execution_log", []).append(f"{requested_at} - Approval requires manager review (missing cost).")
            # set requested timestamp for manual approval
            state["approval_requested_at"] = requested_at
            return state

        # Auto-approve when within threshold (<=)
        if total_cost_val <= threshold:
            state["approval_status"] = "Approved"
            state["approved_by"] = "System"
            state["approval_reason"] = "Within auto-approval threshold."
            state["approval_timestamp"] = datetime.now(timezone.utc).isoformat()
            state["execution_status"] = "approved"
            state.setdefault("execution_log", []).append(f"{state['approval_timestamp']} - Auto-approved by system.")
            return state

        # Otherwise, require manager approval
        state["approval_status"] = "Pending Manager Approval"
        state["approved_by"] = None
        state["approval_reason"] = "Exceeds auto-approval threshold."
        state["execution_status"] = "pending_manager_approval"
        # record request and send notification email once
        state["approval_requested_at"] = requested_at
        state.setdefault("execution_log", []).append(f"{requested_at} - Approval requested (awaiting manager).")

        # Send an approval notification email once (do not duplicate on resume)
        try:
            # Only send once per approval lifecycle
            if not state.get("approval_email_sent"):
                # Resolve the approval recipient from workflow/user configuration only.
                recipient = None
                workflow_data = state.get("workflow_data") or {}
                nodes = workflow_data.get("nodes") or []
                current_node_id = state.get("current_node")
                node_cfg = None
                for node in nodes if isinstance(nodes, list) else []:
                    if isinstance(node, dict) and node.get("id") == current_node_id:
                        node_cfg = node.get("data") if isinstance(node.get("data"), dict) else {}
                        break

                if node_cfg:
                    recipient = node_cfg.get("approverEmail") or node_cfg.get("approver_email")

                recipient = recipient or state.get("approver_email") or state.get("approverEmail")

                import os
                recipient = recipient or os.getenv("APPROVAL_EMAIL", "").strip()

                if not recipient:
                    state.setdefault("execution_log", []).append(
                        f"{datetime.now(timezone.utc).isoformat()} - Approval email not sent: approval recipient is not configured."
                    )
                    state["approval_email_sent"] = False
                    state["approval_email_error"] = "Approval recipient is not configured."
                    return state

                # Build email
                from services.email_service import send_email
                workflow_id = state.get("workflow_id") or (workflow_data.get("workflow_id") if isinstance(workflow_data, dict) else None)
                requested_at_str = requested_at
                subject = "SentinelMesh Approval Required"
                approve_url = f"http://localhost:8000/workflows/{workflow_id}/approve" if workflow_id else "http://localhost:8000/workflows/<workflow_id>/approve"
                reject_url = f"http://localhost:8000/workflows/{workflow_id}/reject" if workflow_id else "http://localhost:8000/workflows/<workflow_id>/reject"
                body = (
                    f"Workflow ID:\n{workflow_id}\n\n"
                    f"Status:\nWaiting for Human Approval\n\n"
                    f"Requested At:\n{requested_at_str}\n\n"
                    f"Please review this workflow.\n\n"
                    f"Approve:\n{approve_url}\n\n"
                    f"Reject:\n{reject_url}\n"
                )

                success, err = send_email(recipient, subject, body)
                if success:
                    state.setdefault("execution_log", []).append(f"{datetime.now(timezone.utc).isoformat()} - Approval email sent to {recipient}.")
                    state["approval_email_sent"] = True
                else:
                    state.setdefault("execution_log", []).append(f"{datetime.now(timezone.utc).isoformat()} - Failed to send approval email: {err}")
                    state["approval_email_sent"] = False
                    state["approval_email_error"] = str(err)
        except Exception as exc:  # do not let email failures crash the workflow; just log
            state.setdefault("execution_log", []).append(f"{datetime.now(timezone.utc).isoformat()} - Failed to send approval email: {exc}")
            state["approval_email_sent"] = False
            state["approval_email_error"] = str(exc)

        return state
