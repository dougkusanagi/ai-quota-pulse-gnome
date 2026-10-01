import St from 'gi://St';
import GObject from 'gi://GObject';
export function fillFraction(percent) { return Math.max(0, Math.min(1, (Number.isFinite(percent) ? percent : 0) / 100)); }
// Remaining quota decides the tone, so a nearly empty bar always reads as a warning.
export function toneFor(percent, dark = false) {
    const tones = dark ? [[0.20, 0.82, 0.45], [1, 0.70, 0.14], [1, 0.39, 0.41]] : [[0.18, 0.70, 0.34], [0.94, 0.64, 0.04], [0.90, 0.28, 0.30]];
    return percent > 40 ? tones[0] : percent > 15 ? tones[1] : tones[2];
}
export const UsageBar = GObject.registerClass(class UsageBar extends St.DrawingArea {
    _init(percent = 0, {colored = true, compact = false, dark = false, name = ''} = {}, props = {}) {
        super._init({style_class: compact ? 'ai-bar ai-bar-compact' : 'ai-bar', x_expand: !compact, accessible_name: name, ...props});
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
            // Mirrored: the fill is anchored on the right and recedes toward the left as quota is used.
            // Never narrower than a full circle, so a nearly empty bar stays visible.
            const fill = Math.max(height, width * fraction);
            const [r, g, b] = this._colored ? toneFor(this._percent, this._dark || this._compact) :
                this._dark || this._compact ? [0.93, 0.94, 0.96] : [0.13, 0.14, 0.16];
            cr.setSourceRGB(r, g, b); this._pill(cr, width - fill, fill, height); cr.fill();
        }
        cr.$dispose();
    }
});
