// Leitura dos limites de assinatura. Tokens ficam só em memória e nunca são registrados.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const clamp = v => Math.max(0, Math.min(100, v));

function resetMs(value) {
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
  if (typeof value === 'string') { const t = Date.parse(value); return Number.isFinite(t) ? t : null; }
  return null;
}

function toWindow(label, raw, minutes) {
  if (!raw) return null;
  const used = raw.used_percent ?? raw.utilization ?? raw.percent;
  if (typeof used !== 'number') return null;
  const mins = raw.limit_window_seconds ? raw.limit_window_seconds / 60 : minutes;
  return { label, minutes: mins, remaining: clamp(100 - used), reset: resetMs(raw.reset_at ?? raw.resets_at) };
}

function normalizeClaude(raw) {
  const windows = [toWindow('5 horas', raw.five_hour, 300), toWindow('Semanal', raw.seven_day, 10080)].filter(Boolean);
  if (!windows.length) throw new Error('O Claude não informou limites de uso.');
  return { windows };
}

function normalizeOpenAI(raw) {
  const rate = raw.rate_limit ?? raw.rate_limits ?? {};
  const windows = [
    toWindow('5 horas', rate.primary_window ?? rate.primary, 300),
    toWindow('Semanal', rate.secondary_window ?? rate.secondary, 10080),
  ].filter(Boolean);
  for (const w of windows) {
    if (w.minutes === 10080) w.label = 'Semanal';
    else if (w.minutes !== 300) w.label = `${Math.round(w.minutes / 60)} horas`;
  }
  if (!windows.length) throw new Error('O Codex não informou limites de uso.');
  return { windows, plan: raw.plan_type ?? null };
}

async function readJSON(file, missing) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { throw new Error(e.code === 'ENOENT' ? missing : 'Não foi possível ler o login local.'); }
}

async function request(url, headers) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AIQuotaNotch/0.1', ...headers },
    redirect: 'manual', // nunca repassa o token para outro destino
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 401 || res.status === 403) throw new Error('Login recusado. Entre novamente pelo CLI.');
  if (res.status === 429) throw new Error('Muitas consultas. Tentaremos de novo em alguns minutos.');
  if (!res.ok) throw new Error(`O serviço respondeu com erro ${res.status}.`);
  return res.json();
}

async function claude(home = os.homedir()) {
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const auth = await readJSON(path.join(dir, '.credentials.json'), 'Entre no Claude Code para ver os limites.');
  const o = auth.claudeAiOauth;
  if (!o?.accessToken) throw new Error('Entre com uma assinatura Claude no Claude Code.');
  if (o.expiresAt && o.expiresAt < Date.now()) throw new Error('Login expirado. Abra o Claude Code para renovar.');
  const raw = await request('https://api.anthropic.com/api/oauth/usage',
    { Authorization: `Bearer ${o.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20' });
  return { ...normalizeClaude(raw), plan: o.subscriptionType ?? null };
}

async function codex(home = os.homedir()) {
  const dir = process.env.CODEX_HOME || path.join(home, '.codex');
  const auth = await readJSON(path.join(dir, 'auth.json'), 'Entre no Codex CLI (codex login) para ver os limites.');
  const t = auth.tokens;
  if (!t?.access_token) throw new Error('Entre com uma assinatura ChatGPT no Codex CLI.');
  const raw = await request('https://chatgpt.com/backend-api/wham/usage',
    { Authorization: `Bearer ${t.access_token}`, 'ChatGPT-Account-Id': t.account_id });
  return normalizeOpenAI(raw);
}

function demo(now = Date.now()) {
  return {
    claude: { ok: true, plan: 'max', windows: [
      { label: '5 horas', minutes: 300, remaining: 62, reset: now + 2.3 * 3600e3 },
      { label: 'Semanal', minutes: 10080, remaining: 81, reset: now + 3.5 * 86400e3 }] },
    codex: { ok: true, plan: 'plus', windows: [
      { label: '5 horas', minutes: 300, remaining: 12, reset: now + 47 * 60e3 },
      { label: 'Semanal', minutes: 10080, remaining: 34, reset: now + 5 * 86400e3 }] },
  };
}

async function fetchAll() {
  const wrap = p => p.then(d => ({ ok: true, ...d }), e => ({ ok: false, error: e.message }));
  const [c, x] = await Promise.all([wrap(claude()), wrap(codex())]);
  return { claude: c, codex: x };
}

module.exports = { normalizeClaude, normalizeOpenAI, resetMs, fetchAll, demo };
