import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

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
        item.add_child(panel);
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
