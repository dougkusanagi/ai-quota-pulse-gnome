"""CLI and composition root for ChatGPT Usage Widget."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import __version__
from .logging_config import configure_logging
from .providers.demo import DemoProvider
from .providers.manual import ManualProvider
from .services import UsageService
from .storage import AppConfig, ConfigStore
from .ui import create_widget


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Widget compacto de uso do ChatGPT para Windows.")
    parser.add_argument(
        "--demo",
        action="store_true",
        help="inicia com dados simulados para validar o layout",
    )
    parser.add_argument(
        "--reset-config",
        action="store_true",
        help="remove a configuração local antes de iniciar",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    logger = configure_logging()
    if sys.platform != "win32":
        logger.warning("The widget is designed for Windows; continuing in compatibility mode.")

    store = ConfigStore()
    if args.reset_config:
        try:
            Path(store.path).unlink(missing_ok=True)
        except OSError:
            logger.exception("Could not reset configuration")
    config: AppConfig = store.load()
    if args.demo:
        config.mode = "demo"
    provider = (
        DemoProvider() if config.mode == "demo" else ManualProvider(tuple(config.manual_entries))
    )
    service = UsageService(provider)
    widget = create_widget(service, store, config)
    widget.run()
