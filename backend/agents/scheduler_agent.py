from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from agents.base_agent import BaseAgent
from graph.state import WorkflowState


class SchedulerAgent(BaseAgent):
    def __init__(self, node_id: str | None = None) -> None:
        self.node_id = node_id

    def _parse_datetime(self, value: Any) -> datetime | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc)
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
            except ValueError:
                return None
        return None

    def _get_schedule_config(self, state: WorkflowState) -> dict[str, Any]:
        workflow_data = state.get("workflow_data") or {}
        nodes = workflow_data.get("nodes") or []

        for node in nodes if isinstance(nodes, list) else []:
            if isinstance(node, dict) and node.get("id") == state.get("current_node"):
                data = node.get("data") if isinstance(node.get("data"), dict) else {}
                return dict(data)

        return {}

    def execute(self, state: WorkflowState) -> WorkflowState:
        config = self._get_schedule_config(state)
        schedule_type = str(config.get("scheduleType") or "interval").lower()
        configured_interval = config.get("intervalMinutes")
        if configured_interval is None:
            configured_interval = config.get("interval")
        interval_minutes = int(configured_interval if configured_interval is not None else 60)
        cron_expression = str(config.get("cronExpression") or "").strip()
        now = datetime.now(timezone.utc)

        if schedule_type == "interval" and interval_minutes <= 0:
            state["scheduler_status"] = "failed"
            state["execution_status"] = "failed"
            state["errors"] = ["Scheduler intervalMinutes must be greater than zero."]
            state.setdefault("execution_log", []).append(
                f"{now.isoformat()} Scheduler failed: intervalMinutes must be greater than zero."
            )
            return state

        last_run = self._parse_datetime(state.get("scheduler_last_run"))
        if last_run is None and config.get("lastRunAt") is not None:
            last_run = self._parse_datetime(config.get("lastRunAt"))

        due = False
        next_run_at = None

        if schedule_type == "cron" and cron_expression:
            due = True
            next_run_at = (now + timedelta(minutes=1)).isoformat()
        elif schedule_type == "interval":
            if last_run is None:
                due = True
            else:
                due = now - last_run >= timedelta(minutes=interval_minutes)
            next_run_at = (now + timedelta(minutes=interval_minutes)).isoformat()
        elif schedule_type == "once":
            due = last_run is None
            next_run_at = None
        else:
            state["scheduler_status"] = "failed"
            state["execution_status"] = "failed"
            state["errors"] = [f"Unsupported scheduler scheduleType: {schedule_type or '<empty>'}."]
            state.setdefault("execution_log", []).append(
                f"{now.isoformat()} Scheduler failed: unsupported scheduleType={schedule_type or '<empty>'}."
            )
            return state

        state["scheduler_status"] = "scheduled" if due else "waiting"
        state["scheduler_last_run"] = now.isoformat() if due else (state.get("scheduler_last_run") or now.isoformat())
        state["scheduler_next_run_at"] = next_run_at
        state.setdefault("execution_log", []).append(
            f"{now.isoformat()} Scheduler evaluated: type={schedule_type}, due={due}, next_run_at={next_run_at}"
        )

        if due:
            state["execution_status"] = "received"
            return state

        state["execution_status"] = "waiting"
        return state
