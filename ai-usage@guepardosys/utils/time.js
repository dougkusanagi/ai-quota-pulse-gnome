export function formatReset(timestamp, format = '24h', now = Date.now()) {
    if (!timestamp || !Number.isFinite(timestamp)) return '--';
    if (format === 'relative') {
        const mins = Math.max(0, Math.ceil((timestamp * 1000 - now) / 60000));
        if (mins >= 1440) return `${Math.floor(mins / 1440)}d ${Math.floor(mins % 1440 / 60)}h`;
        return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`;
    }
    const d = new Date(timestamp * 1000);
    const hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return format === '12h' ? `${hours % 12 || 12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}` :
        `${String(hours).padStart(2, '0')}:${minutes}`;
}
export function relativeReset(timestamp, now = Date.now()) {
    const mins = Math.max(0, Math.ceil((timestamp * 1000 - now) / 60000));
    if (mins >= 1440) return `${Math.floor(mins / 1440)}d ${Math.floor(mins % 1440 / 60)}h`;
    if (mins >= 60) return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`;
    return `${mins} min`;
}
function dayWord(date, now) {
    const start = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((start(date) - start(new Date(now))) / 86400000);
    if (days === 0) return 'hoje';
    if (days === 1) return 'amanhã';
    return `${date.toLocaleDateString('pt-BR', {weekday: 'short'}).replace('.', '')} ${date.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})}`;
}
export function resetDetail(timestamp, format = '24h', now = Date.now()) {
    if (!timestamp || !Number.isFinite(timestamp)) return 'Reset não informado';
    if (timestamp * 1000 <= now) return 'Reiniciando agora';
    if (format === 'relative') return `Reseta em ${relativeReset(timestamp, now)}`;
    return `Reseta em ${relativeReset(timestamp, now)} · ${dayWord(new Date(timestamp * 1000), now)} - ${formatReset(timestamp, format)}`;
}
// One-line form for the limit heading: "hoje 21:28", "dom 04/10 22:26" or, in relative mode, "em 3h12".
export function resetShort(timestamp, format = '24h', now = Date.now()) {
    if (!timestamp || !Number.isFinite(timestamp)) return 'reset não informado';
    if (timestamp * 1000 <= now) return 'reiniciando';
    if (format === 'relative') return `em ${relativeReset(timestamp, now)}`;
    return `${dayWord(new Date(timestamp * 1000), now)} - ${formatReset(timestamp, format)}`;
}
export function updatedLabel(timestamp, now = Date.now()) {
    if (!timestamp) return 'Ainda não atualizado';
    const mins = Math.floor((now - timestamp * 1000) / 60000);
    if (mins < 1) return 'Atualizado agora';
    if (mins < 60) return `Atualizado há ${mins} min`;
    if (mins < 1440) return `Atualizado há ${Math.floor(mins / 60)} h`;
    return `Atualizado em ${new Date(timestamp * 1000).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})}`;
}
