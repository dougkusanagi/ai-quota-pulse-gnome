const { app, BrowserWindow, ipcMain, screen, Menu, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { fetchAll, demo } = require('./usage');

const demoArg = process.argv.find(a => a.startsWith('--demo'));
const DEMO = demoArg ? Number(demoArg.split('=')[1] ?? 1) : 0;
// Área máxima (painel aberto). O resto é transparente e deixa o mouse passar.
const W = 460, H = 640;
const REFRESH_MS = 5 * 60e3;
const THEMES = ['light', 'dark', 'system'];
let win, timer, last = null;

const prefsFile = () => path.join(app.getPath('userData'), 'prefs.json');
function loadPrefs() {
  try { return { theme: 'system', ...JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) }; }
  catch { return { theme: 'system' }; }
}
function savePrefs(p) {
  fs.mkdirSync(path.dirname(prefsFile()), { recursive: true });
  fs.writeFileSync(prefsFile(), JSON.stringify(p));
}

function place() {
  const { bounds } = screen.getPrimaryDisplay();
  win.setBounds({ x: Math.round(bounds.x + (bounds.width - W) / 2), y: bounds.y, width: W, height: H });
}

async function refresh() {
  if (!win) return;
  win.webContents.send('loading', true);
  try { last = { at: Date.now(), accounts: DEMO ? demo(DEMO) : await fetchAll() }; }
  finally {
    win.webContents.send('usage', last);
    win.webContents.send('loading', false);
  }
}

if (!app.requestSingleInstanceLock()) app.quit();

app.whenReady().then(() => {
  nativeTheme.themeSource = loadPrefs().theme;
  win = new BrowserWindow({
    width: W, height: H, frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  place();
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => { win.showInactive(); refresh(); });
  for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(ev, place);
  timer = setInterval(refresh, REFRESH_MS);

  ipcMain.on('interactive', (_e, on) => win.setIgnoreMouseEvents(!on, { forward: true }));
  ipcMain.on('refresh', refresh);
  ipcMain.handle('prefs', () => loadPrefs());
  ipcMain.on('theme', (_e, theme) => {
    if (!THEMES.includes(theme)) return;
    nativeTheme.themeSource = theme;
    savePrefs({ ...loadPrefs(), theme });
  });
  ipcMain.on('menu', () => Menu.buildFromTemplate([
    { label: 'Atualizar agora', click: refresh },
    { label: 'Iniciar com o Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: item => app.setLoginItemSettings({ openAtLogin: item.checked }) },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]).popup({ window: win }));
});

app.on('before-quit', () => clearInterval(timer));
