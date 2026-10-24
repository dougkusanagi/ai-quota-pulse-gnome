const { test, expect } = require('bun:test');
const { normalizeClaude, normalizeOpenAI, resetMs } = require('../src/usage');

test('Claude: 5h e semanal com restante calculado', () => {
  const r = normalizeClaude({ five_hour: { utilization: 38, resets_at: '2026-10-24T18:00:00Z' }, seven_day: { utilization: 19 } });
  expect(r.windows.map(w => [w.label, w.remaining])).toEqual([['5 horas', 62], ['Semanal', 81]]);
  expect(r.windows[0].reset).toBe(Date.parse('2026-10-24T18:00:00Z'));
  expect(r.windows[1].reset).toBeNull();
});

test('Claude sem janelas gera erro legível', () => {
  expect(() => normalizeClaude({})).toThrow('O Claude não informou limites de uso.');
});

test('Codex: janelas primária e secundária, reset em segundos', () => {
  const r = normalizeOpenAI({ plan_type: 'plus', rate_limit: {
    primary_window: { used_percent: 88, limit_window_seconds: 18000, reset_at: 1793000000 },
    secondary_window: { used_percent: 120, limit_window_seconds: 604800 } } });
  expect(r.plan).toBe('plus');
  expect(r.windows.map(w => [w.label, w.remaining])).toEqual([['5 horas', 12], ['Semanal', 0]]);
  expect(r.windows[0].reset).toBe(1793000000 * 1000);
});

test('resetMs aceita ms, segundos e texto inválido', () => {
  expect(resetMs(1793000000000)).toBe(1793000000000);
  expect(resetMs('x')).toBeNull();
});
