"""Domain objects shared by providers, services and the user interface."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum


class SnapshotStatus(StrEnum):
    """State of the most recent attempt to obtain usage data."""

    OK = "ok"
    LOADING = "loading"
    NOT_CONFIGURED = "not_configured"
    ERROR = "error"
    STALE = "stale"


def localize_datetime(value: datetime | None) -> datetime | None:
    """Return an aware datetime, assuming local time for naive values."""

    if value is None or value.tzinfo is not None:
        return value
    return value.astimezone()


def format_duration(until: timedelta) -> str:
    """Format a reset countdown in a compact, locale-neutral form."""

    seconds = max(0, int(until.total_seconds()))
    if seconds < 60:
        return "agora"
    minutes, _ = divmod(seconds, 60)
    days, minutes = divmod(minutes, 24 * 60)
    hours, minutes = divmod(minutes, 60)
    if days:
        return f"{days}d {hours}h" if hours else f"{days}d"
    if hours:
        return f"{hours}h {minutes}min" if minutes else f"{hours}h"
    return f"{minutes}min"


@dataclass(frozen=True, slots=True)
class UsageItem:
    """One independently-resettable ChatGPT usage allowance."""

    key: str
    label: str
    used_percent: float
    reset_at: datetime | None = None
    color: str = "#10A37F"

    def __post_init__(self) -> None:
        if not self.key.strip():
            raise ValueError("UsageItem.key cannot be empty")
        if not self.label.strip():
            raise ValueError("UsageItem.label cannot be empty")
        if not math.isfinite(self.used_percent) or not 0 <= self.used_percent <= 100:
            raise ValueError("used_percent must be between 0 and 100")
        object.__setattr__(self, "reset_at", localize_datetime(self.reset_at))

    @property
    def remaining_percent(self) -> float:
        return 100.0 - self.used_percent

    def countdown(self, now: datetime | None = None) -> str:
        """Return a human-readable countdown to this item's reset."""

        if self.reset_at is None:
            return "reset indisponível"
        current = localize_datetime(now or datetime.now().astimezone())
        assert current is not None
        return f"reset {format_duration(self.reset_at - current)}"

    def reset_text(self) -> str:
        """Return the reset date/time in the user's local time zone."""

        if self.reset_at is None:
            return "reset indisponível"
        return self.reset_at.astimezone().strftime("%d/%m · %H:%M")


@dataclass(frozen=True, slots=True)
class UsageSnapshot:
    """Immutable result returned by a usage provider."""

    items: tuple[UsageItem, ...] = ()
    status: SnapshotStatus = SnapshotStatus.OK
    source: str = "unknown"
    message: str = ""
    fetched_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def __post_init__(self) -> None:
        object.__setattr__(self, "fetched_at", localize_datetime(self.fetched_at))

    @classmethod
    def not_configured(cls, message: str, source: str = "manual") -> UsageSnapshot:
        return cls(status=SnapshotStatus.NOT_CONFIGURED, source=source, message=message)

    @classmethod
    def error(cls, message: str, source: str = "unknown") -> UsageSnapshot:
        return cls(status=SnapshotStatus.ERROR, source=source, message=message)

    def with_status(self, status: SnapshotStatus, message: str | None = None) -> UsageSnapshot:
        return UsageSnapshot(
            items=self.items,
            status=status,
            source=self.source,
            message=self.message if message is None else message,
            fetched_at=self.fetched_at,
        )
