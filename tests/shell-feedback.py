"""Render reset help and verify a fast refresh completes a full turn in GNOME."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

for theme in ('light', 'dark'):
    with tempfile.TemporaryDirectory(prefix='aiusage-feedback-test-') as directory:
        root = Path(directory)
        extension = root / 'data/gnome-shell/extensions/ai-usage@guepardosys'
        shutil.copytree('build/ai-usage@guepardosys', extension)
        source = extension / 'extension.js'
        source.write_text(source.read_text().replace('this._refresh.start();', '''
            const window = {id: 'five_hour', label: '5 horas', kind: 'main', minutes: 300, remaining: 99, reset: Date.now()/1000 + 15000};
            const fixture = {
                getUsage: () => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20, () => {
                    resolve({windows: [window], primary: window}); return GLib.SOURCE_REMOVE;
                })), destroy() {},
            };
            this._refresh.providers.openai.destroy();
            this._refresh.providers.claude.destroy();
            this._refresh.providers = {openai: fixture, claude: fixture};
            this._refresh.start();
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                this._notch.open();
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                    try {
                        let section = this._body.get_first_child();
                        let controls = section.get_first_child().get_last_child();
                        let help = section.get_children()[1].get_first_child();
                        if (help.visible) throw new Error('Help must start closed');
                        controls.get_first_child().emit('clicked', 1);
                        if (!help.visible || controls.get_last_child().checked) throw new Error('Help click changed switch or failed to open');
                        if (!help.get_first_child().text.includes('Mensagem após reset')) throw new Error('Help is not labeled');
                        this._showDetails();
                        section = this._body.get_first_child();
                        help = section.get_children()[1].get_first_child();
                        if (!help.visible) throw new Error('Refresh lost expanded help');
                        section.get_first_child().get_last_child().get_first_child().emit('clicked', 1);
                        if (help.visible) throw new Error('Help failed to close');
                        const [width] = section.get_transformed_size();
                        if (width > this._body.width) throw new Error('Help layout overflows card');
                        let maxRotation = 0;
                        this._refreshIcon.connect('notify::rotation-angle-z', () => {
                            maxRotation = Math.max(maxRotation, this._refreshIcon.rotation_angle_z);
                        });
                        this._refresh.refresh();
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                            if (this._refresh.busy || !this._spinning) console.error('Fast request cut the turn short');
                            else console.log('AIUSAGE FAST TURN CONTINUES');
                            return GLib.SOURCE_REMOVE;
                        });
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1300, () => {
                            try {
                                if (maxRotation < 359 || this._spinning || this._spinTimer || this._refreshIcon.rotation_angle_z !== 0)
                                    throw new Error(`Incomplete turn or leaked timer: ${maxRotation}`);
                                this.disable();
                                if (this._spinTimer) throw new Error('Disable leaked spinner');
                                console.log('AIUSAGE FEEDBACK PASS');
                            } catch (error) { console.error(error); }
                            return GLib.SOURCE_REMOVE;
                        });
                    } catch (error) { console.error(error); }
                    return GLib.SOURCE_REMOVE;
                });
                return GLib.SOURCE_REMOVE;
            });'''))
        keyfile = root / 'config/glib-2.0/settings/keyfile'
        keyfile.parent.mkdir(parents=True)
        keyfile.write_text(f"""[org/gnome/shell]
enabled-extensions=['ai-usage@guepardosys']
disable-user-extensions=false

[org/gnome/desktop/interface]
enable-animations=true

[org/gnome/shell/extensions/aiusage]
theme='{theme}'
accounts='[{{"id":"test","provider":"openai","name":"Conta de teste","initials":"T","color":"#0A84FF","profilePath":"/tmp/unused-fixture","visible":true}}]'
""")
        env = dict(os.environ, XDG_DATA_HOME=str(root / 'data'),
                   XDG_CONFIG_HOME=str(root / 'config'), GSETTINGS_BACKEND='keyfile')
        result = subprocess.run(['timeout', '5s', 'dbus-run-session', '--', 'gnome-shell',
                                 '--headless', '--wayland', '--no-x11', '--virtual-monitor', '1280x800'],
                                env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        Path('/tmp/aiusage-feedback-test.log').write_text(result.stdout)
        assert 'AIUSAGE FAST TURN CONTINUES' in result.stdout and 'AIUSAGE FEEDBACK PASS' in result.stdout, result.stdout
        assert 'JS ERROR' not in result.stdout and 'Unhandled promise rejection' not in result.stdout, result.stdout
        print(f'GNOME Shell ({theme}): help opens/closes without toggling, survives refresh, fast refresh completes 360° and cleans timers')
