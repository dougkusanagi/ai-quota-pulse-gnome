"""ChatGPT Usage Widget package."""

from __future__ import annotations

__all__ = ["__version__", "main"]

__version__ = "0.1.0"


def main() -> None:
    """Console-script entry point."""
    from .app import main as run

    run()
