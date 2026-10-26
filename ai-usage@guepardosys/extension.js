import St from 'gi://St';
import {loginCommand} from './utils/login.js';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {Accounts} from './services/accounts.js';
import {RefreshService} from './services/refresh.js';
import {DEFAULT_RESET_PROMPT, waitingForMessage, visibleReset} from './utils/session.js';
import {formatReset, resetShort, resetCompact, updatedLabel} from './utils/time.js';
import {initialsFor, cleanInitials} from './utils/initials.js';
import {UsageBar} from './ui/bar.js';
import {UsageRing, ringWithInitials} from './ui/ring.js';
import {Notch} from './ui/notch.js';
import {box, label, wrapped, glyph, button, iconButton, identity, segmented, toggle, settingRow, group, resetIcon, tooltip} from './ui/widgets.js';

export default class AIUsageExtension extends Extension {
    enable() {
        this._themeButtons = new Map();
        this._settings = this.getSettings(); this._accounts = new Accounts(this._settings);
        this._view = 'details'; this._editor = null; this._dark = false; this._resetHelp = new Set();
        this._top = box(false, 'ai-top', {reactive: false});
        this._root = box(true, 'ai-root', {x_expand: true});
        this._notch = new Notch({compact: this._top, panel: this._root,
            onOpenChanged: open => this._openChanged(open), onDismiss: () => { if (this._view !== 'details') this._go('details'); }});
        this._systemSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._themeSignal = this._systemSettings.connect('changed::color-scheme', () => this._syncTheme());
        this._hasAccent = Gio.SettingsSchemaSource.get_default().lookup('org.gnome.desktop.interface', true)?.has_key('accent-color');
        this._accentSignal = this._hasAccent ? this._systemSettings.connect('changed::accent-color', () => this._syncTheme()) : 0;
        this._syncTheme();
        this._buildShell();
        this._refresh = new RefreshService(this._accounts, this._settings, () => this._render());
        this._signals = [this._settings.connect('changed', (_s, key) => {
            if (key === 'theme') this._syncTheme();
            this._render();
            if (this._view === 'settings' && key === 'accounts') this._showSettings();
        })];
        this._minute = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => { this._render(); return GLib.SOURCE_CONTINUE; });
        this._refresh.start();
    }
    _syncTheme() {
        const theme = this._settings.get_string('theme');
        const dark = theme === 'dark' || (theme === 'auto' &&
            this._systemSettings.get_string('color-scheme') === 'prefer-dark');
        const actor = this._notch.actor;
        for (const surface of [actor, this._notch.menu.actor]) {
            if (dark) surface.add_style_class_name('ai-dark');
            else surface.remove_style_class_name('ai-dark');
        }
        // Follow the system accent colour (GNOME 47+); blue elsewhere.
        const accent = this._hasAccent ? this._systemSettings.get_string('accent-color') : 'blue';
        if (this._accentClass) {
            actor.remove_style_class_name(this._accentClass);
            this._notch.menu.actor.remove_style_class_name(this._accentClass);
        }
        this._accentClass = `ai-accent-${accent}`; actor.add_style_class_name(this._accentClass);
        this._notch.menu.actor.add_style_class_name(this._accentClass);
        if (this._dark !== dark) { this._dark = dark; this._signature = null; if (this._refresh) this._render(); }
        this._syncThemeButtons();
    }
    _syncThemeButtons() {
        const selected = this._settings.get_string('theme');
        for (const [value, item] of this._themeButtons ?? []) {
            item.checked = value === selected;
            if (item.checked) item.add_style_class_name('selected');
            else item.remove_style_class_name('selected');
        }
    }
    _buildShell() {
        // Windows layout: a bare list of usage rows, with the controls in a footer. The header only appears on sub-views.
        const header = box(false, 'ai-header');
        this._backButton = iconButton('go-previous-symbolic', 'Voltar', () => this._go(this._view === 'editor' ? 'settings' : 'details'));
        this._title = label('AI Usage', 'ai-title', {x_align: Clutter.ActorAlign.START, x_expand: true});
        header.add_child(this._backButton); header.add_child(this._title);
        this._header = header; header.hide(); this._root.add_child(header);
        this._scroll = new St.ScrollView({style_class: 'ai-scroll', overlay_scrollbars: false, x_expand: true});
        this._body = box(true, 'ai-body', {x_expand: true});
        // add_child replaced set_child in newer St; feature detection keeps 46–50 on one code path.
        if (typeof this._scroll.set_child === 'function') this._scroll.set_child(this._body); else if (typeof this._scroll.add_child === 'function') this._scroll.add_child(this._body);
        else this._scroll.add_actor(this._body);
        this._root.add_child(this._scroll);
        this._footer = box(false, 'ai-footer');
        this._status = label('Ainda não atualizado', 'ai-subtitle', {x_align: Clutter.ActorAlign.START, x_expand: true});
        this._status.clutter_text.ellipsize = 3;
        this._refreshButton = iconButton('view-refresh-symbolic', 'Atualizar agora', () => this._refresh?.refresh());
        this._refreshIcon = this._refreshButton.get_child();
        this._refreshIcon.set_pivot_point(0.5, 0.5);
        this._refreshIcon.connect('notify::mapped', () => {
            if (!this._refreshIcon.mapped) this._stopSpin();
            else if (this._refresh?.busy && !this._spinning) this._spin();
        });
        this._settingsButton = iconButton('emblem-system-symbolic', 'Ajustes', () => this._go('settings'));
        const themes = box(false, 'ai-theme', {accessible_name: 'Tema', y_align: Clutter.ActorAlign.CENTER});
        this._themeButtons = new Map();
        for (const [value, name, icon] of [['light', 'Claro', 'weather-clear-symbolic'], ['dark', 'Escuro', 'weather-clear-night-symbolic'], ['auto', 'Sistema', 'video-display-symbolic']]) {
            const item = iconButton(icon, `Tema ${name}`, () => this._settings.set_string('theme', value), 'ai-theme-button');
            item.toggle_mode = true;
            item.get_child().icon_size = 12;
            tooltip(item, `Tema ${name}`);
            this._themeButtons.set(value, item); themes.add_child(item);
        }
        this._syncThemeButtons();
        for (const child of [this._status, themes, this._refreshButton, this._settingsButton]) this._footer.add_child(child);
        this._root.add_child(this._footer);
    }
    _openChanged(open) {
        if (open && this._view === 'details' && this._shownSignature !== this._signature) this._showDetails();
        if (open) this._updateChrome();
    }
    // Views: details (default), settings, editor. Leaving the popup always returns to details.
    _go(view) {
        this._view = view;
        if (view !== 'editor') this._editor = null;
        if (this._view === 'details') this._showDetails(); else if (view === 'settings') this._showSettings(); else this._buildEditor(this._editor ?? {});
        this._updateChrome();
        // Native popup menu keeps entries interactive until the menu is dismissed.
        this._notch.pin(view !== 'details'); this._notch.refit();
        if (this._scroll.vadjustment) this._scroll.vadjustment.value = 0;
        // A short fade makes the swap feel continuous; opacity is cheap, unlike blur effects.
        this._body.opacity = 0; this._body.ease({opacity: 255, duration: 140, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }
    _render() {
        if (!this._notch || !this._refresh) return;
        const monitor = Main.layoutManager.primaryMonitor;
        // Keep header and list inside the popup: the list gets whatever the work area leaves.
        if (monitor) {
            const area = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
            const style = `max-height: ${Math.max(160, Math.min(560, area.height - 130))}px;`;
            if (style !== this._scrollStyle) { this._scrollStyle = style; this._scroll.set_style(style); }
        }
        // Skip rebuilding identical content: destroying actors every tick makes the panel and list flash.
        const format = this._settings.get_string('reset-format'), colored = this._settings.get_boolean('colored-bars');
        const signature = JSON.stringify([this._accounts.list(), [...this._refresh.states], format, colored, this._dark,
            Math.floor(Date.now() / 60000)]);
        const changed = signature !== this._signature; this._signature = signature;
        if (changed) this._buildTop();
        this._updateChrome();
        // Details are rebuilt only while visible; opening the popup catches up on anything missed.
        if (this._view === 'details' && this._notch.isOpen && this._shownSignature !== signature) { this._showDetails(); this._notch.refit(); }
    }
    _logo(provider, size = 13) {
        return new St.Icon({gicon: Gio.FileIcon.new(Gio.File.new_for_path(`${this.path}/icons/${provider}-symbolic.svg`)), icon_size: size,
            style_class: provider === 'openai' ? 'ai-logo-panel' : 'ai-claude-logo', y_align: Clutter.ActorAlign.CENTER});
    }
    // Closed notch: Claude on the left, Codex on the right, one ring per account (initials inside when a provider has several).
    _buildTop() {
        this._top.destroy_all_children();
        const visible = this._accounts.list().filter(a => a.visible);
        const colored = this._settings.get_boolean('colored-bars'), format = this._settings.get_string('reset-format');
        if (!visible.length) {
            this._top.add_child(new St.Icon({gicon: Gio.FileIcon.new(Gio.File.new_for_path(`${this.path}/icons/meters-symbolic.svg`)), icon_size: 14, style_class: 'ai-logo-panel'}));
            this._top.add_child(label('AI', 'ai-time'));
        }
        const byProvider = {claude: visible.filter(a => a.provider === 'claude'), openai: visible.filter(a => a.provider === 'openai')};
        this._pulse = new St.Widget({style_class: 'ai-pulse', y_align: Clutter.ActorAlign.CENTER});
        let first = true;
        for (const provider of ['claude', 'openai']) {
            const list = byProvider[provider];
            if (!list.length) continue;
            if (!first) this._top.add_child(this._pulse);
            first = false;
            const multi = list.length > 1, group = box(false, 'ai-top-group');
            const items = box(false, 'ai-top-items', {y_align: Clutter.ActorAlign.CENTER});
            for (const account of list) {
                const state = this._refresh.states.get(account.id), primary = state?.usage?.primary;
                const percent = primary?.remaining ?? 0, failed = !primary;
                const chip = box(false, state?.error ? 'ai-chip-top ai-chip-err' : 'ai-chip-top', {
                    y_align: Clutter.ActorAlign.CENTER,
                    accessible_name: `${account.name}, ${provider}: ${primary ? `${Math.round(percent)}% restante` : state?.error ?? 'aguardando consulta'}`});
                const opts = {colored, dark: this._dark, failed};
                const ring = multi ? ringWithInitials(percent, failed ? '!' : account.initials, opts) : new UsageRing(percent, opts, {y_align: Clutter.ActorAlign.CENTER});
                const text = multi ? null : label(primary ? `${Math.round(percent)}%` : '--', 'ai-top-percent');
                if (provider === 'openai' && text) chip.add_child(text);
                chip.add_child(ring);
                if (provider !== 'openai' && text) chip.add_child(text);
                items.add_child(chip);
            }
            if (provider === 'openai') { group.add_child(items); group.add_child(this._logo(provider)); }
            else { group.add_child(this._logo(provider)); group.add_child(items); }
            this._top.add_child(group);
        }
        this._notch.actor.accessible_name = 'AI Usage. ' + this._accounts.list().map(account => {
            const state = this._refresh.states.get(account.id), primary = state?.usage?.primary;
            return `${account.provider}, ${account.name}, ${account.initials}, ${primary ? `${state.error ? 'dados desatualizados, ' : ''}${Math.round(primary.remaining)}% restante, reset ${formatReset(visibleReset(primary), format)}` : state?.error ?? 'aguardando consulta'}`;
        }).join('. ');
    }
    _updateChrome() {
        const view = this._view, details = view === 'details';
        this._header.visible = !details; this._footer.visible = details;
        const empty = !this._accounts.list().length;
        this._refreshButton.visible = details && !empty; this._settingsButton.visible = details;
        this._title.text = details ? 'AI Usage' : view === 'settings' ? 'Ajustes' : (this._editor?.id ? 'Editar conta' : 'Nova conta');
        this._status.visible = details && !empty;
        if (this._pulse) this._pulse.opacity = this._refresh.busy ? 255 : 100;
        const states = [...this._refresh.states.values()];
        const last = Math.max(0, ...states.map(s => s.updated ?? 0));
        this._status.text = this._refresh.busy ? 'Atualizando…' : updatedLabel(last);
        this._refreshButton.reactive = !this._refresh.busy;
        this._refreshButton.can_focus = !this._refresh.busy;
        this._refreshButton.opacity = this._refresh.busy ? 150 : 255;
        if (this._refresh.busy && !this._spinning) this._spin();
        // A completed request does not cut a visible turn short.
        if (this._spinning && (!this._refreshIcon.mapped || !St.Settings.get().enable_animations)) this._stopSpin();
    }
    _stopSpin() {
        this._spinning = false;
        if (this._spinTimer) GLib.Source.remove(this._spinTimer);
        this._spinTimer = 0;
        this._refreshIcon?.remove_all_transitions();
        if (this._refreshIcon) this._refreshIcon.rotation_angle_z = 0;
    }
    _spin() {
        if (!this._refreshIcon?.mapped || !St.Settings.get().enable_animations) return;
        this._spinning = true;
        this._refreshIcon.rotation_angle_z = 0;
        this._refreshIcon.ease({rotation_angle_z: 360, duration: 900, mode: Clutter.AnimationMode.LINEAR,
            onComplete: () => {
                if (!this._spinning) return;
                // Defer the next turn: ease() can complete synchronously when unmapped.
                this._spinTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1, () => {
                    this._spinTimer = 0;
                    if (this._refresh?.busy && this._refreshIcon?.mapped && St.Settings.get().enable_animations) this._spin();
                    else this._stopSpin();
                    return GLib.SOURCE_REMOVE;
                });
            }});
    }
    _bar(percent, name) { return new UsageBar(percent, {colored: this._settings.get_boolean('colored-bars'), dark: this._dark, name}); }
    _controls(account, state) {
        const controls = box(false, 'ai-reset-controls', {y_align: Clutter.ActorAlign.CENTER});
        const help = box(true, 'ai-reset-help');
        help.add_child(label('Mensagem após reset de 5h', 'ai-row-title'));
        help.add_child(wrapped('Quando a janela de 5h estiver disponível, envia uma mensagem curta por esta conta. Isso inicia a próxima janela e usa um pouco do limite. Se já estiver disponível, envia ao ativar.', 'ai-caption'));
        help.add_child(wrapped('Se o reset continuar sem horário, tenta novamente após 5 minutos. A extensão precisa estar ativa e o CLI da conta, autenticado.', 'ai-caption'));
        help.add_child(button('Editar prompt', () => { this._editor = account; this._go('editor'); }, 'document-edit-symbolic'));
        help.visible = this._resetHelp.has(account.id);
        const helpButton = iconButton('mail-send-symbolic', `Ajuda: mensagem após reset · ${account.name}`, () => {
            help.visible = !help.visible;
            helpButton.checked = help.visible;
            if (help.visible) this._resetHelp.add(account.id); else this._resetHelp.delete(account.id);
            this._notch.refit();
        }, 'ai-reset-help-button');
        helpButton.toggle_mode = true;
        helpButton.checked = help.visible;
        tooltip(helpButton, 'Mensagem após reset de 5h · clique para saber mais');
        controls.add_child(helpButton);
        controls.add_child(toggle(`Mensagem após reset · ${account.name}`, account.autoResetMessage,
            active => this._accounts.put({...account, autoResetMessage: active})));
        return {controls, help};
    }
    _windowRow(window, format) {
        const percent = Math.round(window.remaining), waiting = waitingForMessage(window);
        const row = box(false, 'ai-limit-row');
        const name = String(window.label).replace('5 horas', '5h').replace('Semanal', 'Semana');
        const title = label(name, 'ai-limit-name'); title.clutter_text.ellipsize = 3; row.add_child(title);
        row.add_child(this._bar(window.remaining, `${window.label}: ${percent}% restante`));
        row.add_child(label(`${percent}%`, percent <= 15 ? 'ai-percent ai-percent-low' : 'ai-percent', {x_align: Clutter.ActorAlign.END}));
        const reset = label(waiting ? 'sem uso' : resetCompact(window.reset, format), 'ai-reset-text', {x_align: Clutter.ActorAlign.END});
        row.add_child(reset);
        tooltip(row, waiting ? 'Janela sem uso: começa na próxima mensagem' : `Renova ${resetShort(window.reset, format)}`);
        row.reactive = true; row.track_hover = true;
        return row;
    }
    _showDetails() {
        this._shownSignature = this._signature;
        const scrollValue = this._scroll.vadjustment?.value ?? 0;
        this._body.destroy_all_children();
        const accounts = this._accounts.list(), format = this._settings.get_string('reset-format');
        if (!accounts.length) {
            const empty = box(true, 'ai-empty', {x_expand: true, x_align: Clutter.ActorAlign.CENTER});
            const tile = new St.Bin({style_class: 'ai-empty-tile', x_align: Clutter.ActorAlign.CENTER, child: new St.Icon({gicon: Gio.FileIcon.new(Gio.File.new_for_path(`${this.path}/icons/meters-symbolic.svg`)), icon_size: 22})});
            empty.add_child(tile);
            empty.add_child(label('Seus limites, sempre à vista', 'ai-empty-title', {x_align: Clutter.ActorAlign.CENTER}));
            empty.add_child(wrapped('Adicione um perfil autenticado do Codex ou do Claude para acompanhar quanto resta de cada plano.', 'ai-empty-text', {x_align: Clutter.ActorAlign.CENTER}));
            const add = button('Adicionar conta', () => { this._editor = {}; this._go('editor'); }, 'list-add-symbolic', 'ai-button ai-primary');
            add.x_align = Clutter.ActorAlign.CENTER; empty.add_child(add); this._body.add_child(empty);
        }
        for (const provider of ['claude', 'openai']) {
            const list = accounts.filter(a => a.provider === provider);
            if (!list.length) continue;
            const multi = list.length > 1, section = box(true, 'ai-prov');
            const head = box(false, 'ai-prov-head');
            head.add_child(this._logo(provider, 15));
            head.add_child(label(provider === 'openai' ? 'Codex' : 'Claude', 'ai-prov-name'));
            const planOf = account => { const plan = this._refresh?.states.get(account.id)?.usage?.plan; return plan ? String(plan).replace(/^./, c => c.toUpperCase()) : null; };
            if (!multi && planOf(list[0])) head.add_child(label(planOf(list[0]), 'ai-plan'));
            head.add_child(new St.Widget({x_expand: true}));
            section.add_child(head);
            for (const account of list) {
                const state = this._refresh?.states.get(account.id);
                const {controls, help} = this._controls(account, state);
                const card = box(true, multi ? 'ai-account ai-account-multi' : 'ai-account');
                if (multi) {
                    const ah = box(false, 'ai-acc-head');
                    const badge = new St.Bin({style_class: 'ai-badge-chip', y_align: Clutter.ActorAlign.CENTER,
                        child: new St.Label({text: account.initials, style_class: 'ai-badge-chip-text'})});
                    badge.set_style(`background-color: ${account.color};`);
                    ah.add_child(badge); ah.add_child(label(account.name, 'ai-acc-name'));
                    if (planOf(account)) ah.add_child(label(planOf(account), 'ai-plan'));
                    ah.add_child(new St.Widget({x_expand: true})); ah.add_child(controls); card.add_child(ah);
                } else head.add_child(controls);
                card.add_child(help);
                if (account.autoResetMessage && (state?.messageSending || state?.messageError)) {
                    const status = box(false, 'ai-reset-status');
                    status.add_child(glyph('mail-send-symbolic', 12, state.messageError ? 'ai-error' : 'ai-caption'));
                    status.add_child(wrapped(state.messageSending ? 'Mensagem após reset: enviando…' : `Mensagem após reset: ${state.messageError}`,
                        state.messageError ? 'ai-error' : 'ai-caption', {x_expand: true}));
                    card.add_child(status);
                }
                if (state?.error) {
                    const callout = box(false, 'ai-callout');
                    callout.add_child(glyph('dialog-warning-symbolic', 16, 'ai-callout-icon'));
                    const text = box(true, 'ai-callout-text', {x_expand: true});
                    text.add_child(label(state.usage ? 'Dados desatualizados' : 'Não foi possível atualizar', 'ai-callout-title', {x_align: Clutter.ActorAlign.START}));
                    text.add_child(wrapped(state.error, 'ai-caption'));
                    if (state.usage) text.add_child(wrapped(`Última consulta: ${updatedLabel(state.updated).replace(/^Atualizado/, 'atualizado')}.`, 'ai-caption'));
                    if (state.retryAt) text.add_child(wrapped(`Nova tentativa automática: ${resetShort(state.retryAt / 1000, format)}.`, 'ai-caption'));
                    callout.add_child(text); card.add_child(callout);
                }
                if (!state?.usage) {
                    if (!state?.error) {
                        const limit = box(true, 'ai-limit');
                        limit.add_child(label('Consultando…', 'ai-caption', {x_align: Clutter.ActorAlign.START}));
                        limit.add_child(this._bar(0, 'Consultando')); card.add_child(limit);
                    }
                } else {
                    for (const window of state.usage.windows) card.add_child(this._windowRow(window, format));
                    const extra = state.usage.extra;
                    if (extra) {
                        const row = box(false, 'ai-limit-row ai-limit-extra');
                        row.add_child(label('Extra', 'ai-limit-name'));
                        if (extra.utilization != null) row.add_child(this._bar(100 - extra.utilization, `Uso extra: ${Math.round(extra.utilization)}% usado`));
                        else row.add_child(new St.Widget({x_expand: true}));
                        row.add_child(label(extra.utilization == null ? '--' : `${Math.round(extra.utilization)}%`, 'ai-percent', {x_align: Clutter.ActorAlign.END}));
                        row.add_child(label(extra.limit == null ? 'créditos' : `${extra.used ?? 0}/${extra.limit}`, 'ai-reset-text', {x_align: Clutter.ActorAlign.END}));
                        tooltip(row, 'Uso extra (créditos): quanto já foi usado');
                        card.add_child(row);
                    }
                }
                section.add_child(card);
            }
            this._body.add_child(section);
        }
        // Keep the scroll position across rebuilds so refreshes don't jump the list.
        if (scrollValue > 0) GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (this._scroll?.vadjustment) this._scroll.vadjustment.value = scrollValue;
            return GLib.SOURCE_REMOVE;
        });
    }
    _showSettings() {
        const focus = global.stage.get_key_focus();
        if (focus && this._body.contains(focus)) global.stage.set_key_focus(this._backButton);
        const scrollValue = this._scroll.vadjustment?.value ?? 0;
        this._body.destroy_all_children();
        const s = this._settings, body = this._body;
        body.add_child(label('Aparência', 'ai-section-title', {x_align: Clutter.ActorAlign.START}));
        body.add_child(group(
            settingRow('Tema', segmented('Tema', [['auto', 'Auto'], ['light', 'Claro'], ['dark', 'Escuro']],
                s.get_string('theme'), value => s.set_string('theme', value))),
            settingRow('Reset', segmented('Formato do reset', [['24h', '24 h'], ['12h', '12 h'], ['relative', 'Relativo']],
                s.get_string('reset-format'), value => s.set_string('reset-format', value))),
            settingRow('Barras coloridas', toggle('Barras coloridas', s.get_boolean('colored-bars'), active => s.set_boolean('colored-bars', active)),
                'Verde, âmbar e vermelho conforme o que resta')));
        body.add_child(label('Atualização', 'ai-section-title', {x_align: Clutter.ActorAlign.START}));
        const steps = [1, 5, 10, 15, 30, 60];
        const index = () => Math.max(0, steps.indexOf(s.get_int('refresh-minutes')));
        const value = label(`${steps[index()]} min`, 'ai-stepper-value', {x_align: Clutter.ActorAlign.CENTER});
        const step = delta => { const next = Math.max(0, Math.min(steps.length - 1, index() + delta)); s.set_int('refresh-minutes', steps[next]); value.text = `${steps[next]} min`; };
        const stepper = box(false, 'ai-stepper');
        stepper.add_child(iconButton('list-remove-symbolic', 'Atualizar com menos frequência', () => step(1)));
        stepper.add_child(value);
        stepper.add_child(iconButton('list-add-symbolic', 'Atualizar com mais frequência', () => step(-1)));
        body.add_child(group(settingRow('Consultar a cada', stepper)));
        body.add_child(label('Contas', 'ai-section-title', {x_align: Clutter.ActorAlign.START}));
        const accounts = this._accounts.list(), rows = [];
        accounts.forEach((account, i) => {
            const row = box(false, account.visible ? 'ai-row ai-account-row' : 'ai-row ai-account-row ai-dim');
            row.add_child(identity(account, this.path));
            const names = box(true, 'ai-row-names', {x_expand: true, y_align: Clutter.ActorAlign.CENTER});
            names.add_child(label(account.name, 'ai-row-title', {x_align: Clutter.ActorAlign.START}));
            names.add_child(label(account.visible ? account.profilePath : `${account.profilePath} · oculta`, 'ai-caption', {x_align: Clutter.ActorAlign.START}));
            names.get_last_child().clutter_text.ellipsize = 3; row.add_child(names);
            const actions = box(false, 'ai-row-actions');
            const up = iconButton('go-up-symbolic', 'Mover para cima', () => this._accounts.move(account.id, -1));
            const down = iconButton('go-down-symbolic', 'Mover para baixo', () => this._accounts.move(account.id, 1));
            up.reactive = up.can_focus = i > 0; down.reactive = down.can_focus = i < accounts.length - 1;
            up.opacity = up.reactive ? 255 : 70; down.opacity = down.reactive ? 255 : 70;
            actions.add_child(up); actions.add_child(down);
            actions.add_child(iconButton(account.visible ? 'view-reveal-symbolic' : 'view-conceal-symbolic',
                account.visible ? 'Ocultar da barra' : 'Mostrar na barra', () => this._accounts.put({...account, visible: !account.visible})));
            actions.add_child(iconButton('document-edit-symbolic', 'Editar conta', () => { this._editor = account; this._go('editor'); }));
            row.add_child(actions); rows.push(row);
        });
        const add = new St.Button({style_class: 'ai-row ai-add-row', can_focus: true, accessible_name: 'Adicionar conta', x_expand: true});
        const addContent = box(false, 'ai-button-content'); addContent.add_child(glyph('list-add-symbolic', 14, 'ai-accent-text')); addContent.add_child(label('Adicionar conta', 'ai-accent-text'));
        add.set_child(addContent); add.connect('clicked', () => { this._editor = {}; this._go('editor'); }); rows.push(add);
        body.add_child(group(...rows));
        if (scrollValue > 0) GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (this._scroll?.vadjustment) this._scroll.vadjustment.value = scrollValue;
            return GLib.SOURCE_REMOVE;
        });
    }
    _buildEditor(account) {
        const body = this._body;
        const focus = global.stage.get_key_focus();
        if (focus && body.contains(focus)) global.stage.set_key_focus(this._backButton);
        body.destroy_all_children();
        let provider = account.provider ?? 'openai';
        const defaultPath = p => p === 'openai' ? '~/.codex' : '~/.claude';
        const field = (title, value, name = title) => {
            const entry = new St.Entry({text: value, can_focus: true, style_class: 'ai-entry', x_expand: true,
                y_align: Clutter.ActorAlign.CENTER, accessible_name: name});
            const row = box(false, 'ai-row ai-field-row'); const l = label(title, 'ai-row-title ai-field-title'); row.add_child(l); row.add_child(entry);
            return {entry, row};
        };
        const preview = box(false, 'ai-card ai-preview');
        const identityHolder = new St.Bin(); const previewNames = box(true, 'ai-names', {x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        const previewName = label('', 'ai-account-name', {x_align: Clutter.ActorAlign.START});
        const previewSub = label('', 'ai-caption', {x_align: Clutter.ActorAlign.START});
        previewNames.add_child(previewName); previewNames.add_child(previewSub);
        preview.add_child(identityHolder); preview.add_child(previewNames); body.add_child(preview);
        const providerRow = box(false, 'ai-row');
        providerRow.add_child(label('Serviço', 'ai-row-title ai-field-title'));
        const name = field('Nome', account.name ?? ''), path = field('Diretório', account.profilePath ?? defaultPath(provider), 'Perfil / diretório');
        const loginHelp = wrapped('', 'ai-caption ai-login-help', {x_expand: true});
        loginHelp.clutter_text.set_selectable(true);
        const syncLogin = () => {
            const command = loginCommand(provider, path.entry.text);
            loginHelp.text = command ? `Para entrar nesta conta:\n${command}` : 'Informe o diretório para ver o comando de login.';
        };
        path.entry.clutter_text.connect('text-changed', syncLogin);
        const initials = field('Iniciais', account.initials ?? ''); initials.entry.clutter_text.max_length = 3;
        const color = field('Hex', account.color ?? '#0A84FF', 'Cor em hexadecimal');
        const palette = box(false, 'ai-palette', {x_expand: true});
        const swatches = [];
        const swatchSet = ['#0A84FF', '#7D35D8', '#D6409F', '#E5484D', '#E07B00', '#1F9D55', '#0E9AA7', '#5B6B7F'];
        const current = () => ({color: /^#[0-9a-f]{6}$/i.test(color.entry.text) ? color.entry.text : '#8E8E93',
            initials: cleanInitials(initials.entry.text) || '··'});
        let live = null;
        const sync = () => {
            const now = current();
            if (!live) { live = identity({provider, ...now}, this.path); identityHolder.set_child(live); }
            else { live.update(now); }
            previewName.text = name.entry.text.trim() || 'Nome da conta';
            previewSub.text = provider === 'openai' ? 'Codex' : 'Claude';
            for (const [swatch, value] of swatches) {
                const on = value.toLowerCase() === color.entry.text.trim().toLowerCase();
                swatch.get_child().visible = on;
                if (on) swatch.add_style_class_name('selected'); else swatch.remove_style_class_name('selected');
            }
        };
        let providerWidget = segmented('Serviço', [['openai', 'Codex'], ['claude', 'Claude']], provider, value => {
            const old = provider; provider = value;
            if (path.entry.text === defaultPath(old)) path.entry.text = defaultPath(value);
            live = null; sync(); syncLogin();
        });
        providerWidget.x_expand = true; providerRow.add_child(providerWidget);
        for (const value of swatchSet) {
            const swatch = new St.Button({style_class: 'ai-swatch', can_focus: true, accessible_name: `Cor ${value}`,
                child: glyph('object-select-symbolic', 12, 'ai-swatch-check')});
            swatch.set_style(`background-color: ${value};`); swatch.get_child().hide();
            swatch.connect('clicked', () => { color.entry.text = value; });
            swatches.push([swatch, value]); palette.add_child(swatch);
        }
        const paletteRow = box(false, 'ai-row'); paletteRow.add_child(label('Cor', 'ai-row-title ai-field-title')); paletteRow.add_child(palette);
        body.add_child(group(providerRow, name.row, path.row, loginHelp, initials.row));
        syncLogin();
        body.add_child(group(paletteRow, color.row));
        let autoResetMessage = account.autoResetMessage === true;
        const prompt = field('Prompt', account.resetPrompt ?? DEFAULT_RESET_PROMPT, 'Prompt da mensagem após reset');
        prompt.entry.clutter_text.max_length = 2000;
        body.add_child(group(settingRow('Mensagem após reset', toggle('Mensagem após reset de 5h', autoResetMessage,
            active => { autoResetMessage = active; }), 'Inicia a próxima janela de 5h'), prompt.row));
        body.add_child(wrapped('Envia pelo CLI desta conta quando a janela de 5h estiver disponível. Resposta curta; uma tentativa por janela. Se já estiver disponível, envia ao ativar.', 'ai-caption'));
        let manual = Boolean(account.id), automatic = false;
        initials.entry.clutter_text.connect('text-changed', () => { if (!automatic) manual = true; sync(); });
        name.entry.clutter_text.connect('text-changed', () => {
            if (!manual) { automatic = true; initials.entry.text = initialsFor(name.entry.text); automatic = false; }
            sync();
        });
        color.entry.clutter_text.connect('text-changed', sync);
        const error = wrapped('', 'ai-error'); error.hide(); body.add_child(error);
        const save = () => {
            try {
                this._accounts.put({...account, provider, name: name.entry.text, profilePath: path.entry.text,
                    initials: cleanInitials(initials.entry.text), color: color.entry.text.trim(), autoResetMessage, resetPrompt: prompt.entry.text});
                this._go('settings');
            } catch (e) { error.text = e.message; error.show(); }
        };
        for (const f of [name, path, initials, color]) f.entry.clutter_text.connect('activate', save);
        const actions = box(false, 'ai-form-actions');
        if (account.id) {
            const remove = button('Remover', () => {
                actions.destroy_all_children(); error.hide();
                actions.add_child(label('Remover esta conta?', 'ai-confirm', {x_expand: true}));
                actions.add_child(button('Cancelar', () => this._go('editor')));
                actions.add_child(button('Remover', () => { this._accounts.remove(account.id); this._go('settings'); }, 'user-trash-symbolic', 'ai-button ai-danger-solid'));
            }, 'user-trash-symbolic', 'ai-button ai-danger');
            actions.add_child(remove);
        }
        actions.add_child(new St.Widget({x_expand: true}));
        actions.add_child(button('Cancelar', () => this._go('settings')));
        actions.add_child(button(account.id ? 'Salvar' : 'Adicionar', save, null, 'ai-button ai-primary'));
        body.add_child(actions);
        sync();
        if (!account.id) GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => { name.entry.grab_key_focus(); return GLib.SOURCE_REMOVE; });
    }
    disable() {
        if (this._themeSignal) this._systemSettings.disconnect(this._themeSignal);
        if (this._accentSignal) this._systemSettings.disconnect(this._accentSignal);
        this._themeSignal = this._accentSignal = 0; this._systemSettings = null;
        this._refresh?.destroy(); this._refresh = null;
        if (this._minute) GLib.Source.remove(this._minute);
        this._stopSpin();
        this._minute = 0;
        for (const signal of this._signals ?? []) this._settings.disconnect(signal);
        this._signals = [];
        this._notch?.destroy(); this._notch = null;
        this._settings = null; this._accounts = null; this._editor = null; this._resetHelp = null;
        this._body = null; this._root = null; this._top = null; this._pulse = null; this._header = null; this._footer = null; this._status = null; this._title = null; this._backButton = null; this._settingsButton = null;
        this._refreshIcon = null; this._refreshButton = null; this._scroll = null;
    }
}
