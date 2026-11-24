from __future__ import annotations

import os
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from agents.base_agent import BaseAgent
from graph.state import WorkflowState

logger = logging.getLogger(__name__)


class BaseLLMProvider:
    def generate_text(self, prompt: str, input_text: str, model: str, temperature: float, max_tokens: int, api_key: str | None = None) -> str:
        raise NotImplementedError


class OpenAIProvider(BaseLLMProvider):
    def generate_text(self, prompt: str, input_text: str, model: str, temperature: float, max_tokens: int, api_key: str | None = None) -> str:
        api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("Missing OpenAI API key")
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": f"{prompt}\n\n{input_text}"}],
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
            response.raise_for_status()
            payload = response.json()
            return payload["choices"][0]["message"]["content"]


class GeminiProvider(BaseLLMProvider):
    def generate_text(self, prompt: str, input_text: str, model: str, temperature: float, max_tokens: int, api_key: str | None = None) -> str:
        api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("Missing Gemini API key")
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
                json={"contents": [{"parts": [{"text": f"{prompt}\n\n{input_text}"}]}], "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens}},
            )
            response.raise_for_status()
            payload = response.json()
            return payload["candidates"][0]["content"]["parts"][0]["text"]


class GroqProvider(BaseLLMProvider):
    def __init__(self) -> None:
        self.request_json = False

    def generate_text(self, prompt: str, input_text: str, model: str, temperature: float, max_tokens: int, api_key: str | None = None) -> str:
        api_key = api_key or os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("Missing Groq API key")
        with httpx.Client(timeout=10.0) as client:
            request_payload = {
                "model": model,
                "messages": [{"role": "user", "content": f"{prompt}\n\n{input_text}"}],
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            if self.request_json:
                request_payload["response_format"] = {"type": "json_object"}
            if model.startswith("openai/gpt-oss-"):
                request_payload.pop("max_tokens", None)
                request_payload["max_completion_tokens"] = max(max_tokens, 512)
                request_payload["reasoning_effort"] = "low"

            logger.warning(
                "GROQ_REQUEST_DEBUG model=%s message_count=%s system_message_type=%s user_message_type=%s user_content_length=%s response_format=%s has_tools=%s temperature=%s max_completion_tokens=%s reasoning_effort=%s",
                model,
                len(request_payload["messages"]),
                type(next((message for message in request_payload["messages"] if message.get("role") == "system"), {}).get("content")).__name__,
                type(next((message for message in request_payload["messages"] if message.get("role") == "user"), {}).get("content")).__name__,
                len(request_payload["messages"][0].get("content", "")),
                request_payload.get("response_format"),
                bool(request_payload.get("tools")),
                temperature,
                request_payload.get("max_completion_tokens", request_payload.get("max_tokens")),
                request_payload.get("reasoning_effort"),
            )

            response = client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json=request_payload,
            )
            if response.is_error:
                response_body = response.text[:4000]
                logger.error(
                    "GROQ_RESPONSE_DEBUG status=%s body=%s",
                    response.status_code,
                    response_body,
                )
                raise httpx.HTTPStatusError(
                    f"Groq request failed with HTTP {response.status_code}: {response_body}",
                    request=response.request,
                    response=response,
                )
            payload = response.json()
            choices = payload.get("choices") if isinstance(payload, dict) else None
            choice = choices[0] if isinstance(choices, list) and choices else {}
            message = choice.get("message") if isinstance(choice, dict) else {}
            content = message.get("content") if isinstance(message, dict) else None
            tool_calls = message.get("tool_calls") if isinstance(message, dict) else None
            finish_reason = choice.get("finish_reason") if isinstance(choice, dict) else None
            logger.warning(
                "EXTRACTOR_LLM_DEBUG model=%s choices_count=%s response_type=%s message_present=%s content_present=%s content_length=%s finish_reason=%s tool_calls_present=%s",
                model,
                len(choices) if isinstance(choices, list) else 0,
                type(payload).__name__,
                bool(message),
                bool(content),
                len(content) if isinstance(content, str) else 0,
                finish_reason,
                bool(tool_calls),
            )
            if isinstance(content, str) and content.strip():
                return content
            if isinstance(tool_calls, list) and tool_calls:
                function_data = tool_calls[0].get("function") if isinstance(tool_calls[0], dict) else None
                arguments = function_data.get("arguments") if isinstance(function_data, dict) else None
                if isinstance(arguments, str) and arguments.strip():
                    return arguments
            raise ValueError(
                f"Groq returned an empty response from the LLM (choices={len(choices) if isinstance(choices, list) else 0}, finish_reason={finish_reason})."
            )


class LLMAgent(BaseAgent):
    def __init__(self, node_id: str | None = None) -> None:
        self.node_id = node_id

    def _get_provider(self, provider_name: str) -> BaseLLMProvider:
        providers = {
            "OpenAI": OpenAIProvider(),
            "Gemini": GeminiProvider(),
            "Groq": GroqProvider(),
        }
        return providers.get(provider_name, OpenAIProvider())

    def _resolve_input_text(self, state: WorkflowState) -> str:
        if state.get("input_text"):
            return str(state["input_text"])
        if isinstance(state.get("email_messages"), list):
            for message in state["email_messages"]:
                if isinstance(message, dict) and message.get("body"):
                    return str(message["body"])
        return ""

    def execute(self, state: WorkflowState) -> WorkflowState:
        workflow_data = state.get("workflow_data") or {}
        nodes = workflow_data.get("nodes") or []
        node_config: dict[str, Any] | None = None

        for node in nodes if isinstance(nodes, list) else []:
            if isinstance(node, dict) and node.get("id") == state.get("current_node"):
                data = node.get("data") if isinstance(node.get("data"), dict) else {}
                node_config = data
                break

        if node_config is None:
            state["errors"] = ["LLM node configuration missing."]
            state["execution_status"] = "failed"
            return state

        provider_name = str(node_config.get("provider") or "OpenAI")
        model = str(node_config.get("model") or "gpt-4.1-mini")
        prompt = str(node_config.get("prompt") or "")
        temperature = float(node_config.get("temperature") or 0.0)
        max_tokens = int(node_config.get("maxTokens") or 256)
        api_key = node_config.get("apiKey")

        try:
            provider = self._get_provider(provider_name)
            resolved_input = self._resolve_input_text(state)
            # Safe diagnostic logging: only log input length, provider and model.
            input_chars = len(str(resolved_input or ""))
            state.setdefault("execution_log", []).append(
                f"{datetime.now(timezone.utc).isoformat()} LLM input prepared: input_chars={input_chars}, provider={provider_name}, model={model}"
            )
            response_text = provider.generate_text(prompt, resolved_input, model, temperature, max_tokens, api_key)
        except (ValueError, httpx.HTTPError, TimeoutError) as exc:
            state["errors"] = [str(exc)]
            state["execution_status"] = "failed"
            state.setdefault("execution_log", []).append(f"{datetime.now(timezone.utc).isoformat()} LLM execution failed: {exc}")
            return state

        state["llm_output"] = response_text
        state["llm_provider"] = provider_name
        state["llm_model"] = model
        state["llm_prompt"] = prompt
        state["llm_temperature"] = temperature
        state["llm_max_tokens"] = max_tokens
        state["execution_status"] = "completed"
        state.setdefault("execution_log", []).append(
            f"{datetime.now(timezone.utc).isoformat()} LLM execution completed using {provider_name} ({model})."
        )
        return state
