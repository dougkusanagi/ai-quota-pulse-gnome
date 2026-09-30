export function resetSeconds(value) {
    if (typeof value === 'number') return value > 1e12 ? value / 1000 : value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed / 1000 : null;
    }
    return null;
}
function window(id, label, raw, minutes, kind) {
    if (!raw) return null;
    const used = raw.used_percent ?? raw.usedPercent ?? raw.utilization ?? raw.percent;
    const remaining = raw.percent_left ?? (typeof used === 'number' ? 100 - used : null);
    if (!Number.isFinite(remaining)) return null;
    const duration = raw.limit_window_seconds ? raw.limit_window_seconds / 60 :
        raw.window_minutes ?? raw.windowDurationMins ?? minutes;
    return {id, label, remaining: Math.max(0, Math.min(100, remaining)),
        reset: resetSeconds(raw.reset_at ?? raw.resets_at ?? raw.resetsAt), minutes: duration, kind};
}
export function primaryWindow(windows) {
    return windows.find(w => w.kind !== 'scoped' && w.minutes >= 240 && w.minutes <= 360) ??
        windows.find(w => w.kind !== 'scoped' && w.minutes === 10080) ??
        windows.find(w => w.kind !== 'scoped') ?? windows[0] ?? null;
}
export function normalizeOpenAI(raw) {
    const windows = [];
    const add = (rate, prefix = '', scoped = false) => {
        if (!rate) return;
        for (const [key, fallback] of [['primary_window', 300], ['secondary_window', 10080]]) {
            const item = rate[key] ?? rate[key === 'primary_window' ? 'primary' : 'secondary'];
            const w = window(`${prefix}${key}`, '', item, fallback, scoped ? 'scoped' : 'main');
            if (w) {
                w.label = `${prefix}${w.minutes === 300 ? '5 horas' : w.minutes === 10080 ? 'Semanal' : `${w.minutes / 60} horas`}`;
                windows.push(w);
            }
        }
    };
    add(raw.rate_limit ?? raw.rate_limits);
    for (const rate of raw.additional_rate_limits ?? []) add(rate.rate_limit, `${rate.limit_name ?? rate.limit_id ?? 'Adicional'} · `, true);
    if (!windows.length) throw new Error('O provider não retornou limites de assinatura compatíveis.');
    return {windows, primary: primaryWindow(windows), plan: raw.plan_type ?? null};
}
export function normalizeClaude(raw) {
    // Only the session (5h) and weekly windows are real limits. Other top-level
    // keys (per-model or codenamed buckets) are internal and are not shown.
    const windows = [];
    for (const [key, label, minutes] of [['five_hour', '5 horas', 300], ['seven_day', 'Semanal', 10080]]) {
        const w = window(key, label, raw[key], minutes, 'main');
        if (w) windows.push(w);
    }
    for (const [index, item] of (raw.limits ?? []).entries()) {
        if (item.is_active === false || item.scope?.model) continue;
        const isWeekly = item.group === 'weekly' || item.kind?.startsWith('weekly');
        const isSession = item.kind === 'five_hour';
        if (!isWeekly && !isSession) continue;
        const minutes = isWeekly ? 10080 : 300;
        const w = window(`limit-${index}`, isWeekly ? 'Semanal' : '5 horas', item, minutes, 'main');
        if (w && !windows.some(old => old.minutes === w.minutes)) windows.push(w);
    }
    windows.sort((a, b) => a.minutes - b.minutes);
    if (!windows.length) throw new Error('O Claude não retornou janelas de uso compatíveis.');
    const extra = raw.extra_usage;
    return {windows, primary: primaryWindow(windows), extra: extra?.is_enabled ? {
        used: extra.used_credits, limit: extra.monthly_limit, utilization: extra.utilization,
    } : null};
}
