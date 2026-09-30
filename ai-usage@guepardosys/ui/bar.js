import St from 'gi://St';
import GObject from 'gi://GObject';
import Cairo from 'cairo';
export function fillFraction(percent) { return Math.max(0, Math.min(1, (Number.isFinite(percent) ? percent : 0) / 100)); }
export const UsageBar = GObject.registerClass(class UsageBar extends St.DrawingArea {
    _init(percent = 0, colored = true, compact = false, props = {}) {
        super._init({style_class: compact ? 'ai-bar ai-bar-compact' : 'ai-bar', x_expand: !compact, ...props});
        this._percent = percent; this._colored = colored; this._compact = compact;
        this.connect('repaint', () => this._draw());
    }
    _draw() {
        const [width, height] = this.get_surface_size();
        if (!width || !height) return;
        const cr = this.get_context();
        const radius = height / 2;
        cr.newSubPath(); cr.arc(width - radius, radius, radius, -Math.PI / 2, Math.PI / 2);
        cr.arc(radius, radius, radius, Math.PI / 2, Math.PI * 1.5); cr.closePath(); cr.clip();
        cr.setSourceRGBA(this._compact ? 1 : 0.12, this._compact ? 1 : 0.16, this._compact ? 1 : 0.22, 0.16); cr.paint();
        // Mirrored: the fill is anchored on the right and recedes toward the left as quota is used.
        const fill = width * fillFraction(this._percent);
        cr.rectangle(width - fill, 0, fill, height); cr.clip();
        if (this._colored) {
            const gradient = new Cairo.LinearGradient(0, 0, width, 0);
            gradient.addColorStopRGB(0, 0.22, 0.82, 0.43);
            gradient.addColorStopRGB(0.42, 0.98, 0.82, 0.18);
            gradient.addColorStopRGB(0.68, 1, 0.57, 0.12);
            gradient.addColorStopRGB(1, 1, 0.22, 0.25);
            cr.setSource(gradient);
        } else cr.setSourceRGBA(0.88, 0.9, 0.93, 1);
        cr.paint(); cr.$dispose();
    }
});
