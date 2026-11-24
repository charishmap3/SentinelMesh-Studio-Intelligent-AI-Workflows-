from __future__ import annotations

import base64
import binascii
import io
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from agents.base_agent import BaseAgent
from graph.state import WorkflowState

logger = logging.getLogger(__name__)


class FileUploadAgent(BaseAgent):
    max_file_size_bytes = 10 * 1024 * 1024

    def _get_node_config(self, state: WorkflowState) -> dict[str, Any]:
        workflow_data = state.get("workflow_data") or {}
        nodes = workflow_data.get("nodes") or []

        for node in nodes if isinstance(nodes, list) else []:
            if isinstance(node, dict) and node.get("id") == state.get("current_node"):
                data = node.get("data") if isinstance(node.get("data"), dict) else {}
                return dict(data)

        return {}

    def _fail(self, state: WorkflowState, message: str) -> WorkflowState:
        state["execution_status"] = "failed"
        state["errors"] = [message]
        state.setdefault("execution_log", []).append(
            f"{datetime.now(timezone.utc).isoformat()} File upload failed: {message}"
        )
        return state

    def _decode_content(self, encoded_content: str) -> bytes:
        payload = encoded_content.strip()
        if payload.startswith("data:"):
            try:
                payload = payload.split(",", 1)[1]
            except IndexError as exc:
                raise ValueError("File content data URL is malformed.") from exc

        try:
            return base64.b64decode(payload, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("File content is not valid base64.") from exc

    def _extract_text(self, content_bytes: bytes, mime_type: str, file_name: str) -> str:
        try:
            return content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            pass

        if mime_type.lower() == "application/pdf" or file_name.lower().endswith(".pdf"):
            try:
                from pypdf import PdfReader

                reader = PdfReader(io.BytesIO(content_bytes))
                return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
            except Exception as exc:
                logger.warning("FILE_UPLOAD_PDF_TEXT_DEBUG file_name=%s extraction_failed=%s", file_name, exc)

        return ""

    def execute(self, state: WorkflowState) -> WorkflowState:
        config = self._get_node_config(state)
        encoded_content = config.get("fileContentBase64") or config.get("file_content_base64")
        if not isinstance(encoded_content, str) or not encoded_content.strip():
            return self._fail(state, "Uploaded file content is missing; select a file before execution.")

        file_name = str(config.get("fileName") or config.get("file_name") or "").strip()
        if not file_name:
            return self._fail(state, "Uploaded file name is missing.")

        try:
            content_bytes = self._decode_content(encoded_content)
        except ValueError as exc:
            return self._fail(state, str(exc))

        if not content_bytes:
            return self._fail(state, "Uploaded file is empty.")
        if len(content_bytes) > self.max_file_size_bytes:
            return self._fail(state, "Uploaded file exceeds the 10 MB limit.")

        declared_size = config.get("fileSize")
        if declared_size is not None:
            try:
                if int(declared_size) != len(content_bytes):
                    return self._fail(state, "Uploaded file metadata size does not match its content.")
            except (TypeError, ValueError):
                return self._fail(state, "Uploaded file size metadata is invalid.")

        file_reference = str(
            config.get("fileReference")
            or config.get("file_reference")
            or config.get("fileId")
            or uuid4()
        )
        mime_type = str(config.get("fileMimeType") or config.get("file_mime_type") or "application/octet-stream")
        text_content = self._extract_text(content_bytes, mime_type, file_name)

        metadata = {
            "file_id": file_reference,
            "file_reference": file_reference,
            "file_name": file_name,
            "file_mime_type": mime_type,
            "file_size": len(content_bytes),
        }
        state["file_id"] = file_reference
        state["file_reference"] = file_reference
        state["file_name"] = file_name
        state["file_mime_type"] = mime_type
        state["file_size"] = len(content_bytes)
        state["file_content"] = text_content
        state["file_metadata"] = metadata
        state["input_text"] = text_content
        state["execution_status"] = "received"
        logger.warning(
            "FILE_UPLOAD_RUNTIME_DEBUG node_id=%s output_keys=%s content_available=%s content_length=%s mime_type=%s",
            state.get("current_node"),
            sorted((*metadata.keys(), "file_content", "input_text")),
            bool(text_content),
            len(text_content),
            mime_type,
        )
        state.setdefault("execution_log", []).append(
            f"{datetime.now(timezone.utc).isoformat()} File upload received: {file_name} ({len(content_bytes)} bytes, reference={file_reference})"
        )
        return state
