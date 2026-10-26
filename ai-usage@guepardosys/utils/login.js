// Quote the directory as shell data, preserving only the supported home shorthand.
export function loginCommand(provider, profilePath) {
    const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
    const path = profilePath.trim();
    if (!path) return '';
    const directory = path === '~' ? '"$HOME"' : path.startsWith('~/')
        ? `"$HOME"/${quote(path.slice(2))}` : quote(path);
    return provider === 'openai' ? `CODEX_HOME=${directory} codex login`
        : `CLAUDE_CONFIG_DIR=${directory} claude`;
}
