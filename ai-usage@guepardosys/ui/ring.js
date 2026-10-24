import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import {fillFraction, toneFor} from './bar.js';

// Progress ring of the notch: remaining quota sweeps clockwise from 12 o'clock.
export const UsageRing = GObject.registerClass(class UsageRing extends St.DrawingArea {
    _init(percent, {colored = true, dark = true, big = false, failed = false} = {}, props = {}) {
        const size = big ? 20 : 14;
        super._init({style_class: 'ai-ring', width: size, height: size, ...props});
        this._percent = percent; this._colored = colored; this._dark = dark; this._big = big; this._failed = failed;
        this.connect('repaint', () => this._draw());
    }
    _draw() {
        const [width, height] = this.get_surface_size();
        if (!width || !height) return;
        const cr = this.get_context();
        const track = this.get_theme_node().get_foreground_color();
        const line = this._big ? 2.2 : 3, radius = Math.min(width, height) / 2 - line / 2 - 0.5;
        const cx = width / 2, cy = height / 2, start = -Math.PI / 2;
        cr.setLineWidth(line);
        cr.setSourceRGBA(track.red / 255, track.green / 255, track.blue / 255, track.alpha / 255);
        cr.arc(cx, cy, radius, 0, 2 * Math.PI); cr.stroke();
        const fraction = fillFraction(this._percent);
        if (fraction > 0 && !this._failed) {
            const [r, g, b] = this._colored ? toneFor(this._percent, this._dark) : this._dark ? [0.93, 0.94, 0.96] : [0.13, 0.14, 0.16];
            cr.setSourceRGB(r, g, b); cr.setLineCap(1); // CAIRO_LINE_CAP_ROUND
            cr.arc(cx, cy, radius, start, start + 2 * Math.PI * fraction); cr.stroke();
        }
        cr.$dispose();
    }
});

// Ring plus optional initials in the middle (shown when a provider has several accounts).
export function ringWithInitials(percent, initials, opts) {
    const ring = new UsageRing(percent, {...opts, big: true});
    const holder = new St.Widget({layout_manager: new Clutter.BinLayout(), y_align: Clutter.ActorAlign.CENTER});
    holder.add_child(ring);
    holder.add_child(new St.Label({text: initials, style_class: 'ai-ring-initials', x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER}));
    return holder;
}
