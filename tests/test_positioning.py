from chatgpt_usage_widget.platform.windows import (
    Rect,
    TaskbarGeometry,
    anchored_position,
)


def test_anchored_position_is_before_tray_on_bottom_taskbar() -> None:
    geometry = TaskbarGeometry(Rect(0, 0, 1920, 1040), Rect(0, 1040, 1920, 1080))
    x, y = anchored_position(300, 80, tray_reserve_px=390, gap_px=12, geometry=geometry)

    assert x == 1218
    assert y == 1000


def test_anchored_position_clamps_to_left_work_area() -> None:
    geometry = TaskbarGeometry(Rect(100, 0, 1000, 1040), Rect(100, 1040, 1000, 1080))
    x, _ = anchored_position(800, 80, tray_reserve_px=390, geometry=geometry)
    assert x == 100
