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
import {formatReset, resetDetail, updatedLabel} from './utils/time.js';
import {initialsFor, cleanInitials} from './utils/initials.js';
import {UsageBar} from './ui/bar.js';
import {box, label, button, identity, choice} from './ui/widgets.js';

export default class AIUsageExtension extends Extension {
    enable() {
        this._settings = this.getSettings(); this._accounts = new Accounts(this._settings);
        this._tab = 'details'; this._editor = null;
        this._indicator = new PanelMenu.Button(0.5, 'AI Usage');
        this._top = box(false, 'ai-top'); this._indicator.add_child(this._top);
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
        this._indicator.menu.actor.add_style_class_name('ai-menu');
        const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        this._root = box(true, 'ai-root', {x_expand: true}); item.add_child(this._root);
        this._indicator.menu.addMenuItem(item);
        this._buildShell();
        this._setupScreenshotShortcut();
        this._refresh = new RefreshService(this._accounts, this._settings, () => this._render());
        this._signals = [this._settings.connect('changed', (_s, key) => {
            this._render();
            if (this._tab === 'settings' && key === 'accounts' && !this._saving) this._showSettings();
        })];
        this._minute = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => { this._render(); return GLib.SOURCE_CONTINUE; });
        this._refresh.start();
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
        const header = box(false, 'ai-header'); header.add_child(label('AI Usage', 'ai-title', {x_expand: true}));
        this._root.add_child(header);
        const tabs = box(false, 'ai-tabs');
        this._detailTab = button('Detalhes', () => this._setTab('details'), null, 'ai-tab selected');
        this._settingsTab = button('Configurações', () => this._setTab('settings'), null, 'ai-tab');
        this._detailTab.toggle_mode = true; this._detailTab.checked = true;
        this._detailTab.x_expand = this._settingsTab.x_expand = true;
        this._settingsTab.toggle_mode = true;
        tabs.add_child(this._detailTab); tabs.add_child(this._settingsTab); this._root.add_child(tabs);
        this._scroll = new St.ScrollView({style_class: 'ai-scroll', overlay_scrollbars: false, x_expand: true});
        this._body = box(true, 'ai-body', {x_expand: true});
        // add_child replaced set_child in newer St; feature detection keeps 46–50 on one code path.
        if (typeof this._scroll.set_child === 'function') this._scroll.set_child(this._body); else if (typeof this._scroll.add_child === 'function') this._scroll.add_child(this._body);
        else this._scroll.add_actor(this._body);
        this._root.add_child(this._scroll);
        const footer = box(false, 'ai-footer');
        this._status = label('Ainda não atualizado', 'ai-secondary', {x_expand: true}); footer.add_child(this._status);
        this._refreshButton = button('Atualizar', () => this._refresh?.refresh(), 'view-refresh-symbolic');
        this._refreshIcon = this._refreshButton.get_child().get_first_child();
        footer.add_child(this._refreshButton); this._root.add_child(footer);
    }
    _setTab(tab) {
        this._tab = tab;
        this._detailTab.checked = tab === 'details';
        this._settingsTab.checked = tab === 'settings';
        this._detailTab.set_style_class_name(`ai-tab${tab === 'details' ? ' selected' : ''}`);
        this._settingsTab.set_style_class_name(`ai-tab${tab === 'settings' ? ' selected' : ''}`);
        if (tab === 'settings') this._showSettings(); else this._showDetails();
    }
    _render() {
        if (!this._indicator || !this._refresh) return;
        const monitor = Main.layoutManager.findMonitorForActor(this._indicator) ?? Main.layoutManager.primaryMonitor;
        // Keep header, tabs and footer inside the popup: the list gets whatever the work area leaves.
        if (monitor) {
            const area = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
            const style = `max-height: ${Math.max(120, Math.min(520, area.height - 250))}px;`;
            if (style !== this._scrollStyle) { this._scrollStyle = style; this._scroll.set_style(style); }
        }
        // Skip rebuilding identical content: destroying actors every tick makes the panel and list flash.
        const format = this._settings.get_string('reset-format'), colored = this._settings.get_boolean('colored-bars');
        const signature = JSON.stringify([this._accounts.list(), [...this._refresh.states], format, colored,
            format === 'relative' ? Math.floor(Date.now() / 60000) : 0]);
        const changed = signature !== this._signature; this._signature = signature;
        if (changed) this._buildTop();
        this._updateChrome();
        if (this._tab === 'details' && (changed || this._shownSignature !== signature)) this._showDetails();
    }
    _buildTop() {
        this._top.destroy_all_children();
        const visible = this._accounts.list().filter(a => a.visible);
        if (!visible.length) {
            this._top.add_child(new St.Icon({icon_name: 'applications-science-symbolic', icon_size: 18}));
            this._top.add_child(label('AI', 'ai-time'));
        }
        visible.forEach((account, index) => {
            if (index) this._top.add_child(new St.Widget({style_class: 'ai-top-divider'}));
            const group = box(false, 'ai-top-account', {accessible_name: `${account.name}, ${account.provider}`});
            group.add_child(identity(account, this.path, true));
            const content = box(true, 'ai-top-meter', {y_align: Clutter.ActorAlign.CENTER});
            const state = this._refresh.states.get(account.id), primary = state?.usage?.primary;
            content.add_child(label(formatReset(primary?.reset, this._settings.get_string('reset-format')), 'ai-time', {x_align: Clutter.ActorAlign.CENTER}));
            content.add_child(new UsageBar(primary?.remaining ?? 0, this._settings.get_boolean('colored-bars'), true, {x_align: Clutter.ActorAlign.CENTER}));
            group.add_child(content); this._top.add_child(group);
        });
        this._indicator.accessible_name = 'AI Usage. ' + this._accounts.list().map(account => {
            const state = this._refresh.states.get(account.id), primary = state?.usage?.primary;
            return `${account.provider}, ${account.name}, ${account.initials}, ${primary ? `${Math.round(primary.remaining)}% restante, reset ${formatReset(primary.reset, this._settings.get_string('reset-format'))}` : state?.error ?? 'aguardando consulta'}`;
        }).join('. ');
    }
    _updateChrome() {
        const states = [...this._refresh.states.values()];
        const last = Math.max(0, ...states.map(s => s.updated ?? 0));
        this._status.text = this._refresh.busy ? 'Atualizando…' : updatedLabel(last);
        this._refreshButton.reactive = !this._refresh.busy;
        this._refreshButton.can_focus = !this._refresh.busy;
        if (this._refresh.busy && !this._spin) {
            this._spin = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
                this._refreshIcon.rotation_angle_z = (this._refreshIcon.rotation_angle_z + 14) % 360;
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!this._refresh.busy && this._spin) {
            GLib.Source.remove(this._spin); this._spin = 0; this._refreshIcon.rotation_angle_z = 0;
        }
    }
    _showDetails() {
        this._shownSignature = this._signature;
        const scrollValue = this._scroll.vadjustment?.value ?? 0;
        this._body.destroy_all_children();
        const accounts = this._accounts.list();
        if (!accounts.length) {
            this._body.add_child(label('Seus limites, sempre à vista.', 'ai-empty-title'));
            this._body.add_child(label('Adicione um perfil autenticado do\nCodex ou Claude em Configurações.', 'ai-secondary'));
            this._body.add_child(button('Adicionar conta', () => { this._editor = {}; this._setTab('settings'); }, 'list-add-symbolic'));
        }
        for (const account of accounts) {
            const section = box(true, 'ai-account-section');
            const heading = box(false, 'ai-account-heading'); heading.add_child(identity(account, this.path));
            const names = box(true, 'ai-names', {x_expand: true});
            names.add_child(label(account.provider === 'openai' ? 'Codex / OpenAI' : 'Claude', 'ai-provider'));
            names.add_child(label(`${account.initials} · ${account.name}`, 'ai-secondary')); heading.add_child(names); section.add_child(heading);
            const state = this._refresh?.states.get(account.id);
            if (!state?.usage) {
                section.add_child(label(state?.error ? '-- · erro ao atualizar' : 'Aguardando consulta…', 'ai-error'));
                if (state?.error) {
                    const error = label(state.error, 'ai-secondary'); error.clutter_text.line_wrap = true;
                    section.add_child(error);
                }
            } else {
                for (const window of state.usage.windows) {
                    const row = box(false, 'ai-limit-heading');
                    row.add_child(label(window.label, 'ai-limit-name'));
                    row.add_child(label('·', 'ai-dot'));
                    row.add_child(label(resetDetail(window.reset, this._settings.get_string('reset-format')), 'ai-reset', {x_expand: true}));
                    row.add_child(label(`Resta ${Math.round(window.remaining)}%`, 'ai-percent')); section.add_child(row);
                    section.add_child(new UsageBar(window.remaining, this._settings.get_boolean('colored-bars')));
                }
                if (state.usage.extra) {
                    const extra = state.usage.extra;
                    section.add_child(label(`Uso extra · ${extra.utilization ?? '--'}% utilizado`, 'ai-secondary'));
                    if (extra.limit != null) section.add_child(label(`${extra.used ?? 0} / ${extra.limit} créditos`, 'ai-secondary'));
                }
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
        this._shownSignature = null;
        const focus = global.stage.get_key_focus();
        if (focus && this._body.contains(focus)) global.stage.set_key_focus(this._settingsTab);
        this._body.destroy_all_children();
        this._body.add_child(label('Aparência', 'ai-section-title'));
        this._body.add_child(choice('Formato do reset', [['24h', '24 horas'], ['12h', '12 horas'], ['relative', 'Relativo']],
            this._settings.get_string('reset-format'), value => this._settings.set_string('reset-format', value)));
        const toggle = new PopupMenu.PopupSwitchMenuItem('Barra colorida', this._settings.get_boolean('colored-bars'));
        toggle.add_style_class_name('ai-setting-row');
        toggle.connect('toggled', (_item, active) => this._settings.set_boolean('colored-bars', active));
        this._body.add_child(toggle);
        this._body.add_child(choice('Atualizar a cada', [[1, '1 min'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '60 min']],
            this._settings.get_int('refresh-minutes'), value => this._settings.set_int('refresh-minutes', value)));
        this._body.add_child(label('Contas', 'ai-section-title'));
        const accounts = this._accounts.list();
        accounts.forEach((account, index) => {
            const section = box(true, 'ai-account-edit'); const row = box(false, 'ai-account-heading');
            row.add_child(identity(account, this.path));
            const names = box(true, 'ai-names', {x_expand: true});
            names.add_child(label(`${account.provider === 'openai' ? 'OpenAI' : 'Claude'} · ${account.initials}`, 'ai-provider'));
            names.add_child(label(account.name, 'ai-setting-name')); names.add_child(label(account.profilePath, 'ai-caption')); row.add_child(names); section.add_child(row);
            const actions = box(false, 'ai-account-actions');
            actions.add_child(button('Editar', () => { this._editor = account; this._showSettings(); }, 'document-edit-symbolic'));
            actions.add_child(button(account.visible ? 'Ocultar' : 'Mostrar', () => this._accounts.put({...account, visible: !account.visible}), account.visible ? 'view-reveal-symbolic' : 'view-conceal-symbolic'));
            const up = button('Mover para cima', () => this._accounts.move(account.id, -1), 'go-up-symbolic', 'ai-icon-button');
            const down = button('Mover para baixo', () => this._accounts.move(account.id, 1), 'go-down-symbolic', 'ai-icon-button');
            up.reactive = index > 0; down.reactive = index < accounts.length - 1;
            actions.add_child(up); actions.add_child(down);
            actions.add_child(button('Remover conta', () => {
                actions.destroy_all_children(); actions.add_child(label('Remover este perfil?', '', {x_expand: true}));
                actions.add_child(button('Cancelar', () => this._showSettings()));
                actions.add_child(button('Remover', () => this._accounts.remove(account.id), 'user-trash-symbolic', 'ai-button ai-danger'));
            }, 'user-trash-symbolic', 'ai-icon-button'));
            section.add_child(actions); this._body.add_child(section);
        });
        if (this._editor) this._buildEditor(this._editor);
        else this._body.add_child(button('Adicionar conta', () => { this._editor = {}; this._showSettings(); }, 'list-add-symbolic'));
    }
    _buildEditor(account) {
        const form = box(true, 'ai-form'); form.add_child(label(account.id ? 'Editar conta' : 'Adicionar conta', 'ai-section-title'));
        let provider = account.provider ?? 'openai';
        form.add_child(choice('Provider', [['openai', 'Codex / OpenAI'], ['claude', 'Claude']], provider, value => {
            const old = provider; provider = value;
            if (path.text === (old === 'openai' ? '~/.codex' : '~/.claude')) path.text = value === 'openai' ? '~/.codex' : '~/.claude';
        }));
        const field = (title, value) => {
            form.add_child(label(title, 'ai-field-label'));
            const entry = new St.Entry({text: value, can_focus: true, style_class: 'ai-entry', x_expand: true,
                accessible_name: title}); form.add_child(entry); return entry;
        };
        const name = field('Nome', account.name ?? '');
        const path = field('Perfil / diretório', account.profilePath ?? (provider === 'openai' ? '~/.codex' : '~/.claude'));
        const initials = field('Iniciais', account.initials ?? ''); initials.clutter_text.max_length = 3;
        let manual = Boolean(account.id), automatic = false;
        initials.clutter_text.connect('text-changed', () => { if (!automatic) manual = true; });
        name.clutter_text.connect('text-changed', () => {
            if (!manual) { automatic = true; initials.text = initialsFor(name.text); automatic = false; }
        });
        const color = field('Cor · hexadecimal', account.color ?? '#0A84FF');
        const palette = box(false, 'ai-palette');
        for (const value of ['#0A84FF', '#8E145F', '#7D35D8', '#166B47', '#B54708']) {
            const swatch = new St.Button({style_class: 'ai-swatch', can_focus: true, accessible_name: `Cor ${value}`});
            swatch.set_style(`background-color: ${value};`); swatch.connect('clicked', () => { color.text = value; }); palette.add_child(swatch);
        }
        form.add_child(palette);
        const error = label('', 'ai-error'); error.clutter_text.line_wrap = true; form.add_child(error);
        const actions = box(false, 'ai-form-actions');
        actions.add_child(button('Cancelar', () => { this._editor = null; this._showSettings(); }));
        actions.add_child(button(account.id ? 'Salvar' : 'Adicionar', () => {
            try {
                this._saving = true;
                this._accounts.put({...account, provider, name: name.text, profilePath: path.text,
                    initials: cleanInitials(initials.text), color: color.text});
                this._editor = null; this._showSettings();
            } catch (e) { error.text = e.message; }
            finally { this._saving = false; }
        }, null, 'ai-button ai-primary')); form.add_child(actions); this._body.add_child(form);
    }
    disable() {
        this._keymapCancellable?.cancel();
        this._keymapCancellable = null;
        if (this._printSignal) global.display.disconnect(this._printSignal);
        if (this._printMenuSignal) this._indicator.menu.disconnect(this._printMenuSignal);
        this._printMenuSignal = 0;
        this._restorePrintBindings();
        this._printSignal = 0;
        this._refresh?.destroy(); this._refresh = null;
        for (const id of [this._minute, this._spin]) if (id) GLib.Source.remove(id);
        this._minute = 0; this._spin = 0;
        for (const signal of this._signals ?? []) this._settings.disconnect(signal);
        this._signals = [];
        this._indicator?.destroy(); this._indicator = null;
        this._settings = null; this._accounts = null; this._editor = null;
        this._body = null; this._root = null; this._top = null;
        this._refreshIcon = null; this._refreshButton = null; this._scroll = null;
    }
}
