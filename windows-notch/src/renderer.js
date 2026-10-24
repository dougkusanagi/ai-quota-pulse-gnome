const $ = (s, el = document) => el.querySelector(s);
const api = window.notch;
const notchEl = $('#notch');
const CIRC = 50.27;
let data = null, closeTimer = null;

const color = r => r > 40 ? 'var(--ok)' : r > 15 ? 'var(--warn)' : 'var(--bad)';

function fmtReset(ms) {
  if (!ms) return 'aguardando mensagem para iniciar';
  const diff = ms - Date.now();
  if (diff <= 0) return 'disponível agora';
  const m = Math.round(diff / 60e3);
  const rel = m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}` : `${Math.round(m / 1440)} dias`;
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  const when = d.toLocaleString('pt-BR', sameDay ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return `renova em ${rel} · ${when}`;
}

function render() {
  if (!data) return;
  for (const p of ['claude', 'codex']) {
    const info = data[p];
    const chip = $(`.chip[data-p="${p}"]`);
    const sec = $(`.prov[data-p="${p}"]`);
    const rows = $('.rows', sec);
    $('.plan', sec).textContent = info.ok ? info.plan ?? '' : '';
    chip.classList.toggle('err', !info.ok);
    const main = info.ok ? info.windows.find(w => w.minutes === 300) ?? info.windows[0] : null;
    const val = $('.val', chip);
    if (main) {
      const r = Math.round(main.remaining);
      $('b', chip).textContent = `${r}%`;
      val.style.strokeDashoffset = CIRC * (1 - r / 100);
      val.style.stroke = color(r);
    } else {
      $('b', chip).textContent = '--';
      val.style.strokeDashoffset = CIRC;
    }
    chip.title = info.ok ? `${p === 'claude' ? 'Claude' : 'Codex'}: ${main ? Math.round(main.remaining) : '--'}% restante` : info.error;
    rows.replaceChildren();
    if (!info.ok) {
      const e = document.createElement('p');
      e.className = 'error'; e.textContent = info.error;
      rows.append(e);
      continue;
    }
    for (const w of info.windows) {
      const row = document.createElement('div');
      row.className = 'row';
      const r = Math.round(w.remaining);
      row.innerHTML = '<span class="lbl"></span><div class="bar"><i></i></div><span class="pct"></span><span class="reset"></span>';
      $('.lbl', row).textContent = w.label;
      $('.pct', row).textContent = `${r}%`;
      $('.reset', row).textContent = fmtReset(w.reset);
      const fill = $('.bar i', row);
      fill.style.width = `${r}%`; fill.style.background = color(r);
      rows.append(row);
    }
  }
  const t = new Date(data.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  $('#updated').textContent = `Atualizado às ${t} · restante`;
}

function open() {
  clearTimeout(closeTimer);
  api.interactive(true);
  notchEl.classList.add('open');
}
function close() {
  closeTimer = setTimeout(() => {
    notchEl.classList.remove('open');
    api.interactive(false);
  }, 220);
}
notchEl.addEventListener('mouseenter', open);
notchEl.addEventListener('mouseleave', close);

api.onUsage(d => { data = d; render(); });
api.onLoading(on => {
  $('#pulse').classList.toggle('busy', on);
  $('#refresh').classList.toggle('spin', on);
});
$('#refresh').addEventListener('click', () => api.refresh());
$('#more').addEventListener('click', () => api.menu());

function setThemeUI(t) {
  for (const b of document.querySelectorAll('.theme button')) b.setAttribute('aria-checked', String(b.dataset.t === t));
}
for (const b of document.querySelectorAll('.theme button')) {
  b.addEventListener('click', () => { setThemeUI(b.dataset.t); api.setTheme(b.dataset.t); });
}
api.prefs().then(p => setThemeUI(p.theme));

setInterval(render, 30e3); // mantém o "renova em" atual
