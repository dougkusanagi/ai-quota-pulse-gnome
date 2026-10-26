import test from 'node:test';
import assert from 'node:assert/strict';
import {initialsFor, cleanInitials} from '../ai-usage@guepardosys/utils/initials.js';
import {formatReset, resetCompact, resetDetail, resetShort, updatedLabel} from '../ai-usage@guepardosys/utils/time.js';
import {normalizeOpenAI, normalizeClaude, primaryWindow} from '../ai-usage@guepardosys/providers/normalize.js';
test('automatic initials preserve Unicode, first/last words and manual limit', () => {
    for (const [name, expected] of [['Bruno Almeida','BA'],['Loja Online','LO'],['Trabalho','TR'],['João Pedro Silva','JS'],['  Érica   Dias ','ÉD'],['','']]) assert.equal(initialsFor(name), expected);
    assert.equal(cleanInitials('abcd'), 'ABC');
});
test('reset formats use local time, noon/midnight and relative rollover', () => {
    const date = new Date(2026, 8, 30, 14, 32);
    assert.equal(formatReset(date.getTime()/1000), '14:32');
    assert.equal(formatReset(date.getTime()/1000, '12h'), '2:32 PM');
    assert.equal(formatReset(date.getTime()/1000, 'relative', date.getTime()-134*60000), '2h14');
    assert.equal(formatReset(new Date(2026,8,30,0,2).getTime()/1000,'12h'), '12:02 AM');
    assert.equal(formatReset(null), '--');
});
test('Codex selects 5h, retains additional quotas and clamps percentages', () => {
    const result = normalizeOpenAI({rate_limit:{primary_window:{used_percent:28,limit_window_seconds:18000,reset_at:1900000000},secondary_window:{used_percent:52,limit_window_seconds:604800}},additional_rate_limits:[{limit_name:'Spark',rate_limit:{primary_window:{used_percent:0,limit_window_seconds:18000}}}]});
    assert.equal(result.primary.remaining,72); assert.equal(result.windows.length,3);
    const weekly = normalizeOpenAI({rate_limit:{primary_window:{used_percent:120,limit_window_seconds:604800}}});
    assert.equal(weekly.primary.label,'Semanal'); assert.equal(weekly.primary.remaining,0);
    assert.throws(()=>normalizeOpenAI({rate_limit:{primary_window:{used_percent:'bad'}}}));
});
test('Claude shows only 5h/weekly, weekly fallback, extra usage and ISO reset', () => {
    const result = normalizeClaude({five_hour:null,seven_day:{utilization:12,resets_at:'2026-10-01T12:00:00Z'},seven_day_sonnet:{utilization:52},seven_day_iguana_necktie:{utilization:3},nimbus_quill:{utilization:9},extra_usage:{is_enabled:true,used_credits:50,monthly_limit:200}});
    assert.equal(result.primary.remaining,88); assert.equal(result.primary.id,'seven_day');
    assert.equal(result.windows.length,1); assert.equal(result.extra.limit,200);
    assert.equal(result.primary.reset, Date.parse('2026-10-01T12:00:00Z')/1000);
    assert.equal(primaryWindow([{kind:'scoped',minutes:300},{kind:'main',minutes:10080}]).minutes,10080);
    assert.throws(()=>normalizeClaude({}));
});

test('new Claude limits array: active session and weekly, scoped models ignored', () => {
    const result = normalizeClaude({limits:[{kind:'five_hour',percent:14,is_active:true,resets_at:'2026-10-01T12:00:00Z'},{kind:'weekly_scoped',group:'weekly',percent:7,scope:{model:{display_name:'Sonnet'}}},{kind:'weekly',group:'weekly',percent:40}]});
    assert.equal(result.windows.length,2);
    assert.equal(result.primary.remaining,86);
    assert.equal(result.windows[1].label,'Semanal'); assert.equal(result.windows[1].remaining,60);
});

test('reset detail combines a countdown with a day-aware clock time', () => {
    const now = new Date(2026, 8, 30, 12, 0).getTime();
    const at = (d, h, m) => new Date(2026, 8, d, h, m).getTime() / 1000;
    assert.equal(resetDetail(at(30, 15, 12), '24h', now), 'Reseta em 3h12 · hoje - 15:12');
    assert.equal(resetDetail(at(30, 12, 42), '24h', now), 'Reseta em 42 min · hoje - 12:42');
    assert.equal(resetDetail(new Date(2026, 9, 1, 9, 0).getTime() / 1000, '12h', now), 'Reseta em 21h00 · amanhã - 9:00 AM');
    assert.equal(resetDetail(new Date(2026, 9, 3, 9, 0).getTime() / 1000, 'relative', now), 'Reseta em 2d 21h');
    assert.equal(resetDetail(at(30, 11, 0), '24h', now), 'Reiniciando agora');
    assert.equal(resetDetail(null, '24h', now), 'Reset não informado');
});
test('updated label is relative and degrades to a date', () => {
    const now = new Date(2026, 8, 30, 12, 0).getTime();
    assert.equal(updatedLabel(null, now), 'Ainda não atualizado');
    assert.equal(updatedLabel(now / 1000 - 20, now), 'Atualizado agora');
    assert.equal(updatedLabel(now / 1000 - 5 * 60, now), 'Atualizado há 5 min');
    assert.equal(updatedLabel(now / 1000 - 3 * 3600, now), 'Atualizado há 3 h');
    assert.equal(updatedLabel(now / 1000 - 3 * 86400, now), 'Atualizado em 27/09');
});
test('short reset fits a heading', () => {
    const now = new Date(2026, 8, 30, 12, 0).getTime();
    assert.equal(resetShort(new Date(2026, 8, 30, 15, 12).getTime() / 1000, '24h', now), 'hoje - 15:12');
    assert.equal(resetShort(new Date(2026, 8, 30, 15, 12).getTime() / 1000, 'relative', now), 'em 3h12');
});

test('compact reset fits the notch column', () => {
    const now = new Date(2026, 8, 30, 12, 0).getTime(), at = (d, h, m) => new Date(2026, 8, d, h, m).getTime() / 1000;
    assert.equal(resetCompact(at(30, 15, 12), '24h', now), '15:12');
    assert.equal(resetCompact(at(30, 15, 12), 'relative', now), 'em 3h12');
    assert.match(resetCompact(at(2 + 28, 9, 5) + 86400 * 3, '24h', now), /^\S+ \d\d:\d\d$/);
    assert.equal(resetCompact(at(30, 11, 0), '24h', now), 'agora');
    assert.equal(resetCompact(null), '—');
});

test('session reset stays hidden until usage starts and disappears when elapsed', async () => {
    const {waitingForMessage, visibleReset, shouldSendResetMessage} = await import('../ai-usage@guepardosys/utils/session.js');
    const now = 2000000000;
    const window = {minutes: 300, kind: 'main', remaining: 100, reset: now + 18000};
    assert.equal(waitingForMessage(window, now), true);
    assert.equal(visibleReset(window, now), null);
    window.remaining = 99;
    assert.equal(visibleReset(window, now), now + 18000);
    window.reset = now - 1;
    assert.equal(visibleReset(window, now), null);
    const usage = {windows: [window]};
    assert.equal(shouldSendResetMessage(usage, 0, now), true);
    assert.equal(shouldSendResetMessage(usage, now - 60, now), false);
    assert.equal(shouldSendResetMessage(usage, now - 18000, now), true);
    window.reset = now + 300;
    assert.equal(shouldSendResetMessage(usage, 0, now), false);
    assert.equal(waitingForMessage({...window, minutes: 10080, remaining: 100}, now), false);
    assert.equal(shouldSendResetMessage({windows: [{...window, reset: null}]}, 0, now), false);
    assert.equal(shouldSendResetMessage({windows: [{...window, kind: 'scoped'}]}, 0, now), false);
});

test('login helper follows the provider and safely quotes profile directories', async () => {
    const {loginCommand} = await import('../ai-usage@guepardosys/utils/login.js');
    assert.equal(loginCommand('openai', '~/.codex-work'), `CODEX_HOME="$HOME"/'.codex-work' codex login`);
    assert.equal(loginCommand('claude', '/tmp/work profile'), "CLAUDE_CONFIG_DIR='/tmp/work profile' claude");
    assert.equal(loginCommand('openai', '  '), '');
    assert.equal(loginCommand('openai', '~'), 'CODEX_HOME="$HOME" codex login');
    assert.equal(loginCommand('openai', "/tmp/$(touch nope)`id`"), "CODEX_HOME='/tmp/$(touch nope)`id`' codex login");
    assert.ok(loginCommand('openai', "/tmp/it's").includes("'\\''"));
});
