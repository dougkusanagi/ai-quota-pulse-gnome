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
    const windows = [];
    for (const [key, value] of Object.entries(raw)) {
        if (!value || typeof value !== 'object' || Array.isArray(value) || key === 'extra_usage') continue;
        const main = key === 'five_hour' || key === 'seven_day';
        const minutes = key === 'five_hour' ? 300 : key.startsWith('seven_day') ? 10080 : null;
        const label = key === 'five_hour' ? '5 horas' : key === 'seven_day' ? 'Semanal' : key.replaceAll('_', ' ');
        const w = window(key, label, value, minutes, main ? 'main' : 'scoped');
        if (w) windows.push(w);
    }
    for (const [index, item] of (raw.limits ?? []).entries()) {
        if (item.is_active === false) continue;
        const isWeekly = item.group === 'weekly' || item.kind?.startsWith('weekly');
        const scoped = Boolean(item.scope?.model);
        const w = window(`limit-${index}`, item.scope?.model?.display_name ?? item.kind ?? 'Limite', item,
            isWeekly ? 10080 : item.kind === 'five_hour' ? 300 : null, scoped ? 'scoped' : 'main');
        if (w && !windows.some(old => old.minutes === w.minutes && old.kind === 'main' && w.kind === 'main')) windows.push(w);
    }
    if (!windows.length) throw new Error('O Claude não retornou janelas de uso compatíveis.');
    const extra = raw.extra_usage;
    return {windows, primary: primaryWindow(windows), extra: extra?.is_enabled ? {
        used: extra.used_credits, limit: extra.monthly_limit, utilization: extra.utilization,
    } : null};
}
