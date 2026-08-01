from chatgpt_usage_widget.domain import SnapshotStatus
from chatgpt_usage_widget.providers.demo import DemoProvider
from chatgpt_usage_widget.providers.manual import ManualProvider, ManualUsage


def test_demo_provider_returns_items() -> None:
    snapshot = DemoProvider().fetch()
    assert snapshot.status is SnapshotStatus.OK
    assert len(snapshot.items) == 2


def test_manual_provider_explains_missing_configuration() -> None:
    snapshot = ManualProvider().fetch()
    assert snapshot.status is SnapshotStatus.NOT_CONFIGURED
    assert "Configure" in snapshot.message


def test_manual_provider_returns_configured_item() -> None:
    snapshot = ManualProvider((ManualUsage(used_percent=42),)).fetch()
    assert snapshot.items[0].used_percent == 42
