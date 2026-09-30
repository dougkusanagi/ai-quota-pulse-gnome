export function initialsFor(name) {
    const words = name.trim().split(/\s+/u).filter(Boolean);
    if (!words.length) return '';
    const chars = words.length === 1 ? Array.from(words[0]).slice(0, 2) :
        [Array.from(words[0])[0], Array.from(words.at(-1))[0]];
    return chars.join('').toLocaleUpperCase('pt-BR');
}
export function cleanInitials(value) {
    return Array.from(value.trim().toLocaleUpperCase('pt-BR')).slice(0, 3).join('');
}
