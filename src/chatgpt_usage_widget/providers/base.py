"""Provider protocol used to keep data acquisition replaceable."""

from __future__ import annotations

from typing import Protocol

from ..domain import UsageSnapshot


class UsageProvider(Protocol):
    """Synchronous provider contract; the service can run it off the UI thread."""

    name: str

    def fetch(self) -> UsageSnapshot:
        """Return the latest snapshot without mutating the UI."""
        ...
