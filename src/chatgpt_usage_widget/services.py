"""Application services for polling providers and retaining good data."""

from __future__ import annotations

import logging

from .domain import SnapshotStatus, UsageSnapshot
from .providers.base import UsageProvider

LOGGER = logging.getLogger("chatgpt_usage_widget.services")


class UsageService:
    """Fetch usage while keeping the last successful snapshot as a fallback."""

    def __init__(self, provider: UsageProvider) -> None:
        self.provider = provider
        self.last_snapshot: UsageSnapshot | None = None

    def set_provider(self, provider: UsageProvider) -> None:
        self.provider = provider
        self.last_snapshot = None

    def refresh(self) -> UsageSnapshot:
        try:
            snapshot = self.provider.fetch()
        except Exception as exc:
            LOGGER.exception("Usage provider failed")
            if self.last_snapshot is not None:
                return self.last_snapshot.with_status(
                    SnapshotStatus.STALE,
                    f"Falha ao atualizar; mostrando dados de {self.last_snapshot.source}.",
                )
            return UsageSnapshot.error(f"Não foi possível atualizar: {exc}", self.provider.name)

        if snapshot.status is SnapshotStatus.OK:
            self.last_snapshot = snapshot
        elif snapshot.status is SnapshotStatus.ERROR and self.last_snapshot is not None:
            return self.last_snapshot.with_status(
                SnapshotStatus.STALE,
                snapshot.message or "Falha ao atualizar; mostrando o último valor válido.",
            )
        return snapshot
