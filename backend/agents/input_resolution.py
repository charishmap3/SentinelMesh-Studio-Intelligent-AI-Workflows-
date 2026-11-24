from __future__ import annotations

import json
import logging
from typing import Any

from graph.state import WorkflowState

logger = logging.getLogger(__name__)


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def resolve_current_input(state: WorkflowState) -> str:
    """Resolve text from the connected upstream node before using state fallbacks."""
    workflow_data = state.get("workflow_data") or {}
    current_node = state.get("current_node")
    runtime_outputs = state.get("runtime_node_outputs") or {}
    upstream_ids = [
        edge.get("source")
        for edge in workflow_data.get("edges") or []
        if isinstance(edge, dict)
        and edge.get("target") == current_node
        and isinstance(edge.get("source"), str)
    ]
    for upstream_id in upstream_ids:
        output = runtime_outputs.get(upstream_id) or {}
        for key in ("current_input", "input_text", "file_content", "text", "content", "summary", "extracted_data"):
            value = _as_text(output.get(key))
            if value.strip():
                logger.warning(
                    "NODE_INPUT_RESOLUTION_DEBUG node_id=%s upstream_node_id=%s output_keys=%s resolved_key=%s resolved_type=%s resolved_length=%s",
                    current_node,
                    upstream_id,
                    sorted(output.keys()),
                    key,
                    type(value).__name__,
                    len(value),
                )
                return value

        logger.warning(
            "NODE_INPUT_RESOLUTION_DEBUG node_id=%s upstream_node_id=%s output_keys=%s resolved_input_available=False",
            current_node,
            upstream_id,
            sorted(output.keys()),
        )

    for key in (
        "current_input",
        "input_text",
        "file_content",
        "llm_output",
        "summary",
        "extracted_data",
        "email_body",
        "email_subject",
    ):
        value = _as_text(state.get(key))
        if value.strip():
            return value
    return ""


def resolve_node_input(state: WorkflowState, input_field: str) -> str:
    field = (input_field or "").strip().lower().replace("-", "_").replace(" ", "_")

    if field == "email_subject":
        return _as_text(state.get("email_subject"))
    if field == "email_body":
        return _as_text(state.get("email_body"))
    if field in {"email_subject_and_body", "email_subject_body"}:
        subject = _as_text(state.get("email_subject")).strip()
        body = _as_text(state.get("email_body")).strip()
        parts = [part for part in (subject, body) if part]
        return "\n\n".join(parts) if parts else resolve_current_input(state)
    if field in {"input", "input_text", "current_input"}:
        return resolve_current_input(state)

    return resolve_current_input(state)
