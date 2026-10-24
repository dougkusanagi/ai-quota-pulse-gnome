"""Native panel indicator: placement, click-only opening, themes and dismissal.
Run after make build in an isolated GNOME Shell with virtual input.
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

with tempfile.TemporaryDirectory(prefix='aiusage-notch-test-') as directory:
    root = Path(directory)
    extension = root / 'data/gnome-shell/extensions/ai-usage@guepardosys'
    shutil.copytree('build/ai-usage@guepardosys', extension)
    source = extension / 'extension.js'
    source.write_text(source.read_text().replace('this._refresh.start();', '''
        const fixture = {getUsage: async () => ({windows: [], primary: null}), destroy() {}};
        this._refresh.providers.openai.destroy(); this._refresh.providers.claude.destroy();
        this._refresh.providers = {openai: fixture, claude: fixture};
        this._refresh.start();
        const seat = Clutter.get_default_backend().get_default_seat();
        const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const move = (x, y) => pointer.notify_absolute_motion(GLib.get_monotonic_time(), x, y);
        const click = () => { pointer.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
            pointer.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED); };
        const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { r(); return GLib.SOURCE_REMOVE; }));
        const check = (ok, message) => { if (!ok) throw new Error(message); };
        (async () => {
            await wait(1500);
            const actor = this._notch.actor, [x, y] = actor.get_transformed_position();
            check(!this._notch.isOpen, 'starts closed');
            const [, panelY] = Main.panel.get_transformed_position();
            const [, panelHeight] = Main.panel.get_transformed_size();
            const [clockX] = Main.panel.statusArea.dateMenu.get_transformed_position();
            check(Main.panel._leftBox.contains(actor), 'indicator belongs to left panel area');
            check(y >= panelY && y + actor.height <= panelY + panelHeight, 'indicator fits inside top bar');
            check(x + actor.width <= clockX, 'indicator stays left of clock');
            move(x + actor.width / 2, y + actor.height / 2); await wait(400);
            check(!this._notch.isOpen, 'hover does not open details');
            click(); await wait(500);
            check(this._notch.isOpen, 'click opens details');
            const bar = this._bar(62, 'Test');
            const row = box(false, 'ai-limit-row'); row.add_child(bar); this._body.add_child(row);
            await wait(100);
            check(bar.height <= 6, `thin quota bar, got ${bar.height}px`);
            this._themeButtons.get('light').emit('clicked', Clutter.BUTTON_PRIMARY);
            check(this._settings.get_string('theme') === 'light' && !this._dark, 'footer selects light theme');
            this._settings.set_string('theme', 'dark');
            check(this._themeButtons.get('dark').checked, 'footer follows theme changes from settings');
            this._themeButtons.get('auto').emit('clicked', Clutter.BUTTON_PRIMARY);
            check(this._settings.get_string('theme') === 'auto', 'footer selects system theme');
            move(900, 600); await wait(900);
            check(this._notch.isOpen, 'leaving keeps details open');
            click(); await wait(300);
            check(!this._notch.isOpen, 'outside click closes details');
            this._notch.open(); await wait(300);
            this._go('settings'); await wait(400);
            move(900, 700); await wait(900);
            check(this._notch.isOpen && this._view === 'settings', 'settings pins the notch open');
            click(); await wait(600);
            check(this._view === 'details', 'outside click returns to details');
            await wait(600);
            check(!this._notch.isOpen, 'notch closes after dismissal');
            this._notch.open(); this._go('settings'); await wait(300);
            const keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
            keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Escape, Clutter.KeyState.PRESSED);
            keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Escape, Clutter.KeyState.RELEASED);
            await wait(300);
            check(this._view === 'details', 'Escape returns to details');
            this.disable();
            console.log('AIUSAGE NOTCH PASS');
        })().catch(e => console.error(`NOTCH FAILED ${e.message}`));'''))
    keyfile = root / 'config/glib-2.0/settings/keyfile'
    keyfile.parent.mkdir(parents=True)
    keyfile.write_text('''[org/gnome/shell]
enabled-extensions=['ai-usage@guepardosys']
disable-user-extensions=false

[org/gnome/shell/extensions/aiusage]
accounts='[{"id":"test","provider":"openai","name":"Test","initials":"T","color":"#0A84FF","profilePath":"/tmp/unused-fixture","visible":true}]'
''')
    env = dict(os.environ, XDG_DATA_HOME=str(root / 'data'),
               XDG_CONFIG_HOME=str(root / 'config'), GSETTINGS_BACKEND='keyfile')
    result = subprocess.run(['timeout', '14s', 'dbus-run-session', '--', 'gnome-shell',
                             '--headless', '--wayland', '--no-x11', '--virtual-monitor', '1280x800'],
                            env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    assert 'AIUSAGE NOTCH PASS' in result.stdout, '\n'.join(l for l in result.stdout.splitlines() if 'NOTCH' in l or 'rror' in l)
    assert 'JS ERROR' not in result.stdout and 'Unhandled promise rejection' not in result.stdout, result.stdout
    print('GNOME Shell: panel placement, click-only menu, themes, outside click and Escape OK')
