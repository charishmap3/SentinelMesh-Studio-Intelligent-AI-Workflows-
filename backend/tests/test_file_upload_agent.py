import base64

from agents.agent_registry import AgentRegistry
from agents.file_upload import FileUploadAgent
from constants import node_types


def _state(content: str = "name: Alice\nrole: engineer\n") -> dict:
    return {
        "workflow_data": {
            "nodes": [
                {
                    "id": "file-upload-1",
                    "data": {
                        "kind": "file-upload",
                        "fileReference": "file-ref-123",
                        "fileName": "candidate.txt",
                        "fileMimeType": "text/plain",
                        "fileSize": len(content.encode("utf-8")),
                        "fileContentBase64": base64.b64encode(content.encode("utf-8")).decode("ascii"),
                    },
                }
            ]
        },
        "current_node": "file-upload-1",
        "execution_log": [],
    }


def test_file_upload_is_registered() -> None:
    agent = AgentRegistry().get_agent(node_types.FILE_UPLOAD)
    assert isinstance(agent, FileUploadAgent)


def test_file_upload_populates_metadata_reference_and_downstream_input() -> None:
    result = FileUploadAgent().execute(_state())

    assert result["execution_status"] == "received"
    assert result["file_id"] == "file-ref-123"
    assert result["file_reference"] == "file-ref-123"
    assert result["file_name"] == "candidate.txt"
    assert result["file_mime_type"] == "text/plain"
    assert result["file_size"] > 0
    assert result["file_content"] == "name: Alice\nrole: engineer\n"
    assert result["input_text"] == result["file_content"]
    assert any("File upload received" in entry for entry in result["execution_log"])


def test_file_upload_rejects_missing_content() -> None:
    state = _state()
    state["workflow_data"]["nodes"][0]["data"].pop("fileContentBase64")

    result = FileUploadAgent().execute(state)

    assert result["execution_status"] == "failed"
    assert "file content" in result["errors"][0].lower()
