from chatgpt_usage_widget.domain import SnapshotStatus, UsageItem, UsageSnapshot
from chatgpt_usage_widget.services import UsageService


class FailingProvider:
    name = "failing"

    def __init__(self) -> None:
        self.fail = False

    def fetch(self) -> UsageSnapshot:
        if self.fail:
            raise RuntimeError("offline")
        return UsageSnapshot(items=(UsageItem("main", "ChatGPT", 25),), source=self.name)


def test_service_keeps_last_good_snapshot_when_provider_fails() -> None:
    provider = FailingProvider()
    service = UsageService(provider)
    first = service.refresh()
    provider.fail = True
    stale = service.refresh()

    assert first.status is SnapshotStatus.OK
    assert stale.status is SnapshotStatus.STALE
    assert stale.items[0].used_percent == 25
