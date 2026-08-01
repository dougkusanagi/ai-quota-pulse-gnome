"""Privacy-conscious rotating application log."""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler

from .storage import data_directory


def configure_logging(level: int = logging.INFO) -> logging.Logger:
    logger = logging.getLogger("chatgpt_usage_widget")
    if logger.handlers:
        return logger
    logger.setLevel(level)
    handler = RotatingFileHandler(
        data_directory() / "widget.log",
        maxBytes=512 * 1024,
        backupCount=2,
        encoding="utf-8",
    )
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    )
    logger.addHandler(handler)
    logger.propagate = False
    return logger
