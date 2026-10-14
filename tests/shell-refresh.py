"""Regression test in an isolated GNOME Shell: closed popup and disabled animations.
Run after make build: python3 tests/shell-refresh.py
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

with tempfile.TemporaryDirectory(prefix='aiusage-shell-test-') as directory:
    root = Path(directory)
    extension = root / 'data/gnome-shell/extensions/ai-usage@guepardosys'
    shutil.copytree('build/ai-usage@guepardosys', extension)
    source = extension / 'extension.js'
    code = source.read_text()
    code = code.replace('this._refresh.start();', '''
        const fixture = {
            getUsage: () => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1100, () => {
                resolve({windows: [], primary: null}); return GLib.SOURCE_REMOVE;
            })), destroy() {},
        };
        this._refresh.providers.openai.destroy();
        this._refresh.providers.claude.destroy();
        this._refresh.providers = {openai: fixture, claude: fixture};
        this._refresh.start();
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1800, () => {
            if (this._refresh.busy || this._refresh.states.size !== 1 || this._spinTimer)
                throw new Error('Closed popup refresh did not finish');
            this._indicator.menu.open();
            this._refresh.refresh();
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1800, () => {
                if (this._refresh.busy || this._spinTimer)
                    throw new Error('Refresh with animations disabled did not finish');
                this._refresh.refresh();
                this.disable();
                if (this._spinTimer) throw new Error('Spinner timer leaked on disable');
                console.log('AIUSAGE SHELL REGRESSION PASS');
                return GLib.SOURCE_REMOVE;
            });
            return GLib.SOURCE_REMOVE;
        });''')
    source.write_text(code)
    keyfile = root / 'config/glib-2.0/settings/keyfile'
    keyfile.parent.mkdir(parents=True)
    keyfile.write_text('''[org/gnome/shell]
enabled-extensions=['ai-usage@guepardosys']
disable-user-extensions=false

[org/gnome/desktop/interface]
enable-animations=false

[org/gnome/shell/extensions/aiusage]
accounts='[{"id":"test","provider":"openai","name":"Test","initials":"T","color":"#0A84FF","profilePath":"/tmp/unused-fixture","visible":true}]'
''')
    env = dict(os.environ, XDG_DATA_HOME=str(root / 'data'),
               XDG_CONFIG_HOME=str(root / 'config'), GSETTINGS_BACKEND='keyfile')
    result = subprocess.run(['timeout', '10s', 'dbus-run-session', '--', 'gnome-shell',
                             '--headless', '--wayland', '--no-x11', '--virtual-monitor', '1280x800'],
                            env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    assert 'AIUSAGE SHELL REGRESSION PASS' in result.stdout, result.stdout
    assert 'JS ERROR' not in result.stdout and 'Unhandled promise rejection' not in result.stdout, result.stdout
    print('GNOME Shell: closed popup, disabled animations and spinner cleanup OK')
