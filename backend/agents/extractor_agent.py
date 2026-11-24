from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from agents.base_agent import BaseAgent
from agents.llm_agent import GeminiProvider, GroqProvider, OpenAIProvider
from agents.input_resolution import resolve_node_input
from graph.state import WorkflowState

logger = logging.getLogger(__name__)


class ExtractorAgent(BaseAgent):
    def _get_provider(self, provider_name: str):
        providers = {
            "OpenAI": OpenAIProvider(),
            "Gemini": GeminiProvider(),
            "Groq": GroqProvider(),
        }
        return providers.get(provider_name, OpenAIProvider())

    def _get_node_config(self, state: WorkflowState) -> dict[str, Any] | None:
        workflow_data = state.get("workflow_data") or {}
        nodes = workflow_data.get("nodes") or []

        for node in nodes if isinstance(nodes, list) else []:
            if isinstance(node, dict) and node.get("id") == state.get("current_node"):
                data = node.get("data")
                if isinstance(data, dict):
                    return data
        return None

    def _normalize_fields(self, fields: Any) -> list[str]:
        if isinstance(fields, str):
            return [item.strip() for item in fields.split(",") if item.strip()]
        if isinstance(fields, list):
            return [str(item).strip() for item in fields if str(item).strip()]
        return []

    def _set_failure_state(self, state: WorkflowState, errors: list[str] | str, log_message: str) -> WorkflowState:
        state["errors"] = [errors] if isinstance(errors, str) else list(errors)
        state["execution_status"] = "failed"
        node_id = state.get("current_node")
        if isinstance(node_id, str):
            failed_nodes = [node for node in list(state.get("failed_node_ids") or []) if isinstance(node, str)]
            if node_id not in failed_nodes:
                failed_nodes.append(node_id)
            state["failed_node_ids"] = failed_nodes
        state.setdefault("execution_log", []).append(log_message)
        return state

    def _resolve_input_text(self, state: WorkflowState, input_field: str) -> str:
        return resolve_node_input(state, input_field)

    def _build_prompt(self, fields: list[str], instructions: str) -> str:
        field_list = ", ".join(fields)
        base_prompt = instructions or "Extract the requested fields into a structured JSON object."
        return (
            f"{base_prompt}\n\n"
            f"Requested fields: {field_list}\n"
            "Return ONLY a valid JSON object. Do not include Markdown fences, explanations, or text before or after the JSON. "
            "If a requested field cannot be found, include it with a null value. "
            "Example: {\"field1\": \"value1\", \"field2\": null}"
        )

    def _parse_json(self, response_text: str) -> dict[str, Any]:
        text = (response_text or "").strip()
        if not text:
            raise ValueError("Invalid JSON: empty response")

        candidates: list[str] = []
        fenced_blocks = re.findall(r"```(?:json|javascript|js|python)?\s*(.*?)\s*```", text, flags=re.IGNORECASE | re.DOTALL)
        for block in fenced_blocks:
            cleaned = block.strip()
            if cleaned:
                candidates.append(cleaned)

        if not candidates:
            candidates.append(text)

        for candidate in candidates:
            try:
                payload = json.loads(candidate)
            except json.JSONDecodeError:
                pass
            else:
                if isinstance(payload, dict):
                    return payload

            decoder = json.JSONDecoder()
            for index, character in enumerate(candidate):
                if character not in "[{":
                    continue
                try:
                    payload, _ = decoder.raw_decode(candidate[index:])
                except json.JSONDecodeError:
                    continue
                if isinstance(payload, dict):
                    return payload

        raise ValueError("Invalid JSON: unable to parse model response")

    def execute(self, state: WorkflowState) -> WorkflowState:
        config = self._get_node_config(state)
        if config is None:
            return self._set_failure_state(
                state,
                ["Extractor node configuration missing."],
                f"{datetime.now(timezone.utc).isoformat()} Extractor node configuration missing.",
            )

        if state.get("execution_status") == "no_messages":
            state.setdefault("execution_log", []).append(
                f"{datetime.now(timezone.utc).isoformat()} Extractor skipped due to no_messages."
            )
            state.setdefault("skipped_nodes", []).append(state.get("current_node", "unknown"))
            return state

        fields = self._normalize_fields(config.get("extractionFields") or config.get("fields") or config.get("extraction_fields"))
        if not fields:
            return self._set_failure_state(
                state,
                ["At least one extraction field is required."],
                f"{datetime.now(timezone.utc).isoformat()} Extractor failed: at least one extraction field is required.",
            )

        input_field = str(config.get("inputField") or config.get("input_field") or "email_subject_and_body")
        input_text = self._resolve_input_text(state, input_field)
        logger.warning(
            "RESUME_PARSER_INPUT_DEBUG node_id=%s input_field=%s input_type=%s text_available=%s text_length=%s filename=%s mime_type=%s",
            state.get("current_node"),
            input_field,
            type(input_text).__name__,
            bool(str(input_text or "").strip()),
            len(str(input_text or "")),
            state.get("file_name"),
            state.get("file_mime_type"),
        )
        if not str(input_text or "").strip():
            return self._set_failure_state(
                state,
                ["No input available for Extractor. Verify that the connected upstream node produced output."],
                f"{datetime.now(timezone.utc).isoformat()} Extractor failed: no input available.",
            )

        provider_name = str(config.get("provider") or "Groq")
        model = str(config.get("model") or "llama-3.1-8b-instant")
        temperature = float(config.get("temperature") or 0.0)
        max_tokens = int(config.get("maxTokens") or 256)
        api_key = config.get("apiKey")
        prompt = self._build_prompt(fields, str(config.get("instructions") or "Extract the requested fields into a structured JSON object."))

        try:
            provider = self._get_provider(provider_name)
            if provider_name.strip().lower() == "groq" and hasattr(provider, "request_json"):
                provider.request_json = True
            response_text = provider.generate_text(prompt, input_text, model, temperature, max_tokens, api_key)
            if not isinstance(response_text, str) or not response_text.strip():
                raise ValueError("Extractor received an empty response from the LLM.")
            parsed_payload = self._parse_json(response_text)
        except Exception as exc:  # pragma: no cover - defensive for runtime/provider failures
            message = str(exc)
            if "empty response" in message.lower():
                message = "Extractor received an empty response from the LLM."
            return self._set_failure_state(
                state,
                [message],
                f"{datetime.now(timezone.utc).isoformat()} Extractor execution failed: {message}",
            )

        filtered_payload = {
            key: value for key, value in parsed_payload.items() if str(key).strip() in {field.strip() for field in fields}
        }
        state["extracted_data"] = filtered_payload
        state["extractor_input_field"] = input_field
        state["extractor_fields"] = fields
        state["extractor_provider"] = provider_name
        state["extractor_model"] = model
        state["execution_status"] = "completed"
        state.setdefault("execution_log", []).append(
            f"{datetime.now(timezone.utc).isoformat()} Extractor completed: fields={','.join(fields)}"
        )
        return state
