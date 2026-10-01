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
export function resetDetail(timestamp, format) {
    if (!timestamp) return 'Reset não informado';
    const d = new Date(timestamp * 1000);
    const weekday = d.toLocaleDateString('pt-BR', {weekday: 'short'}).replace('.', '');
    const date = d.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
    return `${weekday} ${date} ${formatReset(timestamp, format)}`;
}
export function updatedLabel(timestamp) {
    if (!timestamp) return 'Ainda não atualizado';
    return `Atualizado às ${formatReset(timestamp, '24h')}`;
}
