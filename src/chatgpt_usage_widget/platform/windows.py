"""Small, isolated Win32 helpers used by the floating taskbar widget."""

from __future__ import annotations

import ctypes
import os
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class Rect:
    left: int
    top: int
    right: int
    bottom: int

    @property
    def width(self) -> int:
        return max(0, self.right - self.left)

    @property
    def height(self) -> int:
        return max(0, self.bottom - self.top)


@dataclass(frozen=True, slots=True)
class TaskbarGeometry:
    work_area: Rect
    taskbar: Rect


def get_taskbar_geometry() -> TaskbarGeometry | None:
    """Get the primary taskbar and its monitor work area, when available."""

    if os.name != "nt":
        return None
    user32 = ctypes.windll.user32
    hwnd = user32.FindWindowW("Shell_TrayWnd", None)
    if not hwnd:
        return None

    class NativeRect(ctypes.Structure):
        _fields_ = [
            ("left", ctypes.c_long),
            ("top", ctypes.c_long),
            ("right", ctypes.c_long),
            ("bottom", ctypes.c_long),
        ]

    class MonitorInfo(ctypes.Structure):
        _fields_ = [
            ("cbSize", ctypes.c_ulong),
            ("rcMonitor", NativeRect),
            ("rcWork", NativeRect),
            ("dwFlags", ctypes.c_ulong),
        ]

    taskbar_rect = NativeRect()
    if not user32.GetWindowRect(hwnd, ctypes.byref(taskbar_rect)):
        return None
    monitor = user32.MonitorFromWindow(hwnd, 2)  # MONITOR_DEFAULTTONEAREST
    if not monitor:
        return None
    info = MonitorInfo()
    info.cbSize = ctypes.sizeof(MonitorInfo)
    if not user32.GetMonitorInfoW(monitor, ctypes.byref(info)):
        return None
    return TaskbarGeometry(
        work_area=Rect(info.rcWork.left, info.rcWork.top, info.rcWork.right, info.rcWork.bottom),
        taskbar=Rect(taskbar_rect.left, taskbar_rect.top, taskbar_rect.right, taskbar_rect.bottom),
    )


def anchored_position(
    width: int,
    height: int,
    tray_reserve_px: int = 390,
    gap_px: int = 12,
    geometry: TaskbarGeometry | None = None,
    screen_width: int | None = None,
    screen_height: int | None = None,
) -> tuple[int, int]:
    """Calculate a bottom-right taskbar position before the reserved tray area."""

    if geometry is None:
        right = screen_width or 1920
        bottom = screen_height or 1080
        return (
            max(0, right - tray_reserve_px - gap_px - width),
            max(0, bottom - height - 2),
        )

    x = geometry.work_area.right - tray_reserve_px - gap_px - width
    x = max(geometry.work_area.left, min(x, geometry.work_area.right - width))

    # Windows taskbars can be docked to any edge. The MVP targets bottom first,
    # while these fallbacks keep the widget on-screen for other orientations.
    taskbar = geometry.taskbar
    if taskbar.top >= geometry.work_area.bottom - taskbar.height - 4:
        y = taskbar.top + max(0, (taskbar.height - height) // 2)
        y = max(geometry.work_area.top, min(y, taskbar.bottom - height))
    elif taskbar.bottom <= geometry.work_area.top + taskbar.height + 4:
        y = taskbar.bottom + gap_px
        y = min(y, geometry.work_area.bottom - height)
    else:
        y = max(geometry.work_area.top, geometry.work_area.bottom - height - gap_px)
        y = min(y, geometry.work_area.bottom - height)
    return (x, y)


def set_window_topmost(hwnd: int, always_on_top: bool = True) -> None:
    """Move a window to or from the topmost band without activating it."""

    if os.name != "nt":
        return
    user32 = ctypes.windll.user32
    insert_after: Any = -1 if always_on_top else -2  # HWND_TOPMOST / HWND_NOTOPMOST
    user32.SetWindowPos(
        hwnd,
        insert_after,
        0,
        0,
        0,
        0,
        0x0001 | 0x0002 | 0x0010 | 0x0040,  # NOMOVE | NOSIZE | NOACTIVATE | SHOWWINDOW
    )


def apply_window_style(hwnd: int, always_on_top: bool = True) -> None:
    """Mark a Tk window as a non-activating tool window and set topmost state."""

    if os.name != "nt":
        return
    user32 = ctypes.windll.user32
    get_window_long = getattr(user32, "GetWindowLongPtrW", user32.GetWindowLongW)
    set_window_long = getattr(user32, "SetWindowLongPtrW", user32.SetWindowLongW)
    exstyle = get_window_long(hwnd, -20)  # GWL_EXSTYLE
    exstyle |= 0x00000080  # WS_EX_TOOLWINDOW
    exstyle |= 0x08000000  # WS_EX_NOACTIVATE
    exstyle &= ~0x00040000  # WS_EX_APPWINDOW
    set_window_long(hwnd, -20, exstyle)
    # SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW |
    # SWP_FRAMECHANGED. The z-order move is kept separate so the periodic
    # reassertion does not repeatedly change the window style.
    user32.SetWindowPos(
        hwnd,
        -1 if always_on_top else -2,
        0,
        0,
        0,
        0,
        0x0001 | 0x0002 | 0x0010 | 0x0020 | 0x0040,
    )


def is_window_visible_on_work_area(
    x: int, y: int, width: int, height: int, geometry: TaskbarGeometry | None
) -> bool:
    """Return whether enough of a saved position remains visible."""

    if geometry is None:
        return True
    visible_width = min(x + width, geometry.work_area.right) - max(x, geometry.work_area.left)
    monitor_top = min(geometry.work_area.top, geometry.taskbar.top)
    monitor_bottom = max(geometry.work_area.bottom, geometry.taskbar.bottom)
    visible_height = min(y + height, monitor_bottom) - max(y, monitor_top)
    return visible_width >= min(80, width) and visible_height >= min(30, height)
