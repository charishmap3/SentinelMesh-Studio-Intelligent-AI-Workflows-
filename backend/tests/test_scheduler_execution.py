from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def test_scheduler_to_requirement_validation_executes_through_api() -> None:
    response = client.post(
        "/workflows",
        json={
            "name": "Scheduler E2E",
            "description": "Minimal scheduler execution path",
            "nodes": [
                {
                    "id": "scheduler-1",
                    "type": "default",
                    "position": {"x": 0, "y": 0},
                    "data": {
                        "kind": "scheduler",
                        "label": "Scheduler",
                        "nodeType": "Scheduler",
                        "scheduleType": "interval",
                        "intervalMinutes": 1,
                    },
                },
                {
                    "id": "requirement-1",
                    "type": "default",
                    "position": {"x": 240, "y": 0},
                    "data": {
                        "kind": "requirement-validation",
                        "label": "Requirement Validation",
                        "nodeType": "Requirement Validation",
                    },
                },
            ],
            "edges": [{"id": "edge-1", "source": "scheduler-1", "target": "requirement-1"}],
        },
    )
    assert response.status_code == 201
    workflow_id = response.json()["workflow_id"]

    loaded = client.get(f"/workflows/{workflow_id}")
    assert loaded.status_code == 200
    assert loaded.json()["nodes"][0]["data"]["intervalMinutes"] == 1

    executed = client.post(f"/workflows/{workflow_id}/execute")
    assert executed.status_code == 200
    body = executed.json()

    assert body["execution_id"]
    assert body["workflow_id"] == workflow_id
    assert body["execution_status"] == "validated"
    assert body["executed_node_ids"] == ["scheduler-1", "requirement-1"]
    assert body["completed_node_ids"] == body["executed_node_ids"]
    assert body["failed_node_ids"] == []
    assert body["pending_node_ids"] == []
    assert body["current_node_id"] is None
    assert body["supervisor_metrics"]["completed_nodes"] == len(body["completed_node_ids"])
    assert body["supervisor_metrics"]["failed_nodes"] == len(body["failed_node_ids"])
    assert body["supervisor_metrics"]["pending_nodes"] == len(body["pending_node_ids"])
    assert body["supervisor_metrics"]["current_running_node"] is None
    assert body["supervisor_metrics"]["workflow_completion_pct"] == 100
    assert body["supervisor_node_details"][0]["node_id"] == "scheduler-1"
    assert body["supervisor_node_details"][0]["status"] == "completed"
    assert body["supervisor_node_details"][1]["node_id"] == "requirement-1"
    assert body["supervisor_node_details"][1]["status"] == "completed"
    assert body["node_details"] == body["supervisor_node_details"]
    scheduler_output = next(item for item in body["node_outputs"] if item["node_id"] == "scheduler-1")
    assert scheduler_output["outputs"]["scheduler_status"] == "scheduled"
    assert scheduler_output["outputs"]["scheduler_last_run"]
    assert scheduler_output["outputs"]["scheduler_next_run_at"]
    requirement_output = next(item for item in body["node_outputs"] if item["node_id"] == "requirement-1")
    assert requirement_output["outputs"]["validation_passed"] is True
    assert body["workflow_health"] == "Healthy"
    assert body["workflow_summary"].startswith("Workflow health: Healthy")
    assert not any("Workflow health: Warning" in entry for entry in body["execution_log"])