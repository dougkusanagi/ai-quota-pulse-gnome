import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
export function fillFraction(percent) { return Math.max(0, Math.min(1, (Number.isFinite(percent) ? percent : 0) / 100)); }
// Remaining quota decides the tone, so a nearly empty bar always reads as a warning.
export function toneFor(percent, dark = false) {
    // Same tones as the Windows notch: #30d158 / #ffb340 / #ff453a on dark, #1f9d47 / #c77700 / #d70015 on light.
    const tones = dark ? [[0.188, 0.82, 0.345], [1, 0.702, 0.251], [1, 0.271, 0.227]] : [[0.122, 0.616, 0.278], [0.78, 0.467, 0], [0.84, 0, 0.082]];
    return percent > 40 ? tones[0] : percent > 15 ? tones[1] : tones[2];
}
export const UsageBar = GObject.registerClass(class UsageBar extends St.DrawingArea {
    _init(percent = 0, {colored = true, compact = false, dark = false, name = ''} = {}, props = {}) {
        super._init({style_class: compact ? 'ai-bar ai-bar-compact' : 'ai-bar', x_expand: !compact,
            y_align: Clutter.ActorAlign.CENTER, accessible_name: name, ...props});
        this._percent = percent; this._colored = colored; this._compact = compact; this._dark = dark;
        this.connect('repaint', () => this._draw());
    }
    _pill(cr, x, width, height) {
        const r = height / 2;
        cr.newSubPath(); cr.arc(x + width - r, r, r, -Math.PI / 2, Math.PI / 2);
        cr.arc(x + r, r, r, Math.PI / 2, Math.PI * 1.5); cr.closePath();
    }
    _draw() {
        const [width, height] = this.get_surface_size();
        if (!width || !height) return;
        const cr = this.get_context();
        const track = this.get_theme_node().get_foreground_color();
        cr.setSourceRGBA(track.red / 255, track.green / 255, track.blue / 255, track.alpha / 255);
        this._pill(cr, 0, width, height); cr.fill();
        const fraction = fillFraction(this._percent);
        if (fraction > 0) {
            // Anchored on the left like the Windows notch: the fill shrinks toward the left as quota is used.
            // Never narrower than a full circle, so a nearly empty bar stays visible.
            const fill = Math.max(height, width * fraction);
            const [r, g, b] = this._colored ? toneFor(this._percent, this._dark) :
                this._dark ? [0.93, 0.94, 0.96] : [0.13, 0.14, 0.16];
            cr.setSourceRGB(r, g, b); this._pill(cr, 0, fill, height); cr.fill();
        }
        cr.$dispose();
    }
});
