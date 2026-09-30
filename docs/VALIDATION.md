# Validação — 2026-09-30

## Executado

- `make check`: sintaxe de todos os módulos, metadata JSON e schema GLib estrito.
- `make test-prefs`: import real do serviço de preferências GNOME, construção GTK4/libadwaita e schema em memória.
- `make test`: iniciais Unicode e primeira/última palavra, limite manual, formatos de hora, normalização e seleção de janelas, percentuais inválidos, limites adicionais; GJS nativo para N contas, reordenação, concorrência máxima 4, falha individual, cancelamento, ausência de callbacks após disable, leitura de fixtures de credenciais, HTTP libsoup 3 local, bloqueio de redirects com Authorization e Retry-After.
- Providers reais: `gjs -m scripts/probe.js openai` e `... claude` nos perfis existentes. Ambos retornaram quotas reais; tokens não foram impressos. Os valores são variáveis e não são fixtures de produção.
- GNOME Shell **50.1**, GJS **1.88.0**, Wayland headless 1280×800, sessão D-Bus separada e GSettings keyfile isolado. Extensão habilitada e popup aberto; detalhes, settings e modo monocromático capturados. Formulário exercitado por sinais reais de St.Button: adicionar/editar, geração automática BA, override ZZ preservado, reorder/remove. Disable removeu o indicador; re-enable retornou estado ENABLED.
- `make install EXTENSIONS_DIR=/tmp/aiusage-install-check` validou layout instalado e schema compilado.
- `make pack` produziu o ZIP com metadata/schema e assets locais.
- Revisão final de código e screenshots confirmou superfície clara, separadores, gradiente fixo recortado, ausência de credenciais na configuração e cleanup. Espaço para scrollbar e controles acessíveis foram corrigidos.

## Compatibilidade

| GNOME | Estado |
|---|---|
| 46 | Declarado; APIs ES module e fallback St previstos; não executado nesta máquina |
| 47 | Declarado; não executado nesta máquina |
| 48 | Declarado; não executado nesta máquina |
| 49 | Declarado; não executado nesta máquina |
| 50.1 | Executado em sessão GNOME real isolada |

Estratégia sem branches: imports ES modules comuns a 46–50; feature detection de ScrollView.set_child/add_child/add_actor e de BlurEffect.radius/sigma. Backdrop separado de BoxPointer mantém blur fora do framebuffer offscreen dos controles. Sinais, bindings e backing actor são removidos em disable. Fallback transparente claro quando blur é indisponível.

## Limites da evidência

Testes nativos headless emitiram avisos da infraestrutura de portals/IBus e do Clutter input focus ao alterar entradas por automação; não houve exceção GJS da extensão. Fluxo por mouse/teclado físico, leitores de tela, escala HiDPI e GNOME 46–49 requerem verificação nesses ambientes. Dados nas screenshots são fixtures de teste isolado; as consultas reais dos providers foram verificadas separadamente.

Não há drag-and-drop; as setas oferecem reordenação nativa acessível. Keyring direto/legado Codex é lido via libsecret; Keyring gerenciado recente não é decodificado. O login deve ser renovado pelo CLI. Endpoints internos podem mudar ou negar acesso; a extensão relata a falha individualmente.
