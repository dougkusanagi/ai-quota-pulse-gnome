"""Tkinter user interface for the compact Windows widget."""

from __future__ import annotations

import logging
import tkinter as tk
from collections.abc import Callable
from datetime import UTC, datetime

from .domain import SnapshotStatus, UsageItem, UsageSnapshot
from .platform.windows import (
    anchored_position,
    apply_window_style,
    get_taskbar_geometry,
    is_window_visible_on_work_area,
)
from .providers.demo import DemoProvider
from .providers.manual import ManualProvider, ManualUsage
from .services import UsageService
from .storage import AppConfig, ConfigStore

LOGGER = logging.getLogger("chatgpt_usage_widget.ui")

BG = "#171717"
CARD_BG = "#232323"
BAR_BG = "#3B3B3B"
FG = "#F2F2F2"
DIM = "#A6A6A6"
ACCENT = "#10A37F"
ERROR = "#E35D6A"
WARNING = "#E8A83E"
TOPMOST_REASSERT_MS = 50


def parse_reset_input(value: str) -> datetime | None:
    """Parse local reset input accepted by the configuration dialog."""

    value = value.strip()
    if not value:
        return None
    candidates = ("%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M", "%d/%m/%y %H:%M")
    parsed: datetime | None = None
    local_tz = datetime.now().astimezone().tzinfo or UTC
    for fmt in candidates:
        try:
            parsed = datetime.strptime(value, fmt).replace(tzinfo=local_tz)
            break
        except ValueError:
            continue
    if parsed is None:
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("Use DD/MM/AAAA HH:MM ou AAAA-MM-DD HH:MM") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=local_tz)
    return parsed


class UsageCard(tk.Frame):
    """A three-line usage card sized to fit inside the Windows taskbar."""

    def __init__(
        self,
        parent: tk.Misc,
        item: UsageItem,
        initials: str,
    ) -> None:
        super().__init__(
            parent,
            bg=CARD_BG,
            padx=5,
            pady=2,
            highlightthickness=1,
            highlightbackground="#343434",
        )
        self.item = item
        self._avatar = tk.Canvas(
            self,
            width=22,
            height=22,
            bg=CARD_BG,
            highlightthickness=0,
        )
        self._avatar.grid(row=0, column=0, sticky="w")
        self._avatar.create_oval(1, 1, 21, 21, fill="#146CFF", outline="")
        self._avatar.create_text(11, 11, text=initials, fill="white", font=("Segoe UI", 7, "bold"))
        self._percent = tk.Label(
            self,
            text=f"{item.used_percent:.0f}%",
            bg=CARD_BG,
            fg=FG,
            font=("Segoe UI", 10, "bold"),
        )
        self._percent.grid(row=0, column=1, sticky="w", padx=(2, 0))
        self._reset = tk.Label(
            self,
            text=self._reset_text(),
            bg=CARD_BG,
            fg=DIM,
            font=("Segoe UI", 7),
            anchor="e",
        )
        self._reset.grid(row=0, column=2, sticky="e", padx=(2, 0))
        self._bar = tk.Canvas(self, width=142, height=7, bg=CARD_BG, highlightthickness=0)
        self._bar.grid(row=1, column=0, columnspan=3, sticky="ew", pady=(2, 1))
        self.columnconfigure(2, weight=1)
        self._bar.bind("<Configure>", lambda _event: self._draw_bar())
        self._draw_bar()

    def bind_drag(self, sequence: str, callback: Callable) -> None:
        for widget in (self, self._avatar, self._percent, self._reset):
            widget.bind(sequence, callback)

    def bind_context_menu(self, callback: Callable[[], None]) -> None:
        for widget in (self, self._avatar, self._percent, self._bar, self._reset):
            widget.bind("<Button-3>", lambda _event: callback())

    def _reset_text(self) -> str:
        return f"↻ {self.item.reset_text()}"

    def update_item(self, item: UsageItem) -> None:
        self.item = item
        self._percent.configure(text=f"{item.used_percent:.0f}%")
        self._reset.configure(text=self._reset_text())
        self._draw_bar()

    def update_countdown(self) -> None:
        self._reset.configure(text=self._reset_text())

    def _draw_bar(self) -> None:
        width = max(1, self._bar.winfo_width())
        height = max(1, self._bar.winfo_height())
        radius = height // 2
        self._bar.delete("all")
        self._rounded_rect(0, 0, width, height, radius, BAR_BG)
        fill_width = int(width * self.item.used_percent / 100)
        if fill_width > 0:
            self._rounded_rect(0, 0, max(fill_width, radius * 2), height, radius, self._color())

    def _color(self) -> str:
        if self.item.used_percent >= 90:
            return "#E35D6A"
        if self.item.used_percent >= 75:
            return "#E8A83E"
        return self.item.color or ACCENT

    def _rounded_rect(self, x1: int, y1: int, x2: int, y2: int, radius: int, color: str) -> None:
        self._bar.create_rectangle(x1 + radius, y1, x2 - radius, y2, fill=color, outline=color)
        self._bar.create_oval(x1, y1, x1 + radius * 2, y2, fill=color, outline=color)
        self._bar.create_oval(x2 - radius * 2, y1, x2, y2, fill=color, outline=color)


class UsageWidget:
    """Own the Tk root, render snapshots and persist user interactions."""

    def __init__(self, service: UsageService, store: ConfigStore, config: AppConfig) -> None:
        self.service = service
        self.store = store
        self.config = config
        self.root = tk.Tk()
        self.root.withdraw()
        self.root.title("ChatGPT Usage")
        self.root.configure(bg=BG)
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", config.always_on_top)
        try:
            self.root.attributes("-alpha", 0.97)
        except tk.TclError:
            pass
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.root.bind("<Escape>", lambda _event: self.close())
        self._drag_origin: tuple[int, int] | None = None
        self._cards: list[UsageCard] = []
        self._snapshot: UsageSnapshot = UsageSnapshot(
            status=SnapshotStatus.LOADING, source="widget"
        )
        self._menu: tk.Menu | None = None
        self._topmost_var = tk.BooleanVar(value=self.config.always_on_top)
        self._build_shell()
        self.root.bind("<Map>", self._reassert_topmost)
        self.root.bind("<Visibility>", self._reassert_topmost)
        self.root.bind("<FocusIn>", self._reassert_topmost)
        self.root.after_idle(self._finish_setup)

    def _build_shell(self) -> None:
        self._shell = tk.Frame(self.root, bg=BG)
        self._shell.pack(fill="both", expand=True)
        self._body = tk.Frame(self._shell, bg=BG)
        self._body.pack(fill="both", expand=True)
        self.root.bind("<Button-3>", lambda _event: self.open_menu())
        self._shell.bind("<Button-3>", lambda _event: self.open_menu())
        self._body.bind("<Button-3>", lambda _event: self.open_menu())

    def _finish_setup(self) -> None:
        self.root.update_idletasks()
        self._place_window()
        self.root.deiconify()
        self._reassert_topmost()
        self.refresh_now()
        self.root.after(1000, self._tick)
        self.root.after(TOPMOST_REASSERT_MS, self._topmost_tick)
        self.root.after(self.config.refresh_seconds * 1000, self._scheduled_refresh)

    def run(self) -> None:
        self.root.mainloop()

    def close(self) -> None:
        self._save_config()
        self.root.destroy()

    def _save_config(self) -> None:
        try:
            self.store.save(self.config)
        except OSError:
            LOGGER.exception("Could not save configuration")

    def refresh_now(self) -> None:
        self._snapshot = self.service.refresh()
        self._render(self._snapshot)

    def _scheduled_refresh(self) -> None:
        if self.root.winfo_exists():
            self.refresh_now()
            self.root.after(self.config.refresh_seconds * 1000, self._scheduled_refresh)

    def _tick(self) -> None:
        if not self.root.winfo_exists():
            return
        for card in self._cards:
            card.update_countdown()
        self.root.after(1000, self._tick)

    def _reassert_topmost(self, _event: tk.Event[tk.Misc] | None = None) -> None:
        if self.config.always_on_top and self.root.winfo_exists():
            self.root.attributes("-topmost", True)
            apply_window_style(self.root.winfo_id(), True)

    def _topmost_tick(self) -> None:
        if not self.root.winfo_exists():
            return
        menu_open = self._menu is not None and self._menu.winfo_exists()
        if not menu_open:
            self._reassert_topmost()
        self.root.after(TOPMOST_REASSERT_MS, self._topmost_tick)

    def _render(self, snapshot: UsageSnapshot) -> None:
        self._snapshot = snapshot
        for child in self._body.winfo_children():
            child.destroy()
        self._cards.clear()
        if snapshot.items:
            for index, item in enumerate(snapshot.items[:3]):
                card = UsageCard(
                    self._body,
                    item,
                    self.config.account_initials,
                )
                card.pack(side="left", fill="both", expand=True)
                card.bind_drag("<ButtonPress-1>", self._start_drag)
                card.bind_drag("<B1-Motion>", self._drag)
                card.bind_drag("<ButtonRelease-1>", self._finish_drag)
                card.bind_context_menu(self.open_menu)
                self._cards.append(card)
                if index < min(len(snapshot.items), 3) - 1:
                    tk.Frame(self._body, width=1, bg="#343434").pack(side="left", fill="y", pady=2)
        else:
            card = UsageCard(
                self._body,
                UsageItem("chatgpt", "ChatGPT", 0),
                self.config.account_initials,
            )
            card.pack(side="left", fill="both", expand=True)
            card.bind_drag("<ButtonPress-1>", self._start_drag)
            card.bind_drag("<B1-Motion>", self._drag)
            card.bind_drag("<ButtonRelease-1>", self._finish_drag)
            card.bind_context_menu(self.open_menu)
            self._cards.append(card)
        self.root.update_idletasks()
        self._place_window(resize=True)

    def _place_window(self, resize: bool = False) -> None:
        if resize:
            self.root.update_idletasks()
        width = max(230, self.root.winfo_reqwidth())
        height = max(38, min(48, self.root.winfo_reqheight()))
        geometry = get_taskbar_geometry()
        if self.config.position and is_window_visible_on_work_area(
            *self.config.position, width, height, geometry
        ):
            x, y = self.config.position
        else:
            x, y = anchored_position(
                width,
                height,
                self.config.tray_reserve_px,
                self.config.anchor_gap_px,
                geometry,
                self.root.winfo_screenwidth(),
                self.root.winfo_screenheight(),
            )
        self.root.geometry(f"{width}x{height}+{x}+{y}")

    def _start_drag(self, event: tk.Event[tk.Misc]) -> None:
        self._drag_origin = (
            event.x_root - self.root.winfo_x(),
            event.y_root - self.root.winfo_y(),
        )

    def _drag(self, event: tk.Event[tk.Misc]) -> None:
        if self._drag_origin is None:
            return
        x = event.x_root - self._drag_origin[0]
        y = event.y_root - self._drag_origin[1]
        self.root.geometry(f"+{x}+{y}")

    def _finish_drag(self, _event: tk.Event[tk.Misc]) -> None:
        if self._drag_origin is not None:
            self.config.position = (self.root.winfo_x(), self.root.winfo_y())
            self._save_config()
        self._drag_origin = None

    def open_menu(self) -> None:
        if self._menu is not None:
            self._menu.destroy()
        menu = tk.Menu(
            self.root,
            tearoff=False,
            bg="#252525",
            fg=FG,
            activebackground="#3A3A3A",
            activeforeground=FG,
            bd=0,
        )
        menu.add_command(label="Atualizar agora", command=self.refresh_now)
        menu.add_command(label="Configurar uso manual…", command=self.show_manual_dialog)
        menu.add_command(label="Usar dados de demonstração", command=self.use_demo)
        menu.add_separator()
        menu.add_command(label="Reancorar antes da tray", command=self.reanchor)
        menu.add_checkbutton(
            label="Sempre no topo",
            variable=self._topmost_var,
            command=self.toggle_topmost,
        )
        menu.add_separator()
        menu.add_command(label="Sair", command=self.close)
        self._menu = menu
        try:
            menu.tk_popup(
                self.root.winfo_rootx() + self.root.winfo_width() - 12,
                self.root.winfo_rooty() + self.root.winfo_height(),
            )
        finally:
            menu.grab_release()

    def toggle_topmost(self) -> None:
        self.config.always_on_top = bool(self._topmost_var.get())
        self.root.attributes("-topmost", self.config.always_on_top)
        apply_window_style(self.root.winfo_id(), self.config.always_on_top)
        self._save_config()

    def reanchor(self) -> None:
        self.config.position = None
        self._place_window()
        self._save_config()

    def use_demo(self) -> None:
        self.config.mode = "demo"
        self.service.set_provider(DemoProvider())
        self._save_config()
        self.refresh_now()

    def show_manual_dialog(self) -> None:
        dialog = tk.Toplevel(self.root)
        dialog.title("Uso do ChatGPT")
        dialog.configure(bg=BG)
        dialog.resizable(False, False)
        dialog.transient(self.root)
        current = self.config.manual_entries[0] if self.config.manual_entries else ManualUsage()
        tk.Label(dialog, text="Percentual usado", bg=BG, fg=FG, font=("Segoe UI", 9)).grid(
            row=0, column=0, sticky="w", padx=18, pady=(18, 4)
        )
        percent_entry = tk.Entry(
            dialog, width=12, bg="#2B2B2B", fg=FG, insertbackground=FG, relief="flat"
        )
        percent_entry.insert(0, f"{current.used_percent:g}")
        percent_entry.grid(row=0, column=1, sticky="w", padx=(0, 18), pady=(18, 4))
        tk.Label(dialog, text="Reset (DD/MM/AAAA HH:MM)", bg=BG, fg=FG, font=("Segoe UI", 9)).grid(
            row=1, column=0, sticky="w", padx=18, pady=4
        )
        reset_entry = tk.Entry(
            dialog, width=24, bg="#2B2B2B", fg=FG, insertbackground=FG, relief="flat"
        )
        if current.reset_at:
            reset_entry.insert(0, current.reset_at.astimezone().strftime("%d/%m/%Y %H:%M"))
        reset_entry.grid(row=1, column=1, sticky="w", padx=(0, 18), pady=4)
        hint = tk.Label(
            dialog,
            text="Deixe o reset vazio se a interface não informar uma data.",
            bg=BG,
            fg=DIM,
            font=("Segoe UI", 8),
            wraplength=290,
            justify="left",
        )
        hint.grid(row=2, column=0, columnspan=2, sticky="w", padx=18, pady=(2, 8))
        error = tk.Label(
            dialog,
            text="",
            bg=BG,
            fg=ERROR,
            font=("Segoe UI", 8),
            wraplength=290,
            justify="left",
        )
        error.grid(row=3, column=0, columnspan=2, sticky="w", padx=18)

        def save() -> None:
            try:
                percent = float(percent_entry.get().replace(",", "."))
                if not 0 <= percent <= 100:
                    raise ValueError("O percentual deve estar entre 0 e 100.")
                reset_at = parse_reset_input(reset_entry.get())
            except ValueError as exc:
                error.configure(text=str(exc))
                return
            self.config.mode = "manual"
            self.config.manual_entries = [ManualUsage(used_percent=percent, reset_at=reset_at)]
            self.service.set_provider(ManualProvider(tuple(self.config.manual_entries)))
            self._save_config()
            dialog.destroy()
            self.refresh_now()

        buttons = tk.Frame(dialog, bg=BG)
        buttons.grid(row=4, column=0, columnspan=2, sticky="e", padx=18, pady=(10, 18))
        tk.Button(
            buttons,
            text="Cancelar",
            command=dialog.destroy,
            bg="#343434",
            fg=FG,
            activebackground="#454545",
            activeforeground=FG,
            relief="flat",
            padx=12,
        ).pack(side="right", padx=(6, 0))
        tk.Button(
            buttons,
            text="Salvar",
            command=save,
            bg=ACCENT,
            fg="white",
            activebackground="#0C8B6B",
            activeforeground="white",
            relief="flat",
            padx=14,
        ).pack(side="right")
        dialog.bind("<Return>", lambda _event: save())
        dialog.bind("<Escape>", lambda _event: dialog.destroy())
        dialog.grab_set()
        dialog.wait_window()


def create_widget(service: UsageService, store: ConfigStore, config: AppConfig) -> UsageWidget:
    """Factory kept separate to make GUI startup easy to test in the future."""

    return UsageWidget(service, store, config)
