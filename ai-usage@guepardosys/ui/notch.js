import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const EAR = 10;

// Concave corner that melts the popup into the bottom edge of the top bar.
const Ear = GObject.registerClass(class Ear extends St.DrawingArea {
    _init(right) {
        super._init({style_class: 'ai-ear', width: EAR, height: EAR, y_align: Clutter.ActorAlign.START});
        this._right = right;
        this.connect('repaint', () => this._draw());
    }
    _draw() {
        const cr = this.get_context(), c = this.get_theme_node().get_foreground_color();
        cr.setSourceRGBA(c.red / 255, c.green / 255, c.blue / 255, c.alpha / 255);
        if (this._right) { cr.moveTo(EAR, 0); cr.lineTo(0, 0); cr.lineTo(0, EAR); cr.arc(EAR, EAR, EAR, Math.PI, Math.PI * 1.5); }
        else { cr.moveTo(0, 0); cr.lineTo(EAR, 0); cr.lineTo(EAR, EAR); cr.arcNegative(0, EAR, EAR, 0, -Math.PI / 2); }
        cr.closePath(); cr.fill(); cr.$dispose();
    }
});

// Keep the shared controller interface while using GNOME's native panel menu.
export class Notch {
    constructor({compact, panel, onOpenChanged, onDismiss}) {
        this.compact = compact; this.panel = panel;
        this.actor = new PanelMenu.Button(0.5, 'AI Usage');
        this.actor.add_style_class_name('ai-panel-indicator');
        this.actor.add_child(compact);
        this.menu = this.actor.menu;
        this.menu.actor.add_style_class_name('ai-menu');
        const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false,
            style_class: 'ai-popup-item'});
        // Ears + square top + rounded bottom: the popup hangs from the bar like a notch.
        const wrap = new St.BoxLayout({style_class: 'ai-notch-wrap', x_expand: true});
        const surface = new St.Bin({style_class: 'ai-notch', child: panel});
        wrap.add_child(new Ear(false)); wrap.add_child(surface); wrap.add_child(new Ear(true));
        item.add_child(wrap);
        this.menu.addMenuItem(item);
        this.isOpen = false;
        this._menuSignal = this.menu.connect('open-state-changed', (_menu, open) => {
            this.isOpen = open;
            if (!open) onDismiss?.();
            onOpenChanged?.(open);
        });
        Main.panel.addToStatusArea('ai-usage', this.actor, Main.panel._leftBox.get_n_children(), 'left');
    }
    // Native popup menus already keep forms open and handle outside clicks/Escape.
    pin(_on) {}
    open() { this.menu.open(); }
    close() { this.menu.close(); }
    refit() { this.menu.actor.queue_relayout(); }
    destroy() {
        this.menu.disconnect(this._menuSignal);
        this.actor.destroy();
    }
}
