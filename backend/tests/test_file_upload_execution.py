import base64

import pytest

from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


@pytest.mark.parametrize("file_name,content", [
    ("candidate.txt", "name: Alice\nrole: engineer\n"),
    ("readme.md", "# AWS requirements\n- S3\n"),
])
def test_file_upload_to_extractor_executes_through_api(monkeypatch, file_name: str, content: str) -> None:
    import agents.extractor_agent as extractor_agent

    captured: dict[str, str] = {}

    def fake_generate_text(self, prompt, input_text, model, temperature, max_tokens, api_key=None):
        captured["input_text"] = input_text
        return '{"name": "Alice", "role": "engineer"}'

    monkeypatch.setattr(extractor_agent.GroqProvider, "generate_text", fake_generate_text)
    created = client.post(
        "/workflows",
        json={
            "name": "File Upload E2E",
            "description": "File Upload to Extractor",
            "nodes": [
                {
                    "id": "file-upload-1",
                    "type": "default",
                    "position": {"x": 0, "y": 0},
                    "data": {
                        "kind": "file-upload",
                        "label": "File Upload",
                        "fileReference": "file-ref-e2e",
                        "fileName": file_name,
                        "fileMimeType": "text/plain",
                        "fileSize": len(content.encode("utf-8")),
                        "fileContentBase64": base64.b64encode(content.encode("utf-8")).decode("ascii"),
                    },
                },
                {
                    "id": "extractor-1",
                    "type": "default",
                    "position": {"x": 240, "y": 0},
                    "data": {
                        "kind": "extractor",
                        "label": "Extractor",
                        "provider": "Groq",
                        "model": "test-model",
                        "inputField": "input_text",
                        "extractionFields": ["name", "role"],
                        "instructions": "Extract the requested fields.",
                    },
                },
            ],
            "edges": [{"id": "edge-1", "source": "file-upload-1", "target": "extractor-1"}],
        },
    )
    assert created.status_code == 201
    workflow_id = created.json()["workflow_id"]

    loaded = client.get(f"/workflows/{workflow_id}")
    assert loaded.status_code == 200
    assert loaded.json()["nodes"][0]["data"]["fileReference"] == "file-ref-e2e"

    executed = client.post(f"/workflows/{workflow_id}/execute")
    assert executed.status_code == 200
    body = executed.json()

    assert body["execution_id"]
    assert body["execution_status"] == "completed"
    assert body["failed_node_ids"] == []
    assert body["pending_node_ids"] == []
    assert body["current_node_id"] is None
    assert body["workflow_health"] == "Healthy"
    assert body["supervisor_metrics"]["completed_nodes"] == len(body["completed_node_ids"]) == 2
    assert body["supervisor_metrics"]["workflow_completion_pct"] == 100
    assert captured["input_text"] == content

    upload_output = next(item for item in body["node_outputs"] if item["node_id"] == "file-upload-1")
    assert upload_output["outputs"]["file_id"] == "file-ref-e2e"
    assert upload_output["outputs"]["file_name"] == file_name
    extractor_output = next(item for item in body["node_outputs"] if item["node_id"] == "extractor-1")
    assert extractor_output["outputs"]["extracted_data"] == {"name": "Alice", "role": "engineer"}
