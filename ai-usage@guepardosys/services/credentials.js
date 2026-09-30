import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function expandPath(path) {
    const value = path.trim();
    if (value === '~') return GLib.get_home_dir();
    if (value.startsWith('~/')) return GLib.build_filenamev([GLib.get_home_dir(), value.slice(2)]);
    if (!GLib.path_is_absolute(value)) throw new Error('Use um diretório absoluto ou ~/perfil.');
    return GLib.canonicalize_filename(value, null);
}
export async function readJSON(path, cancellable) {
    const bytes = await new Promise((resolve, reject) => {
        Gio.File.new_for_path(path).load_contents_async(cancellable, (file, result) => {
            try { resolve(file.load_contents_finish(result)[1]); } catch { reject(new Error('Credenciais ausentes ou ilegíveis neste perfil.')); }
        });
    });
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new Error('Arquivo de credenciais inválido. Entre novamente pelo CLI.'); }
}
async function lookupCodex(path, cancellable) {
    let Secret;
    try { Secret = (await import('gi://Secret?version=1')).default; }
    catch { throw new Error('Para perfis no Keyring, instale a introspecção libsecret (gir1.2-secret-1).'); }
    const key = `cli|${GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, path, -1).slice(0, 16)}`;
    const schema = new Secret.Schema('org.freedesktop.Secret.Generic', Secret.SchemaFlags.DONT_MATCH_NAME,
        {service: Secret.SchemaAttributeType.STRING, username: Secret.SchemaAttributeType.STRING});
    const value = await new Promise((resolve, reject) => {
        Secret.password_lookup(schema, {service: 'Codex Auth', username: key}, cancellable, (_source, result) => {
            try { resolve(Secret.password_lookup_finish(result)); }
            catch { reject(new Error('Não foi possível ler o Codex no GNOME Keyring.')); }
        });
    });
    if (!value) throw new Error('Autenticação Codex não encontrada. Entre neste perfil pelo Codex CLI. Keyring gerenciado recente ainda não é suportado.');
    try { return JSON.parse(value); } catch { throw new Error('Credencial Codex inválida no Keyring.'); }
}
export async function codexCredentials(account, cancellable) {
    let path = expandPath(account.profilePath);
    // Resolve a profile-directory symlink before hashing the direct keyring key.
    const file = Gio.File.new_for_path(path);
    const info = await new Promise(resolve => file.query_info_async('standard::symlink-target', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
        GLib.PRIORITY_DEFAULT, cancellable, (f, result) => {
            try { resolve(f.query_info_finish(result)); } catch { resolve(null); }
        }));
    if (info?.has_attribute('standard::symlink-target') && info.get_symlink_target()) path = GLib.canonicalize_filename(info.get_symlink_target(), GLib.path_get_dirname(path));
    let auth;
    try { auth = await readJSON(`${path}/auth.json`, cancellable); }
    catch (error) {
        if (cancellable.is_cancelled()) throw error;
        if (Gio.File.new_for_path(`${path}/auth.json`).query_exists(null)) throw error;
        auth = await lookupCodex(path, cancellable);
    }
    const token = auth.tokens?.access_token;
    if (!token) throw new Error('Este perfil precisa de login de assinatura ChatGPT pelo Codex CLI.');
    return {token, accountId: auth.tokens.account_id};
}
export async function claudeCredentials(account, cancellable) {
    const auth = await readJSON(`${expandPath(account.profilePath)}/.credentials.json`, cancellable);
    const oauth = auth.claudeAiOauth;
    if (!oauth?.accessToken) throw new Error('Entre com uma assinatura Claude neste perfil pelo Claude Code.');
    if (oauth.expiresAt && oauth.expiresAt < Date.now()) throw new Error('Login Claude expirado. Abra o Claude Code neste perfil para renovar.');
    return {token: oauth.accessToken};
}
