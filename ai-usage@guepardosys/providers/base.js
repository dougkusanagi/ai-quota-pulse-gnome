import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';
export class UsageError extends Error {
    constructor(message, retryAfter = 0, rateLimited = false) {
        super(message); this.retryAfter = retryAfter; this.rateLimited = rateLimited;
    }
}
export class UsageProvider {
    constructor() { this.session = new Soup.Session({timeout: 30, user_agent: 'AIUsage-GNOME/1.0'}); }
    async request(url, headers, cancellable) {
        const message = Soup.Message.new('GET', url);
        // Never forward authentication to a redirect destination.
        message.set_flags(Soup.MessageFlags.NO_REDIRECT);
        for (const [name, value] of Object.entries(headers)) {
            if (value) message.request_headers.append(name, value);
        }
        let bytes;
        try {
            bytes = await new Promise((resolve, reject) => this.session.send_and_read_async(message,
                GLib.PRIORITY_DEFAULT, cancellable, (session, result) => {
                    try { resolve(session.send_and_read_finish(result)); } catch { reject(new UsageError('Falha de rede. Verifique a conexão e atualize novamente.')); }
                }));
        } finally {
            message.request_headers.remove('Authorization');
        }
        const status = message.status_code;
        if (status === 401) throw new UsageError('Login expirado. Renove a autenticação pelo CLI deste perfil.');
        if (status === 403) throw new UsageError('Acesso recusado: confira a assinatura e permissões do login CLI.');
        if (status === 429) {
            const header = message.response_headers.get_one('Retry-After');
            const seconds = /^\d+$/.test(header ?? '') ? Number(header) : (Date.parse(header) - Date.now()) / 1000;
            const retryAfter = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 0;
            throw new UsageError('O provedor limitou as consultas.', retryAfter, true);
        }
        if (status !== 200) throw new UsageError(`Consulta indisponível (HTTP ${status}). Tente novamente mais tarde.`);
        try { return JSON.parse(new TextDecoder().decode(bytes.get_data())); }
        catch { throw new UsageError('Resposta de uso inválida. O provider pode ter alterado sua API.'); }
    }
    async getUsage(_account, _cancellable) { throw new Error('Provider não implementado.'); }
    destroy() { this.session.abort(); }
}
