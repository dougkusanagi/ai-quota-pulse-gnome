import test from 'node:test';
import assert from 'node:assert/strict';
import {initialsFor, cleanInitials} from '../ai-usage@guepardosys/utils/initials.js';
import {formatReset} from '../ai-usage@guepardosys/utils/time.js';
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
