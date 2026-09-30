# ChatGPT Usage Widget

Widget compacto para Windows 11 que exibe percentual de uso e horário de reset do ChatGPT sobre a barra de tarefas, antes da área de ícones da tray.

O projeto é um MVP em Python e usa [`uv`](https://docs.astral.sh/uv/) para ambiente, dependências, lockfile e execução. A janela segue a ideia do [Claude Usage Widget](https://github.com/niccolo-sabato/claude-usage-widget): sem moldura, sempre no topo, sem aparecer no `Alt+Tab`, com posição persistida e barras coloridas.

## Estado atual

- UI compacta funcional para Windows 11.
- Modo manual suportado: informe o percentual e a data/hora de reset pelo menu.
- Modo demonstração para validar o layout (`--demo`).
- Provedor de dados isolado para permitir uma integração autenticada futura.
- Nenhuma senha, cookie ou conteúdo de conversa é coletado.

O ChatGPT pode variar limites por plano/modelo e não oferece uma API pública universal para o percentual pessoal mostrado na interface. Por isso, o MVP não inventa valores: sem dados configurados, ele exibe um estado explícito de configuração; quando o reset não for conhecido, mostra “reset indisponível”.

## Executar

Pré-requisito: Windows 11, Python 3.11+ e `uv`.

```powershell
uv sync --dev
uv run chatgpt-usage-widget --demo
```

Para iniciar sem dados simulados:

```powershell
uv run chatgpt-usage-widget
```

No menu `☰`, escolha `Configurar uso manual…` e informe:

- percentual usado entre 0 e 100;
- reset no formato `DD/MM/AAAA HH:MM` (ou deixe vazio se a interface não informar a data).

O aplicativo salva apenas preferências e os valores manuais em `%LOCALAPPDATA%\ChatGPT Usage Widget\config.json`. Logs rotativos ficam em `widget.log`; nenhum segredo é escrito nesse arquivo.

Opções úteis:

```powershell
uv run chatgpt-usage-widget --help
uv run chatgpt-usage-widget --reset-config
uv run python -m chatgpt_usage_widget --demo
```

## Desenvolvimento

```powershell
uv run pytest
uv run ruff format .
uv run ruff check .
uv run pyright
```

Para gerar um executável local sem console:

```powershell
.\scripts\build.ps1
```

O resultado será `dist\ChatGPTUsage.exe`. O MVP ainda não inclui instalador nem atualização automática.

## Posicionamento

O Windows não possui uma API pública estável para inserir controles arbitrários dentro do Explorer. O widget usa uma janela flutuante sem ativação, ancorada por cálculo à esquerda da área reservada à tray. Arraste o cabeçalho para ajustar a posição; use `Reancorar antes da tray` para voltar ao padrão.

## Licença

Este repositório contém o MVP desta implementação. A referência visual e de interação é o projeto de terceiros indicado acima.
