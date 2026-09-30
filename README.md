# AI Usage para GNOME Shell

Extensão nativa em GJS para acompanhar **limites reais de assinatura** de N contas Codex/OpenAI e Claude. Indicadores lado a lado com logos locais, badges de perfil, horário do reset e trilho de uso. Popup claro de vidro leitoso com blur nativo, detalhes de todas as janelas e configurações internas.

## Instalação

Requisitos: GNOME Shell 46–50, GLib (`glib-compile-schemas`), libsoup 3 e `make`. Para o leitor de Keyring direto do Codex, instale libsecret com introspecção (`gir1.2-secret-1` no Ubuntu/Debian). `gjs`, Node e `zip` são necessários apenas para testes/empacotamento.

```sh
make install
```

O destino é `~/.local/share/gnome-shell/extensions/ai-usage@guepardosys/`.
Na primeira instalação em **Wayland**, encerre a sessão e entre novamente para o Shell descobrir a extensão. Depois:

```sh
make enable
```

Em Xorg, também é possível recarregar o Shell com Alt+F2 → `r`. Clique no indicador **AI** na barra superior e escolha **Configurações → Adicionar conta**. Nenhuma conta fictícia é incluída.

## Perfis e autenticação

Autentique cada conta no respectivo CLI, antes de adicioná-la:

```sh
CODEX_HOME="$HOME/.codex" codex login
CODEX_HOME="$HOME/.codex-work" codex login
CLAUDE_CONFIG_DIR="$HOME/.claude" claude
CLAUDE_CONFIG_DIR="$HOME/.claude-work" claude
```

No Claude Code, use `/login` quando necessário. Cadastre cada diretório separadamente. O campo perfil aceita `~/diretório` ou caminho absoluto, sem interpretação de comandos ou variáveis de shell. API keys de faturamento por tokens não expõem os limites de assinatura.

- Codex: lê `auth.json` existente; se não existir, consulta o formato **direto/legado** do Codex Auth via libsecret. O backend recente de Keyring gerenciado/encriptado do Codex ainda não é suportado. A falha é explicada na conta; não há extração genérica de segredos.
- Claude: lê `.credentials.json` existente no diretório configurado, padrão Linux do Claude Code.
- A extensão não salva, copia nem imprime credenciais. Configuração no GSettings contém somente metadados e aparência. Credenciais permanecem em memória pelo tempo da consulta.
- Tokens expirados devem ser renovados pelo CLI correspondente; a extensão não manipula refresh tokens rotativos.

As [descobertas e fontes](docs/RESEARCH.md) explicam os endpoints internos, que podem mudar ou restringir clientes externos. Em 30/09/2026, ambos os providers foram exercitados com os perfis locais autenticados: Codex retornou 5h e semanal; Claude retornou 5h, semanal e limites adicionais. Nenhum token foi registrado.

## Uso

**Detalhes** mostra nome/provider, iniciais, percentual restante, reset com data, última consulta bem-sucedida e todas as janelas disponíveis. A janela de aproximadamente 5h tem prioridade na top bar; na ausência dela, a semanal principal é usada. O limite escolhido está identificado.

**Configurações** contém formato 24h/12h/relativo, barra colorida, intervalo de 1–60 minutos e gerenciamento das contas. Adicione, edite nome/diretório/provider/cor/iniciais, oculte da barra, remova ou reordene pelas setas. As setas substituem drag-and-drop e funcionam com teclado. As iniciais são automáticas até a primeira edição manual.

O gradiente mantém sua largura original; o preenchimento é recortado da direita para a esquerda. Assim, o verde desaparece primeiro. No modo monocromático, o recorte é igual. O refresh único usa ícone nativo animado durante a consulta. Falhas são independentes; uma conta com erro mostra `--`, sem mascarar o erro com uma quota antiga.

## Desenvolvimento

```sh
make build       # compila schema e prepara build/
make check       # sintaxe, metadata e schema
make test        # testes Node + GJS real, HTTP local e lifecycle
make test-prefs  # instancia preferências GTK4 (requer sessão gráfica)
make pack        # dist/ai-usage@guepardosys.shell-extension.zip
make debug       # journal do GNOME Shell
make disable
make uninstall
```

Diagnóstico read-only de uma conta, sem imprimir credenciais:

```sh
gjs -m scripts/probe.js openai ~/.codex-work
gjs -m scripts/probe.js claude ~/.claude-work
```

Veja [validação e compatibilidade](docs/VALIDATION.md). As capturas de teste usam dados de fixture **apenas na sessão isolada**; não há modo simulado no provider nem no pacote instalado.

## Arquitetura

- `providers/`: libsoup 3, endpoints fixos HTTPS e normalização de limites.
- `services/accounts.js`: validação e ordem em GSettings; UUID estável por conta.
- `services/credentials.js`: leitura assíncrona de credenciais existentes e libsecret opcional.
- `services/refresh.js`: até quatro contas em paralelo, Retry-After, geração de consultas e cancelamento.
- `ui/`: componentes St e desenho Cairo com recorte fixo.
- `extension.js`: PanelMenu, popup, formulário e lifecycle.
- `prefs.js`: preferências GTK4/libadwaita para acesso pelo gerenciador de extensões.

Todos os timers, sinais, bindings, efeitos e requests são removidos ao desabilitar. Não são iniciados subprocessos pela extensão. Trocar o provider/diretório de uma conta invalida imediatamente a quota daquele perfil.

## Projeto Windows existente

O widget Windows anterior permanece no repositório. Suas instruções estão em [docs/WINDOWS.md](docs/WINDOWS.md).
