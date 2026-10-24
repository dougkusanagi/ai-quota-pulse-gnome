# AI Quota Notch (Windows, protótipo)

Indicador pequeno no topo central da tela, no estilo do notch do MacBook. Fechado, mostra o restante da janela de 5 horas do Claude e do Codex. Ao passar o mouse, abre e mostra as janelas de 5 horas e semanal, o horário de renovação, o seletor de tema (Claro, Escuro, Sistema), o botão Atualizar e o menu (Iniciar com o Windows, Sair).

Com mais de uma conta do mesmo serviço, o notch fechado mostra um anel por conta com as iniciais do perfil no centro, sem o percentual, e o painel agrupa as contas por serviço. Com uma conta só, as iniciais não aparecem e o percentual fica ao lado do anel.

Fora do notch, a janela é transparente e deixa os cliques passarem.

## Dados

- Perfis: o app usa o diretório padrão e também detecta diretórios irmãos com login, como `.claude-trabalho` ou `.codex-cliente`. O nome e as iniciais vêm do sufixo (`trabalho` → Trabalho / TR).
- Claude: lê `%USERPROFILE%\.claude\.credentials.json` (ou `CLAUDE_CONFIG_DIR`). Faça login pelo Claude Code.
- Codex: lê `%USERPROFILE%\.codex\auth.json` (ou `CODEX_HOME`). Faça login com `codex login`.
- Tokens ficam só em memória. O app não salva, não copia e não registra credenciais. A consulta é feita a cada 5 minutos.
- Os endpoints são internos e podem mudar (veja `docs/RESEARCH.md`).

## Executar

No PowerShell, na pasta `windows-notch`:

```powershell
bun install
bun run start   # dados reais
bun run demo        # dados simulados, 1 conta de cada
bun run demo:multi  # dados simulados, 2 contas de cada
bun test
```

Preferências (tema) ficam em `%APPDATA%\ai-quota-notch\prefs.json`.
