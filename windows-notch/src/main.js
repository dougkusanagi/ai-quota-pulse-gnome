const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage, nativeTheme, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { fetchAll, demo, backoffMs } = require('./usage');

const demoArg = process.argv.find(a => a.startsWith('--demo'));
const DEMO = demoArg ? Number(demoArg.split('=')[1] ?? 1) : 0;
// Área máxima (painel aberto). O resto é transparente e deixa o mouse passar.
const W = 460, H = 640;
const REFRESH_MS = 5 * 60e3;
const THEMES = ['light', 'dark', 'system'];
let win, tray, timer, last = null, failures = 0, backoffUntil = 0;

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
  // Depois de um 429, nem a atualização manual consulta antes do prazo.
  if (!DEMO && last && Date.now() < backoffUntil) { win.webContents.send('usage', last); return; }
  win.webContents.send('loading', true);
  try {
    const accounts = DEMO ? demo(DEMO) : await fetchAll(undefined, last?.accounts);
    const limited = accounts.filter(a => a.retryAfterMs !== undefined);
    failures = limited.length ? failures + 1 : 0;
    backoffUntil = limited.length ? Date.now() + backoffMs(failures, Math.max(...limited.map(a => a.retryAfterMs))) : 0;
    last = { at: Date.now(), accounts, retryAt: backoffUntil || null };
  } catch (e) {
    console.error('Falha ao atualizar:', e.message);
  } finally {
    if (last) win.webContents.send('usage', last);
    win.webContents.send('loading', false);
  }
}

const menuTemplate = () => [
  { label: 'Atualizar agora', click: refresh },
  { label: 'Iniciar com o Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
    click: item => app.setLoginItemSettings({ openAtLogin: item.checked }) },
  { type: 'separator' },
  { label: 'Sair', click: () => app.quit() },
];

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', refresh);
  app.whenReady().then(start);
}

function start() {
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
  // Depois de suspender ou desbloquear, a rede pode demorar um pouco a voltar.
  for (const ev of ['resume', 'unlock-screen']) powerMonitor.on(ev, () => setTimeout(refresh, 5000));

  // A bandeja é o plano B caso o notch fique escondido atrás de algo.
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('AI Quota Notch');
  tray.on('click', () => { win.showInactive(); refresh(); });
  tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate(menuTemplate())));

  ipcMain.on('interactive', (_e, on) => win.setIgnoreMouseEvents(!on, { forward: true }));
  ipcMain.on('refresh', refresh);
  ipcMain.handle('prefs', () => loadPrefs());
  ipcMain.on('theme', (_e, theme) => {
    if (!THEMES.includes(theme)) return;
    nativeTheme.themeSource = theme;
    savePrefs({ ...loadPrefs(), theme });
  });
  ipcMain.on('menu', () => Menu.buildFromTemplate(menuTemplate()).popup({ window: win }));
}

app.on('before-quit', () => clearInterval(timer));
