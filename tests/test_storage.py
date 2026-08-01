from datetime import UTC, datetime

from chatgpt_usage_widget.providers.manual import ManualUsage
from chatgpt_usage_widget.storage import AppConfig, ConfigStore


def test_config_store_round_trips_manual_entry(tmp_path) -> None:
    path = tmp_path / "config.json"
    config = AppConfig(
        refresh_seconds=5,
        position=(100, 200),
        manual_entries=[ManualUsage("main", "ChatGPT", 63, datetime(2026, 8, 1, 14, tzinfo=UTC))],
    )
    store = ConfigStore(path)
    store.save(config)
    loaded = store.load()

    assert loaded.refresh_seconds == 10
    assert loaded.position == (100, 200)
    assert loaded.manual_entries[0].used_percent == 63
    assert loaded.manual_entries[0].reset_at == datetime(2026, 8, 1, 14, tzinfo=UTC)


def test_corrupt_config_falls_back_to_defaults(tmp_path) -> None:
    path = tmp_path / "config.json"
    path.write_text("not json", encoding="utf-8")
    assert ConfigStore(path).load().mode == "manual"
