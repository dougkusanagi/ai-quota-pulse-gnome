import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
export const box = (vertical = false, style_class = '', props = {}) => new St.BoxLayout({vertical, style_class, ...props});
export const label = (text, style_class = '', props = {}) => new St.Label({text, style_class, y_align: Clutter.ActorAlign.CENTER, ...props});
export function button(text, action, icon = null, style = 'ai-button') {
    const b = new St.Button({style_class: style, can_focus: true, accessible_name: text});
    const content = box(false, 'ai-button-content');
    if (icon) content.add_child(new St.Icon({icon_name: icon, icon_size: 14, y_align: Clutter.ActorAlign.CENTER}));
    if (text && !style.includes('ai-icon-button')) content.add_child(label(text));
    b.set_child(content); b.connect('clicked', action); return b;
}
export function identity(account, path, panel = false) {
    const [size, boxW, boxH, bx, by] = panel ? [20, 25, 23, 11, 9] : [26, 32, 29, 14, 12];
    const overlay = new St.Widget({layout_manager: new Clutter.FixedLayout(), width: boxW, height: boxH,
        y_align: Clutter.ActorAlign.CENTER});
    const icon = new St.Icon({gicon: Gio.FileIcon.new(Gio.File.new_for_path(`${path}/icons/${account.provider}-symbolic.svg`)),
        icon_size: size, x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.START,
        style_class: account.provider === 'openai' ? (panel ? 'ai-logo-panel' : 'ai-logo') : 'ai-claude-logo'});
    overlay.add_child(icon);
    // A Bin centers the initials on both axes; label text-align only centers horizontally.
    const badge = new St.Bin({style_class: 'ai-badge', x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
    badge.set_child(new St.Label({text: account.initials, style_class: 'ai-badge-text', x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER}));
    icon.set_position(0, 0);
    badge.set_position(bx, by);
    if (panel) badge.add_style_class_name('ai-badge-small');
    badge.set_style(`background-color: ${account.color};`); overlay.add_child(badge); return overlay;
}
export function choice(title, options, selected, changed) {
    const group = box(true, 'ai-choice');
    const row = box(false, 'ai-setting-row');
    row.add_child(label(title, '', {x_expand: true}));
    const choices = box(true, 'ai-options'); choices.hide();
    const currentText = () => options.find(o => o[0] === selected)?.[1] ?? String(selected);
    const display = button(`${currentText()} ▾`, () => {
        choices.visible = !choices.visible;
        display.checked = choices.visible;
        display.accessible_name = `${title}: ${currentText()}, ${choices.visible ? 'expandido' : 'recolhido'}`;
    });
    display.toggle_mode = true;
    display.accessible_name = `${title}: ${currentText()}, recolhido`;
    row.add_child(display); group.add_child(row); group.add_child(choices);
    const items = [];
    for (const [value, text] of options) {
        const option = button(text, () => {
            selected = value; display.get_child().get_last_child().text = `${text} ▾`;
            choices.hide(); display.checked = false;
            display.accessible_name = `${title}: ${text}, recolhido`;
            for (const [item, key] of items) {
                item.checked = key === value;
                item.set_style_class_name(`ai-option${key === value ? ' selected' : ''}`);
            }
            changed(value);
        }, null, `ai-option${value === selected ? ' selected' : ''}`);
        option.toggle_mode = true; option.checked = value === selected;
        items.push([option, value]); choices.add_child(option);
    }
    return group;
}

export function tooltip(actor, text) {
    let tip = null;
    const hide = () => { tip?.destroy(); tip = null; };
    actor.connect('enter-event', () => {
        if (tip) return;
        tip = new St.Label({text, style_class: 'ai-tooltip'});
        Main.uiGroup.add_child(tip); Main.uiGroup.set_child_above_sibling(tip, null);
        const [x, y] = actor.get_transformed_position(), [w, h] = actor.get_transformed_size();
        tip.set_position(Math.round(x + w / 2 - tip.width / 2), Math.round(y + h + 4));
    });
    actor.connect('leave-event', hide);
    actor.connect('destroy', hide);
}
// Counter-clockwise arrow (mirrored refresh icon) marking when the quota resets.
export function resetIcon() {
    const icon = new St.Icon({icon_name: 'view-refresh-symbolic', icon_size: 12, style_class: 'ai-reset-icon',
        reactive: true, track_hover: true, y_align: Clutter.ActorAlign.CENTER});
    icon.set_pivot_point(0.5, 0.5); icon.scale_x = -1;
    tooltip(icon, 'Renova em');
    return icon;
}
