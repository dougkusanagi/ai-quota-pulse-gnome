from datetime import UTC

import pytest

from chatgpt_usage_widget.ui import parse_reset_input


def test_parse_reset_input_assumes_local_timezone() -> None:
    parsed = parse_reset_input("01/08/2026 14:30")
    assert parsed is not None
    assert parsed.tzinfo is not None
    assert parsed.hour == 14


def test_parse_reset_input_accepts_iso_offset() -> None:
    parsed = parse_reset_input("2026-08-01T14:30:00+00:00")
    assert parsed is not None
    assert parsed.tzinfo == UTC


def test_parse_reset_input_rejects_unknown_format() -> None:
    with pytest.raises(ValueError):
        parse_reset_input("tomorrow")
