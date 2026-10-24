# AI Quota Notch (Windows, protótipo)

Indicador pequeno no topo central da tela, no estilo do notch do MacBook. Fechado, mostra o restante da janela de 5 horas do Claude e do Codex. Ao passar o mouse, abre e mostra as janelas de 5 horas e semanal, o horário de renovação, o seletor de tema (Claro, Escuro, Sistema), o botão Atualizar e o menu (Iniciar com o Windows, Sair).

Fora do notch, a janela é transparente e deixa os cliques passarem.

## Dados

- Claude: lê `%USERPROFILE%\.claude\.credentials.json` (ou `CLAUDE_CONFIG_DIR`). Faça login pelo Claude Code.
- Codex: lê `%USERPROFILE%\.codex\auth.json` (ou `CODEX_HOME`). Faça login com `codex login`.
- Tokens ficam só em memória. O app não salva, não copia e não registra credenciais. A consulta é feita a cada 5 minutos.
- Os endpoints são internos e podem mudar (veja `docs/RESEARCH.md`).

## Executar

No PowerShell, na pasta `windows-notch`:

```powershell
bun install
bun run start   # dados reais
bun run demo    # dados simulados
bun test
```

Preferências (tema) ficam em `%APPDATA%\ai-quota-notch\prefs.json`.
