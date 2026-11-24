from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from agents.base_agent import BaseAgent
from constants import node_types
from graph.state import WorkflowState


class FailureDetectionAgent(BaseAgent):
    def _workflow_node_names(self, state: WorkflowState) -> set[str]:
        workflow_data = state.get("workflow_data") or {}
        nodes = workflow_data.get("nodes") or []
        names: set[str] = set()
        for node in nodes if isinstance(nodes, list) else []:
            if not isinstance(node, dict):
                continue
            node_data = node.get("data") if isinstance(node.get("data"), dict) else {}
            node_type = node_data.get("kind") or node.get("type")
            if node_type:
                names.add(str(node_type))
        return names

    def _classify_failure(self, state: WorkflowState) -> tuple[str, str, str, str, bool, str, str]:
        """
        Enhanced failure classifier.

        Returns:
        - category_code
        - severity_code
        - root_cause
        - recommended_next_step
        - recoverable (bool)
        - short_message
        - detected_type (LLM/Network/Workflow/Agent/Unknown)
        """
        failure_context = state.get("failure_context") if isinstance(state.get("failure_context"), dict) else {}
        message = str(failure_context.get("failure_message") or "")
        error_type = str(failure_context.get("failure_error_type") or "")
        normalized_message = (message + " " + error_type).lower()

        category_code = "unknown"
        severity_code = "medium"
        root_cause = "Unknown"
        recommended_next_step = "Escalate Workflow"
        recoverable = False
        detected_type = "Unknown"

        if any(token in normalized_message for token in ["no input available", "required input was not available", "missing input"]):
            category_code = "input_execution_data"
            severity_code = "medium"
            root_cause = "Required input was not available to the node"
            recommended_next_step = "Verify that the connected upstream node produced output."
            recoverable = False
            detected_type = "Workflow"

        # LLM / provider related errors
        elif any(token in normalized_message for token in ["401", "unauthorized", "invalid api key", "invalid key", "invalidapikey", "authentication"]):
            category_code = "llm_authentication"
            severity_code = "critical"
            root_cause = "Authentication to LLM provider failed"
            recommended_next_step = "Check API credentials and provider access (401/403)."
            recoverable = False
            detected_type = "LLM"
        elif any(token in normalized_message for token in ["403", "forbidden"]):
            category_code = "llm_forbidden"
            severity_code = "high"
            root_cause = "Provider forbidden access"
            recommended_next_step = "Verify account permissions (403)."
            recoverable = False
            detected_type = "LLM"
        elif any(token in normalized_message for token in ["404", "not found", "model not found"]):
            category_code = "llm_model_not_found"
            severity_code = "high"
            root_cause = "Requested model not available"
            recommended_next_step = "Validate model name/version and provider availability (404)."
            recoverable = False
            detected_type = "LLM"
        elif any(token in normalized_message for token in ["429", "rate limit", "rate-limited"]):
            category_code = "llm_rate_limit"
            severity_code = "medium"
            root_cause = "Provider rate limit exceeded"
            recommended_next_step = "Retry with exponential backoff; consider increasing quota."
            recoverable = True
            detected_type = "LLM"
        elif any(token in normalized_message for token in ["500", "internal server error", "server error"]):
            category_code = "llm_internal_error"
            severity_code = "high"
            root_cause = "Provider internal error (500)"
            recommended_next_step = "Retry later or contact provider."
            recoverable = True
            detected_type = "LLM"
        elif any(token in normalized_message for token in ["http 400", "bad request", "invalid_request_error", "json_validate_failed"]):
            category_code = "llm_provider_request"
            severity_code = "high"
            root_cause = "Groq rejected the LLM request with HTTP 400."
            recommended_next_step = "Inspect the provider request parameters and generated JSON response requirements."
            recoverable = False
            detected_type = "LLM"
        elif any(token in normalized_message for token in ["timeout", "timed out", "read timeout", "request timeout"]):
            category_code = "timeout"
            severity_code = "high"
            root_cause = "Request timed out"
            recommended_next_step = "Retry and check network latency; consider increasing timeouts."
            recoverable = True
            detected_type = "Network"
        elif any(token in normalized_message for token in ["invalid model", "model not supported"]):
            category_code = "invalid_model"
            severity_code = "high"
            root_cause = "Invalid or unsupported model specified"
            recommended_next_step = "Use a valid model name/version."
            recoverable = False
            detected_type = "LLM"

        # Network errors
        elif any(token in normalized_message for token in ["connection refused", "connection error", "connection failed", "dns", "name or service not known", "service unavailable", "503", "connectiontimeout", "connect timeout"]):
            category_code = "network"
            severity_code = "high"
            root_cause = "Network connectivity issue"
            recommended_next_step = "Check DNS, network connectivity, and service availability."
            recoverable = True
            detected_type = "Network"

        # Agent / Node errors
        elif any(token in normalized_message for token in ["extractor", "summarizer", "classifier", "router", "supervisor", "agent failure", "agent error"]):
            category_code = "agent_failure"
            severity_code = "high"
            root_cause = "Agent-specific execution failure"
            recommended_next_step = "Inspect agent logs, retry or escalate."
            recoverable = True
            detected_type = "Agent"

        # Workflow errors
        elif any(token in normalized_message for token in ["missing", "required", "no message", "missing input", "invalid configuration", "graph failure", "node failure", "condition failed"]):
            category_code = "workflow_error"
            severity_code = "medium"
            root_cause = "Workflow or node configuration issue"
            recommended_next_step = "Validate workflow configuration and inputs."
            recoverable = False
            detected_type = "Workflow"

        # Fallback
        else:
            # Try to infer from state['errors'] if available
            errors = state.get("errors") or []
            err_text = " ".join(errors).lower() if isinstance(errors, list) else str(errors).lower()
            if "timeout" in err_text:
                category_code = "timeout"
                severity_code = "high"
                root_cause = "Timeout"
                recommended_next_step = "Retry operation"
                recoverable = True
                detected_type = "Network"
            elif "rate" in err_text or "429" in err_text:
                category_code = "llm_rate_limit"
                severity_code = "medium"
                root_cause = "Rate limited"
                recommended_next_step = "Backoff and retry"
                recoverable = True
                detected_type = "LLM"
            else:
                category_code = "unknown"
                severity_code = "medium"
                root_cause = message or error_type or "Unknown"
                recommended_next_step = "Escalate Workflow"
                recoverable = False
                detected_type = "Unknown"

        short_message = message or error_type or "Unknown workflow node failure"
        return category_code, severity_code, root_cause, recommended_next_step, recoverable, short_message, detected_type

    def execute(self, state: WorkflowState) -> WorkflowState:
        execution_log = list(state.get("execution_log") or [])
        errors = list(state.get("errors") or [])
        workflow_health = state.get("workflow_health") or "Warning"
        execution_status = state.get("execution_status") or "unknown"
        validation_passed = state.get("validation_passed")
        inventory_checked = state.get("inventory_checked")
        vendor_selection_completed = state.get("vendor_selection_completed")
        budget_validation_passed = state.get("budget_validation_passed")
        approval_status = state.get("approval_status")
        purchase_order_generated = state.get("purchase_order_generated")
        workflow_nodes = self._workflow_node_names(state)
        procurement_node_names = {"requirement-validation", "Requirement Validation", "inventory", "Inventory", "vendor-selection", "Vendor Selection", "budget-validation", "Budget Validation", "approval", "Approval", "purchase-order", "Purchase Order"}
        has_procurement_nodes = any(node_kind in procurement_node_names for node_kind in workflow_nodes)
        has_procurement_state = any(
            state.get(field_name) is not None
            for field_name in ["validation_passed", "inventory_checked", "vendor_selection_completed", "budget_validation_passed", "approval_status", "purchase_order_generated"]
        )
        is_procurement_workflow = has_procurement_nodes or has_procurement_state

        failure_category = "Unknown Failure"
        failure_severity = "Medium"
        recommended_next_step = "Escalate Workflow"
        recoverable = False
        failed_stage = "Workflow"
        category_code = "unknown"
        severity_code = "medium"

        failure_context = state.get("failure_context") if isinstance(state.get("failure_context"), dict) else {}

        # Check extracted_data for explicit health/failure indicators
        extracted = state.get("extracted_data") if isinstance(state.get("extracted_data"), dict) else None
        extracted_status = str(extracted.get("status") or "").strip().lower() if extracted else ""
        extracted_urgency = str(extracted.get("urgency") or "").strip().lower() if extracted else ""

        healthy_statuses = {"running", "healthy", "active", "success"}
        failure_statuses = {"failed", "error", "down", "timeout", "unavailable", "crash"}

        is_extracted_healthy = any(token == extracted_status for token in healthy_statuses)
        is_extracted_failed = any(token in extracted_status for token in failure_statuses)
        is_urgency_high = extracted_urgency in {"critical", "high"}

        # also scan extracted fields / failure message text for failure keywords (e.g., in email body)
        combined_text = ""
        try:
            if extracted:
                combined_text = " ".join(str(v) for v in extracted.values() if v)
        except Exception:
            combined_text = ""
        failure_keywords = {"failed", "error", "down", "timeout", "unavailable", "crash", "exception"}
        has_failure_keywords = any(k in combined_text.lower() for k in failure_keywords)

        # Determine whether there is an actual failure signal (or urgent condition)
        has_error_entries = bool(errors)
        execution_failed = execution_status == "failed"
        has_failure_context = bool(failure_context)

        if execution_status in {"waiting_approval", "pending_manager_approval", "pending"}:
            state["workflow_health"] = "Waiting for Approval"
            state["failure_detected"] = False
            state["failure_category"] = "None"
            state["failure_severity"] = "Low"
            state["failure_summary"] = "Workflow is waiting for human approval."
            state["recommended_resolution"] = "Review and approve or reject the pending approval."
            state["healing_strategy"] = "No Recovery Needed"
            state["healing_status"] = "Not Required"
            return state

        failure_signal = has_failure_context or is_extracted_failed or is_urgency_high or has_failure_keywords or has_error_entries or execution_failed

        # If extracted_data explicitly indicates healthy state and no other failure signals exist, mark Healthy and skip failure detection
        if is_extracted_healthy and not failure_signal and not is_procurement_workflow:
            failure_category = "None"
            failure_severity = "Low"
            recoverable = True
            failed_stage = "None"
            recommended_next_step = "No action required"
            workflow_health = "Healthy"
            # reflect no healing needed
            state.setdefault("recommended_resolution", "No action required")
            state.setdefault("healing_strategy", "No Recovery Needed")
            state.setdefault("healing_status", "Not Required")

            # Build minimal failure details for UI
            failure_details = {
                "failed_stage": failed_stage,
                "category": failure_category,
                "severity": failure_severity,
                "recoverable": recoverable,
                "error_count": len(errors) if errors else 0,
                "workflow_health": workflow_health,
                "recommended_next_step": recommended_next_step,
                "category_code": "none",
                "severity_code": "low",
            }

            failure_detected = False
            failure_summary = "No failures detected."
            execution_log.append(failure_summary)

            state["failure_detected"] = failure_detected
            state["failure_category"] = failure_category
            state["failure_severity"] = failure_severity
            state["recoverable"] = recoverable
            state["failure_summary"] = failure_summary
            state["failure_timestamp"] = datetime.now(timezone.utc).isoformat()
            state["failure_details"] = failure_details
            state["workflow_health"] = workflow_health
            state["execution_log"] = execution_log
            if failure_context:
                state["failure_context"] = failure_context

            return state

        # Otherwise, if there is a failure context, classify as before
        if failure_context:
            cat_code, sev_code, root_cause, rec_step, recov, short_msg, detected_type = self._classify_failure(state)
            category_code = cat_code
            severity_code = sev_code
            recommended_next_step = rec_step
            recoverable = recov
            failure_message = short_message = short_msg
            failure_category = category_code.replace("_", " ").title()
            failure_severity = "Critical" if severity_code == "critical" else "High" if severity_code == "high" else "Medium" if severity_code == "medium" else "Low"
            failed_stage = str(failure_context.get("failed_node_type") or "Workflow")
            if not errors and execution_status == "failed":
                errors = [failure_message]

        if validation_passed is False and is_procurement_workflow:
            failure_category = "Validation Failure"
            failed_stage = node_types.REQUIREMENT_VALIDATION
            failure_severity = "Critical"
            recoverable = False
            recommended_next_step = "Escalate Workflow"
        elif inventory_checked is False and state.get("inventory_checked") is False and is_procurement_workflow:
            failure_category = "Inventory Failure"
            failed_stage = node_types.INVENTORY
            failure_severity = "High"
            recoverable = True
            recommended_next_step = "Retry Inventory"
        elif vendor_selection_completed is False and is_procurement_workflow:
            failure_category = "Vendor Selection Failure"
            failed_stage = node_types.VENDOR_SELECTION
            failure_severity = "High"
            recoverable = True
            recommended_next_step = "Select Alternate Vendor"
        elif budget_validation_passed is False and is_procurement_workflow:
            failure_category = "Budget Failure"
            failed_stage = node_types.BUDGET_VALIDATION
            failure_severity = "High"
            recoverable = True
            recommended_next_step = "Increase Budget"
        elif approval_status == "Pending Manager Approval" and is_procurement_workflow:
            failure_category = "Approval Failure"
            failed_stage = node_types.APPROVAL
            failure_severity = "Medium"
            recoverable = True
            recommended_next_step = "Request Manual Approval"
        elif purchase_order_generated is False and approval_status == "Approved" and is_procurement_workflow:
            failure_category = "Purchase Order Failure"
            failed_stage = node_types.PURCHASE_ORDER
            failure_severity = "High"
            recoverable = True
            recommended_next_step = "Regenerate Purchase Order"
        elif execution_status == "failed" or workflow_health == "Failed":
            failure_category = "Workflow Failure"
            failed_stage = "Workflow"
            failure_severity = "Critical" if is_procurement_workflow else "Medium"
            recoverable = False
            recommended_next_step = "Escalate Workflow"
        elif errors and is_procurement_workflow:
            failure_category = "Unknown Failure"
            failed_stage = "Workflow"
            failure_severity = "Medium"
            recoverable = False
            recommended_next_step = "Escalate Workflow"
        elif errors:
            failure_category = "Workflow Failure"
            failed_stage = "Workflow"
            failure_severity = "Medium"
            recoverable = False
            recommended_next_step = "Escalate Workflow"

        # If extracted_data explicitly indicates a failed critical incident, prefer that
        extracted = state.get("extracted_data") if isinstance(state.get("extracted_data"), dict) else None
        if extracted and str(extracted.get("status") or "").lower() == "failed" and str(extracted.get("urgency") or "").lower() == "critical":
            # Prefer detected category from extracted payload when available
            extracted_cat = extracted.get("category") or extracted.get("failure_category") or None
            failure_category = str(extracted_cat).title() if extracted_cat else failure_category
            failure_severity = "Critical"
            recommended_next_step = "Restart Service / Escalate"
            recoverable = False
            workflow_health = "Failed"

        if not errors and workflow_health == "Healthy":
            failure_category = "None"
            failure_severity = "Low"
            recoverable = True
            failed_stage = "None"
            recommended_next_step = "No Action"

        error_count = len(errors)
        if error_count == 0:
            error_count = 1

        # Build enriched failure details (incident report)
        failure_details = {
            "failed_stage": failed_stage,
            "category": failure_category,
            "severity": failure_severity,
            "recoverable": recoverable,
            "error_count": error_count,
            "workflow_health": workflow_health,
            "recommended_next_step": recommended_next_step,
            "category_code": category_code,
            "severity_code": severity_code,
        }

        # If we have more diagnostic info from _classify_failure, include it
        if failure_context:
            cat_code, sev_code, root_cause, rec_step, recov, short_msg, detected_type = self._classify_failure(state)
            failure_details.update({
                "detected_category_code": cat_code,
                "detected_severity_code": sev_code,
                "root_cause": root_cause,
                "recommendation": rec_step,
                "recovery_suggestion": rec_step,
                "retry_recommended": bool(recov),
                "short_message": short_msg,
                "detected_type": detected_type,
            })

        failure_detected = failure_category != "None"
        failure_summary = (
            f"Failure detected: {failure_category} ({failure_severity})"
            if failure_detected
            else "No failures detected."
        )

        execution_log.append(failure_summary)
        if failure_detected:
            execution_log.append(f"Failure details: {failure_details['failed_stage']} | {failure_category} | {failure_severity}")

            # Structured failure log entry for UI consumption
            ts = datetime.now(timezone.utc).isoformat()
            structured_entry = {
                "timestamp": ts,
                "node": state.get("current_node"),
                "type": failure_details.get("detected_type") or "Workflow",
                "status": "FAILURE",
                "message": failure_details.get("short_message") or failure_summary,
                "category": failure_details.get("detected_category_code") or failure_details.get("category_code"),
                "severity": failure_details.get("severity"),
                "root_cause": failure_details.get("root_cause"),
                "recommendation": failure_details.get("recommendation"),
                "recovery": failure_details.get("recovery_suggestion"),
                "retry_recommended": failure_details.get("retry_recommended"),
            }
            # append as JSON-like string to execution_log for backward compatibility
            execution_log.append(f"FAILURE|{ts}|{structured_entry}")

        state["failure_detected"] = failure_detected
        state["failure_category"] = failure_category
        state["failure_severity"] = failure_severity
        state["recoverable"] = recoverable
        state["failure_summary"] = failure_summary
        state["failure_timestamp"] = datetime.now(timezone.utc).isoformat()
        state["failure_details"] = failure_details
        # prefer to set recommended_resolution if not already present
        if not state.get("recommended_resolution"):
            state["recommended_resolution"] = recommended_next_step
        # Set workflow_health based on detection so later monitoring preserves it
        state["workflow_health"] = workflow_health
        state["execution_log"] = execution_log
        if failure_context:
            state["failure_context"] = failure_context

        return state
