import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {Accounts} from './services/accounts.js';
import {RefreshService} from './services/refresh.js';
import {formatReset, resetShort, updatedLabel} from './utils/time.js';
import {initialsFor, cleanInitials} from './utils/initials.js';
import {UsageBar} from './ui/bar.js';
import {box, label, wrapped, glyph, button, iconButton, identity, segmented, toggle, settingRow, group} from './ui/widgets.js';

export default class AIUsageExtension extends Extension {
    enable() {
        this._settings = this.getSettings(); this._accounts = new Accounts(this._settings);
        this._view = 'details'; this._editor = null; this._dark = false;
        this._indicator = new PanelMenu.Button(0.5, 'AI Usage');
        this._top = box(false, 'ai-top'); this._indicator.add_child(this._top);
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
        this._indicator.menu.actor.add_style_class_name('ai-menu');
        const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        this._root = box(true, 'ai-root', {x_expand: true}); item.add_child(this._root);
        this._indicator.menu.addMenuItem(item);
        this._systemSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._themeSignal = this._systemSettings.connect('changed::color-scheme', () => this._syncTheme());
        this._hasAccent = Gio.SettingsSchemaSource.get_default().lookup('org.gnome.desktop.interface', true)?.has_key('accent-color');
        this._accentSignal = this._hasAccent ? this._systemSettings.connect('changed::accent-color', () => this._syncTheme()) : 0;
        this._syncTheme();
        this._buildShell();
        this._setupScreenshotShortcut();
        this._refresh = new RefreshService(this._accounts, this._settings, () => this._render());
        this._signals = [this._settings.connect('changed', (_s, key) => {
            if (key === 'theme') this._syncTheme();
            this._render();
            if (this._view === 'settings' && key === 'accounts') this._showSettings();
        })];
        this._menuSignal = this._indicator.menu.connect('open-state-changed', (_menu, open) => {
            if (open) { if (this._view === 'details' && this._shownSignature !== this._signature) this._showDetails(); }
            else if (this._view !== 'details') this._go('details');
        });
        this._minute = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => { this._render(); return GLib.SOURCE_CONTINUE; });
        this._refresh.start();
    }
    _syncTheme() {
        const theme = this._settings.get_string('theme');
        const dark = theme === 'dark' || (theme === 'auto' &&
            this._systemSettings.get_string('color-scheme') === 'prefer-dark');
        const actor = this._indicator.menu.actor;
        if (dark) actor.add_style_class_name('ai-dark');
        else actor.remove_style_class_name('ai-dark');
        // Follow the system accent colour (GNOME 47+); blue elsewhere.
        const accent = this._hasAccent ? this._systemSettings.get_string('accent-color') : 'blue';
        if (this._accentClass) actor.remove_style_class_name(this._accentClass);
        this._accentClass = `ai-accent-${accent}`; actor.add_style_class_name(this._accentClass);
        if (this._dark !== dark) { this._dark = dark; this._signature = null; if (this._refresh) this._render(); }
    }
    _setupScreenshotShortcut() {
        // Mutter filters global accelerators before Clutter emits key events.
        // Resolve Print's hardware keycodes from the current Xwayland keymap.
        this._printKeycodes = [];
        this._printBindings = new Map();
        this._captureMenuDetached = false;
        this._resolvePrintKeycodes();
        const menu = this._indicator.menu;
        this._printMenuSignal = menu.connect('open-state-changed', (_menu, open) => {
            if (open) {
                for (const code of this._printKeycodes) {
                    const action = global.display.get_keybinding_action(code, 0);
                    if (action === Meta.KeyBindingAction.NONE) continue;
                    const name = Meta.external_binding_name_for_action(action);
                    const modes = Main.wm._allowedKeybindings[name];
                    if (modes === undefined || this._printBindings.has(action)) continue;
                    this._printBindings.set(action, {name, modes});
                    Main.wm.allowKeybinding(name, modes | Shell.ActionMode.POPUP);
                }
            } else {
                this._restorePrintBindings();
                if (this._captureMenuDetached) {
                    this._captureMenuDetached = false;
                    Main.panel.menuManager.addMenu(menu);
                }
            }
        });
        this._printSignal = global.display.connect('accelerator-activated', (_display, action) => {
            if (!menu.isOpen || !this._printBindings.has(action)) return;
            // The normal media-key daemon launches Flameshot. Release the modal
            // grab first, without closing/hiding the menu or launching twice.
            Main.panel.menuManager.removeMenu(menu);
            this._captureMenuDetached = true;
            this._restorePrintBindings();
        });
    }
    _resolvePrintKeycodes() {
        // Never wait synchronously for an X11 client inside the compositor:
        // Xwayland may need the Shell main loop to finish starting at login.
        const cancellable = new Gio.Cancellable();
        this._keymapCancellable = cancellable;
        try {
            const process = Gio.Subprocess.new(['xmodmap', '-pke'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
            let timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
                timeout = 0;
                cancellable.cancel();
                return GLib.SOURCE_REMOVE;
            });
            const cancelSignal = cancellable.connect(() => process.force_exit());
            process.communicate_utf8_async(null, cancellable, (source, result) => {
                if (timeout) GLib.Source.remove(timeout);
                cancellable.disconnect(cancelSignal);
                try {
                    const [ok, output] = source.communicate_utf8_finish(result);
                    if (cancellable.is_cancelled() || this._keymapCancellable !== cancellable) return;
                    if (ok && source.get_successful()) {
                        for (const line of output.split('\n')) {
                            const match = line.match(/^keycode\s+(\d+)\s*=\s*Print(?:\s|$)/);
                            if (match) this._printKeycodes.push(Number(match[1]));
                        }
                    }
                } catch (error) {
                    if (!cancellable.is_cancelled())
                        console.error(`AI Usage: cannot resolve Print keycodes: ${error.message}`);
                } finally {
                    if (this._keymapCancellable === cancellable) this._keymapCancellable = null;
                }
            });
        } catch (error) {
            this._keymapCancellable = null;
            console.error(`AI Usage: cannot resolve Print keycodes: ${error.message}`);
        }
    }
    _restorePrintBindings() {
        for (const {name, modes} of this._printBindings?.values() ?? [])
            Main.wm.allowKeybinding(name, modes);
        this._printBindings?.clear();
    }
    _buildShell() {
        const header = box(false, 'ai-header');
        this._backButton = iconButton('go-previous-symbolic', 'Voltar', () => this._go(this._view === 'editor' ? 'settings' : 'details'));
        const names = box(true, 'ai-header-names', {x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this._title = label('AI Usage', 'ai-title', {x_align: Clutter.ActorAlign.START});
        this._status = label('Ainda não atualizado', 'ai-subtitle', {x_align: Clutter.ActorAlign.START});
        names.add_child(this._title); names.add_child(this._status);
        this._refreshButton = iconButton('view-refresh-symbolic', 'Atualizar agora', () => this._refresh?.refresh());
        this._refreshIcon = this._refreshButton.get_child();
        this._refreshIcon.set_pivot_point(0.5, 0.5);
        this._settingsButton = iconButton('emblem-system-symbolic', 'Ajustes', () => this._go('settings'));
        for (const child of [this._backButton, names, this._refreshButton, this._settingsButton]) header.add_child(child);
        this._backButton.hide(); this._root.add_child(header);
        this._scroll = new St.ScrollView({style_class: 'ai-scroll', overlay_scrollbars: false, x_expand: true});
        this._body = box(true, 'ai-body', {x_expand: true});
        // add_child replaced set_child in newer St; feature detection keeps 46–50 on one code path.
        if (typeof this._scroll.set_child === 'function') this._scroll.set_child(this._body); else if (typeof this._scroll.add_child === 'function') this._scroll.add_child(this._body);
        else this._scroll.add_actor(this._body);
        this._root.add_child(this._scroll);
    }
    // Views: details (default), settings, editor. Leaving the popup always returns to details.
    _go(view) {
        this._view = view;
        if (view !== 'editor') this._editor = null;
        if (this._view === 'details') this._showDetails(); else if (view === 'settings') this._showSettings(); else this._buildEditor(this._editor ?? {});
        this._updateChrome();
        if (this._scroll.vadjustment) this._scroll.vadjustment.value = 0;
        // A short fade makes the swap feel continuous; opacity is cheap, unlike blur effects.
        this._body.opacity = 0; this._body.ease({opacity: 255, duration: 140, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }
    _render() {
        if (!this._indicator || !this._refresh) return;
        const monitor = Main.layoutManager.findMonitorForActor(this._indicator) ?? Main.layoutManager.primaryMonitor;
        // Keep header and list inside the popup: the list gets whatever the work area leaves.
        if (monitor) {
            const area = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
            const style = `max-height: ${Math.max(160, Math.min(580, area.height - 150))}px;`;
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
        if (this._view === 'details' && this._indicator.menu.isOpen && this._shownSignature !== signature) this._showDetails();
    }
    _buildTop() {
        this._top.destroy_all_children();
        const visible = this._accounts.list().filter(a => a.visible);
        const colored = this._settings.get_boolean('colored-bars'), format = this._settings.get_string('reset-format');
        if (!visible.length) {
            this._top.add_child(new St.Icon({gicon: Gio.FileIcon.new(Gio.File.new_for_path(`${this.path}/icons/meters-symbolic.svg`)), icon_size: 16}));
            this._top.add_child(label('AI', 'ai-time'));
        }
        visible.forEach((account, index) => {
            if (index) this._top.add_child(new St.Widget({style_class: 'ai-top-divider'}));
            const group = box(false, 'ai-top-account', {accessible_name: `${account.name}, ${account.provider}`});
            group.add_child(identity(account, this.path, {panel: true}));
            const content = box(true, 'ai-top-meter', {y_align: Clutter.ActorAlign.CENTER});
            const state = this._refresh.states.get(account.id), primary = state?.usage?.primary;
            content.add_child(label(formatReset(primary?.reset, format), 'ai-time', {x_align: Clutter.ActorAlign.CENTER}));
            content.add_child(new UsageBar(primary?.remaining ?? 0, {colored, compact: true}, {x_align: Clutter.ActorAlign.CENTER}));
            group.add_child(content); this._top.add_child(group);
        });
        this._indicator.accessible_name = 'AI Usage. ' + this._accounts.list().map(account => {
            const state = this._refresh.states.get(account.id), primary = state?.usage?.primary;
            return `${account.provider}, ${account.name}, ${account.initials}, ${primary ? `${Math.round(primary.remaining)}% restante, reset ${formatReset(primary.reset, format)}` : state?.error ?? 'aguardando consulta'}`;
        }).join('. ');
    }
    _updateChrome() {
        const view = this._view, details = view === 'details';
        this._backButton.visible = !details;
        const empty = !this._accounts.list().length;
        this._refreshButton.visible = details && !empty; this._settingsButton.visible = details;
        this._title.text = details ? 'AI Usage' : view === 'settings' ? 'Ajustes' : (this._editor?.id ? 'Editar conta' : 'Nova conta');
        this._status.visible = details && !empty;
        const states = [...this._refresh.states.values()];
        const last = Math.max(0, ...states.map(s => s.updated ?? 0));
        this._status.text = this._refresh.busy ? 'Atualizando…' : updatedLabel(last);
        this._refreshButton.reactive = !this._refresh.busy;
        this._refreshButton.can_focus = !this._refresh.busy;
        this._refreshButton.opacity = this._refresh.busy ? 150 : 255;
        if (this._refresh.busy && !this._spinning) { this._spinning = true; this._spin(); }
        else if (!this._refresh.busy && this._spinning) {
            this._spinning = false; this._refreshIcon.remove_all_transitions(); this._refreshIcon.rotation_angle_z = 0;
        }
    }
    _spin() {
        if (!this._spinning || !this._refreshIcon) return;
        this._refreshIcon.rotation_angle_z = 0;
        this._refreshIcon.ease({rotation_angle_z: 360, duration: 900, mode: Clutter.AnimationMode.LINEAR, onComplete: () => this._spin()});
    }
    _bar(percent, name) { return new UsageBar(percent, {colored: this._settings.get_boolean('colored-bars'), dark: this._dark, name}); }
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
        for (const account of accounts) {
            const card = box(true, 'ai-card');
            const heading = box(false, 'ai-account-heading'); heading.add_child(identity(account, this.path));
            const state = this._refresh?.states.get(account.id);
            const names = box(true, 'ai-names', {x_expand: true, y_align: Clutter.ActorAlign.CENTER});
            const plan = state?.usage?.plan ? ` · ${String(state.usage.plan).replace(/^./, c => c.toUpperCase())}` : '';
            names.add_child(label(account.name, 'ai-account-name', {x_align: Clutter.ActorAlign.START}));
            names.add_child(label(`${account.provider === 'openai' ? 'Codex' : 'Claude'}${plan}`, 'ai-caption', {x_align: Clutter.ActorAlign.START}));
            heading.add_child(names); card.add_child(heading);
            if (!state?.usage) {
                if (state?.error) {
                    const callout = box(false, 'ai-callout');
                    callout.add_child(glyph('dialog-warning-symbolic', 16, 'ai-callout-icon'));
                    const text = box(true, 'ai-callout-text', {x_expand: true});
                    text.add_child(label('Não foi possível atualizar', 'ai-callout-title', {x_align: Clutter.ActorAlign.START}));
                    text.add_child(wrapped(state.error, 'ai-caption')); callout.add_child(text); card.add_child(callout);
                } else {
                    const limit = box(true, 'ai-limit');
                    limit.add_child(label('Consultando…', 'ai-caption', {x_align: Clutter.ActorAlign.START}));
                    limit.add_child(this._bar(0, 'Consultando')); card.add_child(limit);
                }
            } else {
                for (const window of state.usage.windows) {
                    const limit = box(true, 'ai-limit'), head = box(false, 'ai-limit-head');
                    head.add_child(label(window.label, 'ai-limit-name'));
                    head.add_child(label('·', 'ai-caption ai-dot'));
                    head.add_child(label(resetShort(window.reset, format), 'ai-caption', {x_expand: true}));
                    const percent = Math.round(window.remaining);
                    head.add_child(label('Resta', 'ai-caption ai-remaining'));
                    head.add_child(label(`${percent}%`, percent <= 15 ? 'ai-percent ai-percent-low' : 'ai-percent'));
                    limit.add_child(head);
                    limit.add_child(this._bar(window.remaining, `${window.label}: ${percent}% restante`));
                    card.add_child(limit);
                }
                const extra = state.usage.extra;
                if (extra) {
                    const limit = box(true, 'ai-limit ai-limit-extra'), head = box(false, 'ai-limit-head');
                    head.add_child(label('Uso extra', 'ai-limit-name'));
                    head.add_child(label('·', 'ai-caption ai-dot'));
                    head.add_child(label(extra.limit == null ? 'créditos' : `${extra.used ?? 0} de ${extra.limit} créditos`, 'ai-caption', {x_expand: true}));
                    head.add_child(label('Usado', 'ai-caption ai-remaining'));
                    head.add_child(label(extra.utilization == null ? '--' : `${Math.round(extra.utilization)}%`, 'ai-percent')); limit.add_child(head);
                    if (extra.utilization != null) limit.add_child(this._bar(100 - extra.utilization, `Uso extra: ${Math.round(extra.utilization)}% usado`));
                    card.add_child(limit);
                }
            }
            this._body.add_child(card);
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
            const entry = new St.Entry({text: value, can_focus: true, style_class: 'ai-entry', x_expand: true, accessible_name: name});
            const row = box(false, 'ai-row'); const l = label(title, 'ai-row-title ai-field-title'); row.add_child(l); row.add_child(entry);
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
            live = null; sync();
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
        body.add_child(group(providerRow, name.row, path.row, initials.row));
        body.add_child(group(paletteRow, color.row));
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
                    initials: cleanInitials(initials.entry.text), color: color.entry.text.trim()});
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
        this._keymapCancellable?.cancel();
        this._keymapCancellable = null;
        if (this._printSignal) global.display.disconnect(this._printSignal);
        if (this._printMenuSignal) this._indicator.menu.disconnect(this._printMenuSignal);
        if (this._menuSignal) this._indicator.menu.disconnect(this._menuSignal);
        this._printMenuSignal = this._menuSignal = 0;
        this._restorePrintBindings();
        this._printSignal = 0;
        this._refresh?.destroy(); this._refresh = null;
        if (this._minute) GLib.Source.remove(this._minute);
        this._minute = 0; this._spinning = false;
        for (const signal of this._signals ?? []) this._settings.disconnect(signal);
        this._signals = [];
        this._indicator?.destroy(); this._indicator = null;
        this._settings = null; this._accounts = null; this._editor = null;
        this._body = null; this._root = null; this._top = null;
        this._refreshIcon = null; this._refreshButton = null; this._scroll = null;
    }
}
