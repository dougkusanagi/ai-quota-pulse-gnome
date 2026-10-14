import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {expandPath} from './credentials.js';

export function messageCommand(provider, prompt) {
    if (provider === 'openai') return ['codex', 'exec', '--ephemeral', '--skip-git-repo-check',
        '--ignore-user-config', '--sandbox', 'read-only', '-c', 'approval_policy="never"',
        '-c', 'model_reasoning_effort="low"', '--', prompt];
    return ['claude', '--print', '--no-session-persistence', '--tools', '', '--strict-mcp-config',
        '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--disable-slash-commands',
        '--permission-mode', 'dontAsk', '--system-prompt', 'Responda brevemente. Não use ferramentas.', '--', prompt];
}
export async function sendResetMessage(account, cancellable) {
    const args = messageCommand(account.provider, account.resetPrompt);
    const executable = GLib.find_program_in_path(args[0]);
    if (!executable) throw new Error(`Instale o CLI ${args[0]} e disponibilize-o no PATH da sessão GNOME.`);
    args[0] = executable;
    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE});
    // An empty temporary directory avoids loading project instructions or sending project context.
    const directory = GLib.dir_make_tmp('aiusage-message-XXXXXX');
    let process = null, timeout = 0, signal = 0;
    try {
        launcher.set_cwd(directory);
        // Do not let an inherited API key select a billed API account instead of the subscription.
        for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR', 'OPENAI_BASE_URL', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDECODE']) launcher.unsetenv(key);
        launcher.setenv(account.provider === 'openai' ? 'CODEX_HOME' : 'CLAUDE_CONFIG_DIR', expandPath(account.profilePath), true);
        process = launcher.spawnv(args);
        signal = cancellable.connect(() => process.force_exit());
        if (cancellable.is_cancelled()) process.force_exit();
        timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 120, () => {
            timeout = 0; process.force_exit(); return GLib.SOURCE_REMOVE;
        });
        await new Promise((resolve, reject) => process.wait_async(null, (source, result) => {
            try { source.wait_finish(result); resolve(); } catch { reject(new Error('Não foi possível concluir a mensagem automática.')); }
        }));
        if (!process.get_successful()) throw new Error('A mensagem automática falhou ou excedeu 2 minutos. Confira o login e o modelo padrão no CLI.');
    } catch (error) {
        if (!process && executable) throw new Error('Não foi possível iniciar o CLI para enviar a mensagem automática.');
        throw error;
    } finally {
        if (timeout) GLib.Source.remove(timeout);
        if (signal) cancellable.disconnect(signal);
        // CLI may create local metadata; remove only our own temporary directory.
        const file = Gio.File.new_for_path(directory);
        try { file.delete(null); } catch { /* a CLI-created file may keep this directory nonempty */ }
    }
}
