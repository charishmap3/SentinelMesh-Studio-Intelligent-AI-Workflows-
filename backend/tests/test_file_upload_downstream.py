import base64

from fastapi.testclient import TestClient

from agents.supervisor import SupervisorAgent
from main import app


client = TestClient(app)


def test_requirements_file_reaches_extractor_and_summarizer(monkeypatch) -> None:
    import agents.extractor_agent as extractor_agent
    import agents.summarizer_agent as summarizer_agent

    content = "fastapi==0.115.0\nuvicorn==0.34.0\n"
    captured: list[tuple[str, str]] = []

    class ExtractProvider:
        def generate_text(self, prompt, input_text, model, temperature, max_tokens, api_key=None):
            captured.append(("extractor", input_text))
            return '{"dependency": "fastapi"}'

    class SummaryProvider:
        def generate_text(self, prompt, input_text, model, temperature, max_tokens, api_key=None):
            captured.append(("summarizer", input_text))
            return "requirements summary"

    def fake_extract_provider(self, provider_name):
        return ExtractProvider()

    def fake_summary_provider(self, provider_name):
        return SummaryProvider()

    def fake_extract(self, prompt, input_text, model, temperature, max_tokens, api_key=None):
        captured.append(("extractor", input_text))
        return '{"dependency": "fastapi"}'

    def fake_summarize(self, prompt, input_text, model, temperature, max_tokens, api_key=None):
        captured.append(("summarizer", input_text))
        return "requirements summary"

    monkeypatch.setattr(extractor_agent.ExtractorAgent, "_get_provider", fake_extract_provider)
    monkeypatch.setattr(summarizer_agent.SummarizerAgent, "_get_provider", fake_summary_provider)

    created = client.post(
        "/workflows",
        json={
            "name": "Requirements Upload Flow",
            "description": "File Upload to Extractor to Summarizer",
            "nodes": [
                {
                    "id": "upload",
                    "type": "default",
                    "position": {"x": 0, "y": 0},
                    "data": {
                        "kind": "file-upload",
                        "label": "File Upload",
                        "fileReference": "35346147-e649-49af-9640-29cb64dae0d7",
                        "fileName": "requirements.txt",
                        "fileMimeType": "text/plain",
                        "fileSize": len(content.encode("utf-8")),
                        "fileContentBase64": base64.b64encode(content.encode("utf-8")).decode("ascii"),
                    },
                },
                {
                    "id": "extractor",
                    "type": "default",
                    "position": {"x": 240, "y": 0},
                    "data": {
                        "kind": "extractor",
                        "label": "Extractor",
                        "provider": "Groq",
                        "model": "test-model",
                        "inputField": "input",
                        "extractionFields": ["dependency"],
                    },
                },
                {
                    "id": "summarizer",
                    "type": "default",
                    "position": {"x": 480, "y": 0},
                    "data": {
                        "kind": "summarizer",
                        "label": "Summarizer",
                        "provider": "Groq",
                        "model": "test-model",
                        "inputField": "input",
                    },
                },
            ],
            "edges": [
                {"source": "upload", "target": "extractor"},
                {"source": "extractor", "target": "summarizer"},
            ],
        },
    )
    assert created.status_code == 201
    workflow_id = created.json()["workflow_id"]

    loaded = client.get(f"/workflows/{workflow_id}")
    assert loaded.status_code == 200
    assert loaded.json()["nodes"][0]["data"]["fileName"] == "requirements.txt"
    assert loaded.json()["nodes"][0]["data"]["fileReference"] == "35346147-e649-49af-9640-29cb64dae0d7"

    executed = client.post(f"/workflows/{workflow_id}/execute")
    assert executed.status_code == 200
    body = executed.json()

    assert body["execution_status"] == "completed"
    assert body["failed_node_ids"] == []
    assert body["pending_node_ids"] == []
    assert body["current_node_id"] is None
    assert body["workflow_health"] == "Healthy"
    assert [kind for kind, _ in captured] == ["extractor", "summarizer"]
    assert captured[0][1] == content
    assert captured[1][1] == '{"dependency": "fastapi"}'
    assert body["completed_node_ids"] == ["upload", "extractor", "summarizer"]


def test_supervisor_uses_terminal_node_statuses_for_failure_monitoring() -> None:
    state = {
        "execution_status": "failed",
        "current_node": "summarizer-failure",
        "failed_node_ids": ["extractor-failure", "summarizer-failure"],
        "execution_log": [
            "2026-09-20T00:00:00+00:00 - upload-failure completed (1ms)",
            "2026-09-20T00:00:01+00:00 - extractor-failure failed (1ms)",
            "2026-09-20T00:00:02+00:00 - summarizer-failure failed (1ms)",
        ],
        "workflow_data": {
            "nodes": [
                {"id": "upload-failure", "data": {"kind": "file-upload", "label": "File Upload"}},
                {"id": "extractor-failure", "data": {"kind": "extractor", "label": "Extractor"}},
                {"id": "summarizer-failure", "data": {"kind": "summarizer", "label": "Summarizer"}},
            ],
        },
        "node_metrics": {
            "upload-failure": {"status": "completed", "start_time": "a", "end_time": "b", "duration_ms": 1},
            "extractor-failure": {"status": "completed", "start_time": "a", "end_time": "b", "duration_ms": 1},
            "summarizer-failure": {"status": "completed", "start_time": "a", "end_time": "b", "duration_ms": 1},
        },
    }

    result = SupervisorAgent().execute(state)

    assert result["completed_stages"] == ["File Upload"]
    assert result["failed_stages"] == ["Extractor", "Summarizer"]
    assert result["supervisor_metrics"]["completed_nodes"] == 1
    assert result["supervisor_metrics"]["failed_nodes"] == 2
    assert result["supervisor_metrics"]["current_running_node"] is None


def test_failed_extractor_and_summarizer_emit_no_completed_terminal_event(monkeypatch) -> None:
    import agents.extractor_agent as extractor_agent
    import agents.summarizer_agent as summarizer_agent

    class FailingProvider:
        def generate_text(self, *args, **kwargs):
            raise RuntimeError("provider unavailable")

    monkeypatch.setattr(extractor_agent.ExtractorAgent, "_get_provider", lambda self, name: FailingProvider())
    monkeypatch.setattr(summarizer_agent.SummarizerAgent, "_get_provider", lambda self, name: FailingProvider())
    content = "# AWS requirements\n"
    created = client.post(
        "/workflows",
        json={
            "name": "Terminal Event Regression",
            "description": "Failed downstream terminal events",
            "nodes": [
                {"id": "upload-terminal", "type": "default", "data": {"kind": "file-upload", "label": "File Upload", "fileName": "readme.md", "fileReference": "terminal-ref", "fileMimeType": "text/markdown", "fileSize": len(content.encode()), "fileContentBase64": base64.b64encode(content.encode()).decode()}},
                {"id": "extractor-terminal", "type": "default", "data": {"kind": "extractor", "label": "Extractor", "inputField": "input", "extractionFields": ["value"]}},
                {"id": "summarizer-terminal", "type": "default", "data": {"kind": "summarizer", "label": "Summarizer", "inputField": "input"}},
            ],
            "edges": [{"source": "upload-terminal", "target": "extractor-terminal"}, {"source": "extractor-terminal", "target": "summarizer-terminal"}],
        },
    )

    body = client.post(f"/workflows/{created.json()['workflow_id']}/execute").json()
    log = "\n".join(body["execution_log"])
    assert "extractor-terminal failed" in log
    assert "extractor-terminal completed" not in log
    assert "summarizer-terminal skipped" in log
    assert "summarizer-terminal completed" not in log
    assert body["failed_node_ids"] == ["extractor-terminal"]
    assert body["skipped_node_ids"] == ["summarizer-terminal"]
