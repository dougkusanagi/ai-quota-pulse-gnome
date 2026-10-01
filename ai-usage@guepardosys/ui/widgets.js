import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
export const box = (vertical = false, style_class = '', props = {}) => new St.BoxLayout({vertical, style_class, ...props});
export const label = (text, style_class = '', props = {}) => new St.Label({text, style_class, y_align: Clutter.ActorAlign.CENTER, ...props});
export const wrapped = (text, style_class = '', props = {}) => {
    const l = label(text, style_class, props); l.clutter_text.line_wrap = true; l.clutter_text.ellipsize = 0; return l;
};
export const glyph = (icon_name, size = 14, style_class = '') => new St.Icon({icon_name, icon_size: size, style_class});
export function button(text, action, icon = null, style = 'ai-button') {
    const b = new St.Button({style_class: style, can_focus: true, accessible_name: text});
    const content = box(false, 'ai-button-content', {x_align: Clutter.ActorAlign.CENTER});
    if (icon) content.add_child(glyph(icon, 14));
    if (text) content.add_child(label(text));
    b.set_child(content); b.connect('clicked', action); return b;
}
// Quiet 28px square button for toolbar-like actions; the accessible name replaces a tooltip.
export function iconButton(icon, name, action, style = '') {
    const b = new St.Button({style_class: `ai-icon-button ${style}`, can_focus: true, accessible_name: name,
        child: glyph(icon, 16), y_align: Clutter.ActorAlign.CENTER});
    b.connect('clicked', action); return b;
}
// Provider tile with the profile badge overlapping its corner. The panel variant has no tile.
export function identity(account, path, {panel = false} = {}) {
    const [size, boxW, boxH, bx, by] = panel ? [20, 25, 23, 11, 9] : [20, 38, 38, 22, 22];
    const overlay = new St.Widget({layout_manager: new Clutter.FixedLayout(), width: boxW, height: boxH,
        y_align: Clutter.ActorAlign.CENTER});
    const tile = new St.Bin({style_class: panel ? '' : 'ai-tile', x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.START});
    tile.set_child(new St.Icon({gicon: Gio.FileIcon.new(Gio.File.new_for_path(`${path}/icons/${account.provider}-symbolic.svg`)),
        icon_size: size, style_class: account.provider === 'openai' ? (panel ? 'ai-logo-panel' : 'ai-logo') : 'ai-claude-logo'}));
    overlay.add_child(tile);
    // A Bin centers the initials on both axes; label text-align only centers horizontally.
    const badge = new St.Bin({style_class: 'ai-badge', x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
    badge.set_child(new St.Label({text: account.initials, style_class: 'ai-badge-text', x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER}));
    badge.set_position(bx, by);
    badge.add_style_class_name(panel ? 'ai-badge-small' : 'ai-badge-large');
    badge.set_style(`background-color: ${account.color};`); overlay.add_child(badge);
    overlay.update = next => { badge.set_style(`background-color: ${next.color};`); badge.get_child().text = next.initials; };
    return overlay;
}
// Inline single-choice control; replaces a drop-down so every option is visible and one click away.
export function segmented(title, options, selected, changed) {
    const group = box(false, 'ai-seg', {accessible_name: title});
    const items = [];
    for (const [value, text] of options) {
        const item = new St.Button({style_class: 'ai-seg-item', can_focus: true, toggle_mode: true, label: text,
            accessible_name: text, x_expand: true, checked: value === selected});
        if (value === selected) item.add_style_class_name('selected');
        item.connect('clicked', () => {
            for (const [other, key] of items) {
                other.checked = key === value;
                if (key === value) other.add_style_class_name('selected'); else other.remove_style_class_name('selected');
            }
            changed(value);
        });
        items.push([item, value]); group.add_child(item);
    }
    return group;
}
export function toggle(title, active, changed) {
    const knob = new St.Widget({style_class: 'ai-switch-knob', y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.START});
    const sw = new St.Button({style_class: 'ai-switch', can_focus: true, toggle_mode: true, checked: active,
        accessible_name: title, y_align: Clutter.ActorAlign.CENTER, child: knob});
    const sync = animate => {
        if (sw.checked) sw.add_style_class_name('on'); else sw.remove_style_class_name('on');
        const x = sw.checked ? 16 : 0;
        if (animate) knob.ease({translation_x: x, duration: 140, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        else knob.translation_x = x;
    };
    sync(false);
    sw.connect('clicked', () => { sync(true); changed(sw.checked); });
    return sw;
}
// A titled row of an inset group; groups draw the hairlines between rows.
export function settingRow(title, control, caption = null) {
    const row = box(false, 'ai-row');
    const names = box(true, 'ai-row-names', {x_expand: true, y_align: Clutter.ActorAlign.CENTER});
    names.add_child(label(title, 'ai-row-title'));
    if (caption) names.add_child(label(caption, 'ai-caption'));
    row.add_child(names); row.add_child(control); return row;
}
export const group = (...rows) => { const g = box(true, 'ai-group', {x_expand: true}); rows.forEach(r => g.add_child(r)); return g; };
