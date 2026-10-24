"""Capture the notch in an isolated headless GNOME Shell (after `make build`).
Usage: python3 scripts/screenshot.py OUTDIR [light|dark] [single|multi]
Writes closed.png, open.png, settings.png and editor.png into OUTDIR. Data are fixtures; no network or credentials.
"""
import os, shutil, subprocess, sys, tempfile
from pathlib import Path

out = Path(sys.argv[1]).resolve(); out.mkdir(parents=True, exist_ok=True)
theme = sys.argv[2] if len(sys.argv) > 2 else 'dark'
mode = sys.argv[3] if len(sys.argv) > 3 else 'single'
monitor_size = sys.argv[4] if len(sys.argv) > 4 else '1280x800'
accounts = [
    ('c1', 'claude', 'Principal', 'P', '#D97757'),
    ('o1', 'openai', 'Principal', 'P', '#0A84FF'),
]
if mode == 'multi':
    accounts += [('c2', 'claude', 'Trabalho', 'TR', '#7D35D8'), ('o2', 'openai', 'Cliente Acme', 'CA', '#1F9D55')]
import json
acc_json = json.dumps([{'id': i, 'provider': p, 'name': n, 'initials': ini, 'color': c, 'profilePath': f'/tmp/x-{i}', 'visible': True}
                       for i, p, n, ini, c in accounts])
with tempfile.TemporaryDirectory(prefix='aiusage-shot-') as directory:
    root = Path(directory)
    extension = root / 'data/gnome-shell/extensions/ai-usage@guepardosys'
    shutil.copytree('build/ai-usage@guepardosys', extension)
    source = extension / 'extension.js'
    source.write_text(source.read_text().replace('this._refresh.start();', '''
        const now = Date.now() / 1000;
        const mk = (r5, t5, rw, tw, plan) => { const a = {id: 'five_hour', label: '5 horas', kind: 'main', minutes: 300, remaining: r5, reset: t5 && now + t5};
            const b = {id: 'seven_day', label: 'Semanal', kind: 'main', minutes: 10080, remaining: rw, reset: now + tw};
            return {windows: [a, b], primary: a, plan}; };
        const data = {c1: mk(62, 8300, 81, 300000, 'max'), o1: mk(12, 2900, 34, 430000, 'plus'), c2: mk(100, null, 27, 100000, 'team'), o2: null};
        const fixture = {getUsage: async account => { if (!data[account.id]) throw new Error('Login recusado. Entre novamente pelo CLI.'); return data[account.id]; }, destroy() {}};
        this._refresh.providers.openai.destroy(); this._refresh.providers.claude.destroy();
        this._refresh.providers = {openai: fixture, claude: fixture};
        this._refresh.start();
        const shoot = name => new Promise(resolve => {
            const f = Gio.File.new_for_path(`''' + str(out) + '''/${name}.png`);
            const stream = f.replace(null, false, Gio.FileCreateFlags.NONE, null);
            new (imports.gi.Shell.Screenshot)().screenshot(false, stream, () => { stream.close(null); resolve(); });
        });
        const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { r(); return GLib.SOURCE_REMOVE; }));
        (async () => {
            await wait(1500); await shoot('closed');
            this._notch.open(); await wait(900); await shoot('open');
            this._go('settings'); await wait(900); await shoot('settings');
            this._editor = this._accounts.list()[0]; this._go('editor'); await wait(900); await shoot('editor');
            this._go('details'); await wait(300);
            console.log('SHOT DONE');
        })().catch(e => console.error(`SHOT FAILED ${e.message}\\n${e.stack}`));'''))
    keyfile = root / 'config/glib-2.0/settings/keyfile'
    keyfile.parent.mkdir(parents=True)
    keyfile.write_text(f"""[org/gnome/shell]
enabled-extensions=['ai-usage@guepardosys']
disable-user-extensions=false

[org/gnome/desktop/interface]
color-scheme='{'prefer-dark' if theme == 'dark' else 'default'}'

[org/gnome/shell/extensions/aiusage]
theme='{theme}'
accounts='{acc_json}'
""")
    env = dict(os.environ, XDG_DATA_HOME=str(root / 'data'), XDG_CONFIG_HOME=str(root / 'config'), GSETTINGS_BACKEND='keyfile')
    r = subprocess.run(['timeout', '14s', 'dbus-run-session', '--', 'gnome-shell', '--headless', '--wayland', '--no-x11', '--virtual-monitor', monitor_size],
                       env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in r.stdout.splitlines():
        if 'SHOT' in line or 'JS ERROR' in line or 'CRITICAL' in line or 'rror:' in line: print(line)
