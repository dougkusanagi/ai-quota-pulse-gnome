"""Local configuration and secret-storage helpers."""

from __future__ import annotations

import json
import logging
import os
import tempfile
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from .providers.manual import ManualUsage

LOGGER = logging.getLogger(__name__)
APP_DIR_NAME = "ChatGPT Usage Widget"
KEYRING_SERVICE = "chatgpt-usage-widget"


def data_directory() -> Path:
    """Return the per-user writable directory used by the application."""

    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    path = base / APP_DIR_NAME
    path.mkdir(parents=True, exist_ok=True)
    return path


@dataclass(slots=True)
class AppConfig:
    """Settings deliberately kept free of credentials and session cookies."""

    mode: str = "manual"
    refresh_seconds: int = 180
    tray_reserve_px: int = 390
    anchor_gap_px: int = 12
    always_on_top: bool = True
    account_initials: str = "DL"
    position: tuple[int, int] | None = None
    manual_entries: list[ManualUsage] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.refresh_seconds = max(10, min(3600, int(self.refresh_seconds)))
        self.tray_reserve_px = max(180, min(1000, int(self.tray_reserve_px)))
        self.anchor_gap_px = max(0, min(100, int(self.anchor_gap_px)))
        self.account_initials = (
            "".join(ch for ch in self.account_initials.upper() if ch.isalnum())[:3] or "??"
        )
        if self.mode not in {"manual", "demo"}:
            self.mode = "manual"


class ConfigStore:
    """Read/write JSON atomically and tolerate a missing or corrupt file."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or data_directory() / "config.json"

    def load(self) -> AppConfig:
        if not self.path.exists():
            return AppConfig()
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            return self._from_dict(raw)
        except (OSError, ValueError, TypeError, KeyError) as exc:
            LOGGER.warning("Could not read config %s: %s", self.path, exc)
            return AppConfig()

    def save(self, config: AppConfig) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = self._to_dict(config)
        fd, temporary = tempfile.mkstemp(prefix="config-", suffix=".tmp", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
                json.dump(payload, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
            os.replace(temporary, self.path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    @staticmethod
    def _to_dict(config: AppConfig) -> dict[str, Any]:
        return {
            "mode": config.mode,
            "refresh_seconds": config.refresh_seconds,
            "tray_reserve_px": config.tray_reserve_px,
            "anchor_gap_px": config.anchor_gap_px,
            "always_on_top": config.always_on_top,
            "account_initials": config.account_initials,
            "position": list(config.position) if config.position else None,
            "manual_entries": [
                {
                    "key": entry.key,
                    "label": entry.label,
                    "used_percent": entry.used_percent,
                    "reset_at": entry.reset_at.isoformat() if entry.reset_at else None,
                    "color": entry.color,
                }
                for entry in config.manual_entries
            ],
        }

    @staticmethod
    def _from_dict(raw: dict[str, Any]) -> AppConfig:
        entries: list[ManualUsage] = []
        for item in raw.get("manual_entries", []):
            reset_at = item.get("reset_at")
            entries.append(
                ManualUsage(
                    key=str(item.get("key", "chatgpt-main")),
                    label=str(item.get("label", "ChatGPT")),
                    used_percent=float(item.get("used_percent", 0)),
                    reset_at=datetime.fromisoformat(reset_at) if reset_at else None,
                    color=str(item.get("color", "#10A37F")),
                )
            )
        position_raw = raw.get("position")
        position = None
        if isinstance(position_raw, (list, tuple)) and len(position_raw) == 2:
            position = (int(position_raw[0]), int(position_raw[1]))
        return AppConfig(
            mode=str(raw.get("mode", "manual")),
            refresh_seconds=int(raw.get("refresh_seconds", 180)),
            tray_reserve_px=int(raw.get("tray_reserve_px", 390)),
            anchor_gap_px=int(raw.get("anchor_gap_px", 12)),
            always_on_top=bool(raw.get("always_on_top", True)),
            account_initials=str(raw.get("account_initials", "DL")),
            position=position,
            manual_entries=entries,
        )


class SecretStore:
    """Small wrapper for a future authenticated provider's secret."""

    def __init__(self, service: str = KEYRING_SERVICE) -> None:
        self.service = service

    def get(self, account: str = "default") -> str | None:
        try:
            import keyring

            return keyring.get_password(self.service, account)
        except Exception as exc:  # noqa: BLE001  # pragma: no cover - backend varies by machine
            LOGGER.warning("Secret store unavailable: %s", exc)
            return None

    def set(self, secret: str, account: str = "default") -> None:
        try:
            import keyring

            keyring.set_password(self.service, account, secret)
        except Exception as exc:  # pragma: no cover - backend varies by machine
            raise RuntimeError(
                "Não foi possível salvar o segredo no Windows Credential Manager"
            ) from exc

    def delete(self, account: str = "default") -> None:
        try:
            import keyring

            keyring.delete_password(self.service, account)
        except Exception as exc:  # noqa: BLE001  # pragma: no cover - backend varies by machine
            LOGGER.debug("Secret deletion skipped: %s", exc)
