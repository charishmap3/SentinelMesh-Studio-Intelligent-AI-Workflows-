from uuid import UUID
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from models.workflow import Workflow, WorkflowCreate, WorkflowUpdate
from services.workflow_service import WorkflowService

router = APIRouter(prefix="/workflows", tags=["workflows"])
logger = logging.getLogger(__name__)


def _workflow_runtime_metadata(workflow: Workflow | WorkflowCreate | WorkflowUpdate) -> dict[str, Any]:
    nodes = workflow.nodes or []
    file_node = next((node for node in nodes if node.get("data", {}).get("kind") == "file-upload"), None)
    extractor = next((node for node in nodes if node.get("data", {}).get("kind") == "extractor"), None)
    summarizer = next((node for node in nodes if node.get("data", {}).get("kind") == "summarizer"), None)
    file_data = file_node.get("data", {}) if isinstance(file_node, dict) else {}
    return {
        "node_ids": [node.get("id") for node in nodes],
        "node_count": len(nodes),
        "file_upload_node_id": file_node.get("id") if isinstance(file_node, dict) else None,
        "has_file_content_base64": bool(file_data.get("fileContentBase64")),
        "file_content_base64_length": len(file_data.get("fileContentBase64") or ""),
        "file_name": file_data.get("fileName"),
        "extractor_input_field": (extractor.get("data") or {}).get("inputField") if isinstance(extractor, dict) else None,
        "summarizer_input_field": (summarizer.get("data") or {}).get("inputField") if isinstance(summarizer, dict) else None,
    }


class WorkflowExecutionResponse(BaseModel):
    execution_id: str | None = None
    workflow_id: str | None = None
    execution_status: str
    workflow_health: str
    workflow_summary: str
    completed_stages: list[str]
    failed_stages: list[str]
    skipped_stages: list[str]
    executed_node_ids: list[str]
    completed_node_ids: list[str] = []
    failed_node_ids: list[str]
    skipped_node_ids: list[str]
    pending_node_ids: list[str] = []
    current_node_id: str | None = None
    failure_category: str
    failure_severity: str
    incident_matches: list[dict]
    recommended_resolution: str
    healing_strategy: str
    healing_status: str
    supervisor_timeline: list[dict] = []
    supervisor_metrics: dict[str, Any] = {}
    supervisor_node_details: list[dict] = []
    node_details: list[dict] = []
    supervisor_summary: str = ""
    node_outputs: list[dict] = []
    execution_log: list[str]


def get_service() -> WorkflowService:
    from main import app

    if not hasattr(app.state, "workflow_service"):
        app.state.workflow_service = WorkflowService()
    return app.state.workflow_service


@router.post("", response_model=Workflow, status_code=status.HTTP_201_CREATED)
def create_workflow(payload: WorkflowCreate) -> Workflow:
    return get_service().create_workflow(payload)


@router.get("", response_model=list[Workflow])
def list_workflows() -> list[Workflow]:
    return get_service().list_workflows()


def _parse_workflow_id(workflow_id: str) -> UUID:
    try:
        return UUID(workflow_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid workflow_id") from exc


@router.get("/{workflow_id}", response_model=Workflow)
def get_workflow(workflow_id: str) -> Workflow:
    parsed_id = _parse_workflow_id(workflow_id)
    workflow = get_service().get_workflow(parsed_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return workflow


@router.put("/{workflow_id}", response_model=Workflow)
def update_workflow(workflow_id: str, payload: WorkflowUpdate) -> Workflow:
    parsed_id = _parse_workflow_id(workflow_id)
    logger.warning("WORKFLOW_PERSIST_DEBUG PUT_RECEIVED workflow_id=%s metadata=%s", parsed_id, _workflow_runtime_metadata(payload))
    workflow = get_service().update_workflow(parsed_id, payload)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    logger.warning("WORKFLOW_PERSIST_DEBUG PUT_STORED workflow_id=%s metadata=%s", workflow.workflow_id, _workflow_runtime_metadata(workflow))
    return workflow


@router.post("/{workflow_id}/execute", response_model=WorkflowExecutionResponse)
def execute_workflow(workflow_id: str) -> WorkflowExecutionResponse:
    parsed_id = _parse_workflow_id(workflow_id)
    stored_workflow = get_service().get_workflow(parsed_id)
    if stored_workflow is not None:
        logger.warning("WORKFLOW_EXECUTE_DEBUG LOADED workflow_id=%s metadata=%s", parsed_id, _workflow_runtime_metadata(stored_workflow))
    else:
        logger.warning("WORKFLOW_EXECUTE_DEBUG LOADED workflow_id=%s metadata=missing", parsed_id)
    result = get_service().execute_workflow(parsed_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    if not result.get("execution_log") and not result.get("workflow_summary"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Workflow execution failed")

    return WorkflowExecutionResponse(**result)


@router.post("/{workflow_id}/approve", response_model=WorkflowExecutionResponse)
def approve_workflow(workflow_id: str, payload: dict) -> WorkflowExecutionResponse:
    parsed_id = _parse_workflow_id(workflow_id)
    approver = payload.get("approver") if isinstance(payload, dict) else None
    reason = payload.get("reason") if isinstance(payload, dict) else None
    result = get_service().approve_workflow(parsed_id, approver, reason)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return WorkflowExecutionResponse(**result)


@router.post("/{workflow_id}/reject", response_model=WorkflowExecutionResponse)
def reject_workflow(workflow_id: str, payload: dict) -> WorkflowExecutionResponse:
    parsed_id = _parse_workflow_id(workflow_id)
    rejected_by = payload.get("rejectedBy") if isinstance(payload, dict) else None
    reason = payload.get("reason") if isinstance(payload, dict) else None
    result = get_service().reject_workflow(parsed_id, rejected_by, reason)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return WorkflowExecutionResponse(**result)


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workflow(workflow_id: str) -> None:
    parsed_id = _parse_workflow_id(workflow_id)
    deleted = get_service().delete_workflow(parsed_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")


# NOTE: Convenience GET endpoints for email links. These reuse the existing
# approve_workflow/reject_workflow service methods (which remain POST-based
# for API clients). The GET handlers call the same service methods internally
# and return simple HTML pages so approval links in email work when clicked
# from a browser.
from fastapi.responses import HTMLResponse


@router.get("/{workflow_id}/approve", response_class=HTMLResponse)
def approve_workflow_get(workflow_id: str) -> HTMLResponse:
    parsed_id = _parse_workflow_id(workflow_id)
    svc = get_service()

    # Check last execution state to ensure the workflow is waiting for approval
    last_state = getattr(svc, "_last_execution_state", {}).get(parsed_id)
    if not last_state or last_state.get("execution_status") != "waiting_approval":
        status_text = "No pending approval."
        if last_state and isinstance(last_state.get("execution_status"), str):
            status_text = f"Current workflow status: {last_state.get('execution_status')}"
        html = f"""
        <html>
        <body>
        <h2>✅ Workflow Approval - Not Applicable</h2>
        <p>Workflow: {workflow_id}</p>
        <p>{status_text}</p>
        </body>
        </html>
        """
        return HTMLResponse(content=html, status_code=200)

    # Proceed to call the existing approve method (no approver/reason via email link)
    result = svc.approve_workflow(parsed_id, approver=None, reason=None)
    if result is None:
        html = f"""
        <html>
        <body>
        <h2>❌ Workflow Not Found</h2>
        <p>Workflow: {workflow_id}</p>
        <p>The workflow could not be found or could not be approved.</p>
        </body>
        </html>
        """
        return HTMLResponse(content=html, status_code=404)

    # Success page
    html = f"""
    <html>
    <body>
    <h2>✅ Workflow Approved</h2>
    <p>Workflow:<br/>{workflow_id}</p>
    <p>The workflow has been resumed successfully.</p>
    </body>
    </html>
    """
    return HTMLResponse(content=html, status_code=200)


@router.get("/{workflow_id}/reject", response_class=HTMLResponse)
def reject_workflow_get(workflow_id: str) -> HTMLResponse:
    parsed_id = _parse_workflow_id(workflow_id)
    svc = get_service()

    last_state = getattr(svc, "_last_execution_state", {}).get(parsed_id)
    if not last_state or last_state.get("execution_status") != "waiting_approval":
        status_text = "No pending approval."
        if last_state and isinstance(last_state.get("execution_status"), str):
            status_text = f"Current workflow status: {last_state.get('execution_status')}"
        html = f"""
        <html>
        <body>
        <h2>❌ Workflow Rejection - Not Applicable</h2>
        <p>Workflow: {workflow_id}</p>
        <p>{status_text}</p>
        </body>
        </html>
        """
        return HTMLResponse(content=html, status_code=200)

    result = svc.reject_workflow(parsed_id, rejected_by=None, reason=None)
    if result is None:
        html = f"""
        <html>
        <body>
        <h2>❌ Workflow Not Found</h2>
        <p>Workflow: {workflow_id}</p>
        <p>The workflow could not be found or could not be rejected.</p>
        </body>
        </html>
        """
        return HTMLResponse(content=html, status_code=404)

    html = f"""
    <html>
    <body>
    <h2>❌ Workflow Rejected</h2>
    <p>Workflow:<br/>{workflow_id}</p>
    <p>Execution has been terminated.</p>
    </body>
    </html>
    """
    return HTMLResponse(content=html, status_code=200)
