from datetime import UTC, datetime, timedelta

import pytest

from chatgpt_usage_widget.domain import UsageItem, format_duration


def test_usage_item_formats_countdown_and_local_reset() -> None:
    reset = datetime.now(UTC) + timedelta(hours=2, minutes=5)
    item = UsageItem("main", "ChatGPT", 63, reset)

    assert item.remaining_percent == 37
    assert item.countdown().startswith("reset ")
    assert "·" in item.reset_text()


@pytest.mark.parametrize(
    ("seconds", "expected"),
    [(0, "agora"), (59, "agora"), (60, "1min"), (3600, "1h"), (90000, "1d 1h")],
)
def test_format_duration(seconds: int, expected: str) -> None:
    assert format_duration(timedelta(seconds=seconds)) == expected


def test_usage_item_rejects_invalid_percentage() -> None:
    with pytest.raises(ValueError):
        UsageItem("main", "ChatGPT", 101)
