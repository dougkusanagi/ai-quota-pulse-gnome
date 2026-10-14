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
// GNOME does not inherit PATH changes made by interactive shell startup files.
export function cliSearchPath(path = GLib.getenv('PATH') ?? '', home = GLib.get_home_dir()) {
    return [...new Set([...path.split(GLib.SEARCHPATH_SEPARATOR_S).filter(Boolean),
        ...['.local/bin', '.bun/bin', '.npm-global/bin', '.volta/bin', '.local/share/pnpm']
            .map(directory => GLib.build_filenamev([home, directory]))])];
}
export function findCli(name, directories = cliSearchPath()) {
    return directories.map(directory => GLib.build_filenamev([directory, name]))
        .find(path => GLib.file_test(path, GLib.FileTest.IS_EXECUTABLE) &&
            GLib.file_test(path, GLib.FileTest.IS_REGULAR)) ?? null;
}
// Drain both pipes, retaining only a small diagnostic in memory. Never expose CLI output.
async function readDiagnostic(stream, cancellable) {
    let diagnostic = '';
    for (;;) {
        const bytes = await new Promise((resolve, reject) => stream.read_bytes_async(4096,
            GLib.PRIORITY_DEFAULT, cancellable, (source, result) => {
                try { resolve(source.read_bytes_finish(result)); } catch (error) { reject(error); }
            }));
        if (!bytes.get_size()) return diagnostic;
        if (diagnostic.length < 16384) diagnostic += new TextDecoder().decode(bytes.get_data()).slice(0, 16384 - diagnostic.length);
    }
}
export function cliFailure(provider, diagnostic, status) {
    const cli = provider === 'openai' ? 'Codex' : 'Claude';
    if (/not logged in|authentication|unauthorized|invalid.{0,20}token|login required|please.{0,20}log in|please.{0,20}login|oauth.{0,30}expired/i.test(diagnostic))
        return `Login ${cli} inválido ou expirado. Entre novamente pelo CLI no perfil cadastrado.`;
    if (/model.{0,80}(not found|not available|not supported|does not exist|invalid)|invalid.{0,30}model/i.test(diagnostic))
        return `Modelo indisponível no ${cli}. Confira o modelo e o acesso da assinatura no CLI.`;
    if (/unknown option|unexpected argument|unrecognized option/i.test(diagnostic))
        return `CLI ${cli} incompatível com as opções de envio. Atualize o CLI.`;
    if (/usage limit|rate.limit|hit your limit|quota|limit reached/i.test(diagnostic))
        return `Limite de uso atingido no ${cli}. Aguarde a liberação da assinatura.`;
    if (/node.{0,30}(not found|no such file)/i.test(diagnostic))
        return `Node.js não encontrado para iniciar o ${cli}. Disponibilize-o no PATH da sessão GNOME.`;
    return `O CLI ${cli} encerrou com código ${status}. Confira o login e o modelo no perfil cadastrado.`;
}
export async function sendResetMessage(account, cancellable) {
    const args = messageCommand(account.provider, account.resetPrompt);
    const directories = cliSearchPath();
    const executable = findCli(args[0], directories);
    if (!executable) throw new Error(`CLI ${args[0]} não encontrado. Instale-o no PATH, ~/.local/bin ou ~/.bun/bin.`);
    args[0] = executable;
    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE});
    // An empty temporary directory avoids loading project instructions or sending project context.
    const directory = GLib.dir_make_tmp('aiusage-message-XXXXXX');
    let process = null, timeout = 0, signal = 0, timedOut = false;
    const ioCancellable = new Gio.Cancellable();
    try {
        cancellable.set_error_if_cancelled();
        launcher.set_cwd(directory);
        launcher.setenv('PATH', directories.join(GLib.SEARCHPATH_SEPARATOR_S), true);
        // Do not let an inherited API key select a billed API account instead of the subscription.
        for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR', 'OPENAI_BASE_URL', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDECODE']) launcher.unsetenv(key);
        launcher.setenv(account.provider === 'openai' ? 'CODEX_HOME' : 'CLAUDE_CONFIG_DIR', expandPath(account.profilePath), true);
        process = launcher.spawnv(args);
        signal = cancellable.connect(() => { process.force_exit(); ioCancellable.cancel(); });
        if (cancellable.is_cancelled()) process.force_exit();
        timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 120, () => {
            timeout = 0; timedOut = true; process.force_exit(); ioCancellable.cancel(); return GLib.SOURCE_REMOVE;
        });
        const [, stdout, stderr] = await Promise.all([
            new Promise((resolve, reject) => process.wait_async(null, (source, result) => {
                try { source.wait_finish(result); resolve(); } catch { reject(new Error('Não foi possível concluir a mensagem automática.')); }
            })), readDiagnostic(process.get_stdout_pipe(), ioCancellable), readDiagnostic(process.get_stderr_pipe(), ioCancellable),
        ]);
        if (cancellable.is_cancelled()) throw new Error('Envio da mensagem automática cancelado.');
        if (timedOut) throw new Error('A mensagem automática excedeu 2 minutos.');
        if (!process.get_successful()) throw new Error(cliFailure(account.provider, `${stderr}\n${stdout}`,
            process.get_if_exited() ? process.get_exit_status() : 'interrompido'));
    } catch (error) {
        if (cancellable.is_cancelled()) throw new Error('Envio da mensagem automática cancelado.');
        if (timedOut) throw new Error('A mensagem automática excedeu 2 minutos.');
        if (!process) throw new Error('Não foi possível iniciar o CLI para enviar a mensagem automática.');
        throw error;
    } finally {
        ioCancellable.cancel();
        if (timeout) GLib.Source.remove(timeout);
        if (signal) cancellable.disconnect(signal);
        // CLI may create local metadata; remove only our own temporary directory.
        const file = Gio.File.new_for_path(directory);
        try { file.delete(null); } catch { /* a CLI-created file may keep this directory nonempty */ }
    }
}
