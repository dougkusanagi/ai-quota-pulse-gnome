"""Account editor: real pointer selection, clipboard and text allocation regressions.
Run after make build in an isolated GNOME Shell with virtual input.
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

with tempfile.TemporaryDirectory(prefix='aiusage-editor-test-') as directory:
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
            this._notch.open(); this._editor = {}; this._go('editor');
            await wait(500);
            const all = actor => [actor, ...actor.get_children().flatMap(all)];
            const entries = () => all(this._body).filter(a => a instanceof St.Entry);
            const path = entries().find(a => a.accessible_name === 'Perfil / diretório');
            const name = entries().find(a => a.accessible_name === 'Nome');
            name.text = 'Ágypq João — trabalho';
            path.text = "~/.codex-trabalho com espaços";
            const copy = () => all(this._body).find(a => a.accessible_name === 'Copiar comando de login');
            const command = () => all(this._body).find(a => a instanceof St.Label && a.text.startsWith('CODEX_HOME='));
            await wait(300);
            const text = command();
            check(text?.reactive && text.clutter_text.reactive && text.clutter_text.selectable, 'command receives selection events');
            const [tx, ty] = text.get_transformed_position();
            move(tx + 3, ty + 5); await wait(80);
            pointer.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
            move(tx + Math.min(text.width - 3, 140), ty + 5); await wait(100);
            pointer.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
            await wait(100);
            check(text.clutter_text.get_selection().length > 0, 'mouse drag selects command');
            const [cx, cy] = copy().get_transformed_position();
            move(cx + copy().width / 2, cy + copy().height / 2); click(); await wait(100);
            const clipboard = () => new Promise(resolve => St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_c, value) => resolve(value)));
            check(await clipboard() === loginCommand('openai', path.text), 'copy uses current directory');
            check(all(this._body).some(a => a instanceof St.Label && a.text === 'Copiado.'), 'copy confirms success');
            path.text = '';
            check(!copy().visible, 'empty directory cannot copy a stale command');
            path.text = '~/perfil-atualizado';
            copy().emit('clicked', Clutter.BUTTON_PRIMARY);
            check(await clipboard() === loginCommand('openai', path.text), 'copy updates after editing');
            const claude = all(this._body).find(a => a instanceof St.Button && a.accessible_name === 'Claude');
            claude.emit('clicked', Clutter.BUTTON_PRIMARY);
            copy().emit('clicked', Clutter.BUTTON_PRIMARY);
            check(await clipboard() === loginCommand('claude', path.text), 'copy follows provider');
            for (const editing of [false, true]) {
                if (editing) {
                    this._editor = {...this._accounts.list()[0], name: 'Ágypq João — trabalho'};
                    this._go('editor');
                }
                for (const scale of [1, 1.25]) {
                    this._systemSettings.set_double('text-scaling-factor', scale);
                    await wait(250);
                    for (const entry of entries()) {
                        const t = entry.clutter_text;
                        check(t.height >= t.get_preferred_height(t.width)[1], `text ${entry.accessible_name} has natural height at scale ${scale}: ${t.height} vs ${t.get_preferred_height(t.width)[1]}, entry ${entry.height}, natural ${entry.get_preferred_height(entry.width)}, row ${entry.get_parent().height}`);
                        check(t.y >= 0 && t.y + t.height <= entry.height, `text fits entry at scale ${scale}`);
                    }
                }
            }
            this._systemSettings.set_double('text-scaling-factor', 1);
            this.disable();
            console.log('AIUSAGE EDITOR PASS');
        })().catch(e => console.error(`EDITOR FAILED ${e.message}`));'''))
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
    assert 'AIUSAGE EDITOR PASS' in result.stdout, '\n'.join(l for l in result.stdout.splitlines() if 'EDITOR' in l or 'rror' in l)
    assert 'JS ERROR' not in result.stdout and 'Unhandled promise rejection' not in result.stdout, result.stdout
    print('GNOME Shell: editor selection, clipboard, provider changes and input text height OK')
