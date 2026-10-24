"""Check rendered switch positions in an isolated GNOME Shell (no real accounts)."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

with tempfile.TemporaryDirectory(prefix='aiusage-switch-test-') as directory:
    root = Path(directory)
    extension = root / 'data/gnome-shell/extensions/ai-usage@guepardosys'
    shutil.copytree('build/ai-usage@guepardosys', extension)
    source = extension / 'extension.js'
    source.write_text(source.read_text().replace('this._refresh.start();', '''
        this._body.destroy_all_children();
        const switches = [];
        for (const dark of [false, true]) {
            const surface = box(true, `ai-menu ai-accent-blue ${dark ? 'ai-dark' : ''}`);
            surface.set_style(`background-color: ${dark ? '#2a2b2f' : '#ffffff'}; padding: 16px; border-radius: 12px; spacing: 16px;`);
            for (const active of [false, true]) {
                const control = toggle('Mensagem após reset', active, () => {});
                switches.push(control);
                const row = settingRow(active ? 'Ligado' : 'Desligado', control);
                row.set_style(`color: ${dark ? '#ffffff' : '#1d1d1f'};`);
                surface.add_child(row);
            }
            this._body.add_child(surface);
        }
        this._notch.open();
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
            try {
                let offColor = null;
                for (const control of switches) {
                    const thumb = control.get_child();
                    const [cx] = control.get_transformed_position();
                    const [tx] = thumb.get_transformed_position();
                    const [cw, ch] = control.get_transformed_size();
                    const [tw, th] = thumb.get_transformed_size();
                    const color = control.get_theme_node().get_background_color().to_string();
                    console.log(`SWITCH checked=${control.checked} left=${tx-cx} right=${cx+cw-tx-tw} size=${cw}x${ch} thumb=${tw}x${th} color=${color}`);
                    if (!control.checked) offColor = color;
                    if (control.checked && (color === offColor || !color.endsWith('ff')))
                        throw new Error('Enabled switch does not use the accent color');
                    const gap = control.checked ? cx + cw - tx - tw : tx - cx;
                    if (gap > 4 || gap < 1 || tw !== 16 || th !== 16)
                        throw new Error('Switch thumb is not at the expected edge');
                }
                console.log('AIUSAGE SWITCHES PASS');

            } catch (error) { console.error(error); }
            return GLib.SOURCE_REMOVE;
        });'''))
    keyfile = root / 'config/glib-2.0/settings/keyfile'
    keyfile.parent.mkdir(parents=True)
    keyfile.write_text("""[org/gnome/shell]
enabled-extensions=['ai-usage@guepardosys']
disable-user-extensions=false

[org/gnome/desktop/interface]
enable-animations=false

[org/gnome/shell/extensions/aiusage]
accounts='[]'
""")
    env = dict(os.environ, XDG_DATA_HOME=str(root / 'data'),
               XDG_CONFIG_HOME=str(root / 'config'), GSETTINGS_BACKEND='keyfile')
    result = subprocess.run(['timeout', '5s', 'dbus-run-session', '--', 'gnome-shell',
                             '--headless', '--wayland', '--no-x11', '--virtual-monitor', '1280x800'],
                            env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    assert 'AIUSAGE SWITCHES PASS' in result.stdout, result.stdout
    assert 'JS ERROR' not in result.stdout and 'Unhandled promise rejection' not in result.stdout, result.stdout
    print('\n'.join(line for line in result.stdout.splitlines() if 'SWITCH' in line))
