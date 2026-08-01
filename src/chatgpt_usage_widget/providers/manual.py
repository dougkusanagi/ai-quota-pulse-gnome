"""Provider backed by values entered by the user in the local configuration."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ..domain import UsageItem, UsageSnapshot


@dataclass(frozen=True, slots=True)
class ManualUsage:
    """Serializable user-entered usage data."""

    key: str = "chatgpt-main"
    label: str = "ChatGPT"
    used_percent: float = 0.0
    reset_at: datetime | None = None
    color: str = "#10A37F"

    def to_item(self) -> UsageItem:
        return UsageItem(
            key=self.key,
            label=self.label,
            used_percent=self.used_percent,
            reset_at=self.reset_at,
            color=self.color,
        )


class ManualProvider:
    name = "manual"

    def __init__(self, entries: tuple[ManualUsage, ...] = ()) -> None:
        self.entries = entries

    def fetch(self) -> UsageSnapshot:
        if not self.entries:
            return UsageSnapshot.not_configured(
                "Configure o percentual e o reset do ChatGPT.", source=self.name
            )
        try:
            items = tuple(entry.to_item() for entry in self.entries)
        except (TypeError, ValueError) as exc:
            return UsageSnapshot.error(f"Dados manuais inválidos: {exc}", source=self.name)
        return UsageSnapshot(items=items, source=self.name)
