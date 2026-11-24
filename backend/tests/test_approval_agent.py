import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.agent_registry import AgentRegistry
from agents.approval import ApprovalAgent
from constants.node_types import APPROVAL
from graph.state import WorkflowState


def test_auto_approval_below_threshold() -> None:
    agent = ApprovalAgent()
    state: WorkflowState = {
        "budget_validation_passed": True,
        "total_cost": 30000,
        "approval_threshold": 50000,
    }

    result = agent.execute(state)

    assert result["approval_status"] == "Approved"
    assert result["approved_by"] == "System"
    assert result["approval_reason"] == "Within auto-approval threshold."
    assert result["execution_status"] == "approved"
    assert result["approval_timestamp"]


def test_exact_threshold_approval() -> None:
    agent = ApprovalAgent()
    state: WorkflowState = {
        "budget_validation_passed": True,
        "total_cost": 50000,
        "approval_threshold": 50000,
    }

    result = agent.execute(state)

    assert result["approval_status"] == "Approved"
    assert result["approved_by"] == "System"


def test_pending_manager_approval() -> None:
    agent = ApprovalAgent()
    state: WorkflowState = {
        "budget_validation_passed": True,
        "total_cost": 75000,
        "approval_threshold": 50000,
    }

    result = agent.execute(state)

    assert result["approval_status"] == "Pending Manager Approval"
    assert result["approved_by"] is None
    assert result["approval_reason"] == "Exceeds auto-approval threshold."
    assert result["execution_status"] == "pending_manager_approval"


def test_budget_validation_failed() -> None:
    agent = ApprovalAgent()
    state: WorkflowState = {
        "budget_validation_passed": False,
        "total_cost": 30000,
        "approval_threshold": 50000,
    }

    result = agent.execute(state)

    assert result["approval_status"] == "Rejected"
    assert result["approved_by"] is None
    assert result["approval_reason"] == "Budget validation failed."
    assert result["execution_status"] == "rejected"


def test_missing_threshold_uses_default() -> None:
    agent = ApprovalAgent()
    state: WorkflowState = {
        "budget_validation_passed": True,
        "total_cost": 40000,
    }

    result = agent.execute(state)

    assert result["approval_status"] == "Approved"
    assert result["approval_threshold"] == 50000
    assert result["approved_by"] == "System"


def test_agent_registry_invokes_approval_agent() -> None:
    registry = AgentRegistry()
    agent = registry.get_agent(APPROVAL)

    assert agent is not None
    assert agent.__class__.__name__ == "ApprovalAgent"


def test_approval_uses_workflow_node_recipient() -> None:
    sent: list[str] = []

    with patch("services.email_service.send_email", side_effect=lambda recipient, subject, body: (sent.append(recipient), (True, None))[1]):
        result = ApprovalAgent().execute({
            "workflow_id": "workflow-1",
            "current_node": "ranking",
            "workflow_data": {
                "nodes": [{"id": "ranking", "data": {"kind": "approval", "approverEmail": "qa@example.com"}}],
            },
        })

    assert result["approval_email_sent"] is True
    assert sent == ["qa@example.com"]


def test_approval_does_not_fallback_to_smtp_sender(monkeypatch) -> None:
    monkeypatch.setenv("SMTP_FROM", "sender@example.com")

    with patch("services.email_service.send_email") as send_email:
        result = ApprovalAgent().execute({
            "workflow_id": "workflow-2",
            "current_node": "ranking",
            "workflow_data": {
                "nodes": [{"id": "ranking", "data": {"kind": "approval"}}],
            },
        })

    send_email.assert_not_called()
    assert result["approval_email_sent"] is False
    assert result["approval_email_error"] == "Approval recipient is not configured."
