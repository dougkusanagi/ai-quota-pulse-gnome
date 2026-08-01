"""Deterministic demo provider used for UI development and screenshots."""

from __future__ import annotations

from datetime import datetime, timedelta

from ..domain import UsageItem, UsageSnapshot


class DemoProvider:
    name = "demo"

    def fetch(self) -> UsageSnapshot:
        now = datetime.now().astimezone()
        return UsageSnapshot(
            items=(
                UsageItem(
                    key="chatgpt-main",
                    label="ChatGPT",
                    used_percent=63,
                    reset_at=now + timedelta(hours=2, minutes=18),
                    color="#10A37F",
                ),
                UsageItem(
                    key="chatgpt-thinking",
                    label="Thinking",
                    used_percent=28,
                    reset_at=now + timedelta(days=1, hours=5),
                    color="#8B5CF6",
                ),
            ),
            source=self.name,
        )
