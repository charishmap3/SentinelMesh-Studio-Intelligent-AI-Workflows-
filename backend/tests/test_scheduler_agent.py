from datetime import datetime, timedelta, timezone

from agents.agent_registry import AgentRegistry
from constants import node_types


def test_scheduler_agent_registry_has_scheduler_executor() -> None:
    registry = AgentRegistry()
    agent = registry.get_agent(node_types.SCHEDULER)
    assert agent is not None


def test_scheduler_agent_executes_when_due() -> None:
    agent = AgentRegistry().get_agent(node_types.SCHEDULER)
    now = datetime.now(timezone.utc)
    state = {
        "workflow_data": {
            "nodes": [
                {
                    "id": "scheduler-1",
                    "data": {"kind": "scheduler", "scheduleType": "interval", "intervalMinutes": 15},
                }
            ]
        },
        "current_node": "scheduler-1",
        "scheduler_last_run": (now - timedelta(minutes=20)).isoformat(),
    }

    result = agent.execute(state)

    assert result["execution_status"] == "received"
    assert result["scheduler_status"] == "scheduled"
    assert result["scheduler_last_run"]
    assert result["scheduler_next_run_at"]


def test_scheduler_agent_waits_before_interval_elapsed() -> None:
    agent = AgentRegistry().get_agent(node_types.SCHEDULER)
    now = datetime.now(timezone.utc)
    last_run = (now - timedelta(minutes=5)).isoformat()
    state = {
        "workflow_data": {
            "nodes": [
                {
                    "id": "scheduler-1",
                    "data": {"kind": "scheduler", "scheduleType": "interval", "intervalMinutes": 15},
                }
            ]
        },
        "current_node": "scheduler-1",
        "scheduler_last_run": last_run,
    }

    result = agent.execute(state)

    assert result["execution_status"] == "waiting"
    assert result["scheduler_status"] == "waiting"
    assert result["scheduler_last_run"] == last_run
    assert datetime.fromisoformat(result["scheduler_next_run_at"]) > now


def test_scheduler_agent_rejects_invalid_interval() -> None:
    agent = AgentRegistry().get_agent(node_types.SCHEDULER)
    state = {
        "workflow_data": {
            "nodes": [{"id": "scheduler-1", "data": {"kind": "scheduler", "intervalMinutes": 0}}]
        },
        "current_node": "scheduler-1",
    }

    result = agent.execute(state)

    assert result["execution_status"] == "failed"
    assert result["scheduler_status"] == "failed"
    assert "intervalMinutes must be greater than zero" in result["errors"][0]
