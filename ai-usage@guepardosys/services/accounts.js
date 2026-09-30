import GLib from 'gi://GLib';
import {initialsFor, cleanInitials} from '../utils/initials.js';
import {expandPath} from './credentials.js';
export function validateAccount(value) {
    if (!['openai', 'claude'].includes(value.provider)) throw new Error('Provider inválido.');
    const name = String(value.name ?? '').trim().slice(0, 80);
    if (!name) throw new Error('Informe o nome da conta.');
    const profilePath = String(value.profilePath ?? '').trim();
    expandPath(profilePath);
    if (!/^#[0-9a-f]{6}$/i.test(value.color)) throw new Error('Use uma cor hexadecimal, por exemplo #0A84FF.');
    const initials = cleanInitials(value.initials || initialsFor(name));
    if (!initials || !/^[\p{L}\p{N}]{1,3}$/u.test(initials)) throw new Error('Use de 1 a 3 letras ou números nas iniciais.');
    return {id: value.id || GLib.uuid_string_random(), provider: value.provider, name, profilePath,
        initials, color: value.color, visible: value.visible !== false};
}
export class Accounts {
    constructor(settings) { this.settings = settings; }
    list() {
        try {
            const raw = JSON.parse(this.settings.get_string('accounts'));
            if (!Array.isArray(raw)) return [];
            const seen = new Set();
            return raw.flatMap(value => {
                try {
                    const a = validateAccount(value);
                    if (seen.has(a.id)) return [];
                    seen.add(a.id); return [a];
                } catch { return []; }
            });
        } catch { return []; }
    }
    save(list) { this.settings.set_string('accounts', JSON.stringify(list.map(validateAccount))); }
    put(value) {
        const account = validateAccount(value);
        const list = this.list();
        const index = list.findIndex(a => a.id === account.id);
        if (index < 0) list.push(account); else list[index] = account;
        this.save(list);
    }
    remove(id) { this.save(this.list().filter(a => a.id !== id)); }
    move(id, offset) {
        const list = this.list();
        const from = list.findIndex(a => a.id === id), to = from + offset;
        if (from < 0 || to < 0 || to >= list.length) return;
        [list[from], list[to]] = [list[to], list[from]];
        this.save(list);
    }
}
