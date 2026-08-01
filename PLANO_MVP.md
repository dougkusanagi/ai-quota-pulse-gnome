# Plano de implementação — ChatGPT Usage Widget (MVP)

## 1. Objetivo

Criar um widget nativo para Windows 11 que mostre, de forma persistente, o percentual de uso do ChatGPT e a data/hora do próximo reset. Ele ficará visualmente na faixa vazia da barra de tarefas, imediatamente antes da área de ícones da *system tray*, como na referência fornecida.

O MVP será um aplicativo Python gerenciado com `uv`, inspirado no comportamento e na linguagem visual do projeto [niccolo-sabato/claude-usage-widget](https://github.com/niccolo-sabato/claude-usage-widget): compacto, sem roubar foco, sempre visível, com barras de progresso e contagem regressiva.

## 2. Decisão de posicionamento

O Windows não oferece uma API pública estável para inserir controles arbitrários **dentro** da barra de tarefas do Explorer. Portanto, o MVP implementará uma janela flutuante sem moldura que:

- fica sempre no topo e sobre a barra de tarefas;
- usa estilo de ferramenta e `WS_EX_NOACTIVATE`, para não aparecer em `Alt+Tab` nem tomar foco;
- é ancorada ao canto inferior direito da área de trabalho, com uma margem configurável antes da tray;
- se reposiciona quando a resolução, escala de DPI, monitor principal ou geometria da barra de tarefas mudar;
- permite arrastar o widget uma vez e persiste sua posição relativa.

Esse é o mesmo padrão técnico adotado pela referência: entrega o resultado visual desejado sem depender de alterar o Explorer.

## 3. Escopo do MVP

### Incluído

- Windows 11 como plataforma inicial.
- Uma conta ChatGPT por instalação.
- Exibição de uma ou mais cotas que estejam disponíveis para a conta, por exemplo: modelo padrão, raciocínio ou Codex.
- Para cada cota: nome curto, percentual consumido, barra de progresso e horário/data de reset.
- Atualização manual e atualização automática configurável (padrão: 3 minutos).
- Estados explícitos de carregamento, dados indisponíveis, sessão expirada e erro de conexão.
- Janela compacta, translúcida/escura, com texto legível em tema escuro do Windows.
- Menu de contexto: atualizar, abrir configuração, reposicionar, alternar “sempre no topo” e sair.
- Configuração, logs e tokens armazenados somente no perfil local do usuário.
- Inicialização opcional com o Windows.

### Fora do MVP

- Inserção real na barra de tarefas do Explorer.
- Multi-conta, alertas de limiar, autoatualização, internacionalização e instalador.
- Medição de tokens por conversa ou de custo da OpenAI API.
- Suporte a macOS/Linux.
- Dependência permanente de automação do navegador.

## 4. Fonte dos dados de uso: validação obrigatória

Os limites do ChatGPT variam por plano, modelo e condições operacionais; o próprio ChatGPT mostra o horário de reset quando essa informação está disponível. Não há, para contas pessoais, uma API pública documentada que entregue universalmente o percentual de uso e o reset da interface do ChatGPT. Logo, o projeto deve separar a interface da origem dos dados desde o começo.

O MVP terá a seguinte ordem de implementação/validação:

1. **Modo demonstrativo:** dados fixos e depois dados simulados, para concluir UI, ancoragem e persistência sem credenciais.
2. **Provedor manual:** formulário local para informar percentual e data/hora de reset; garante um MVP utilizável mesmo se não houver integração confiável.
3. **Provedor de sessão do ChatGPT (experimental):** investigar, com uma conta de teste, se a sessão autenticada expõe um endpoint usado pela própria interface para mostrar cotas. Implementar somente se os dados forem consistentes, a autenticação puder ser protegida e o uso estiver de acordo com os termos aplicáveis.
4. **Fallback seguro:** se o provedor falhar, manter o último valor com selo de “atualizado em…”, sem inventar reset nem percentual.

Para workspaces Business/Enterprise/Edu, o plano deve ser revisitado: há recursos administrativos e analíticos próprios, mas a finalidade, permissões e latência deles diferem de um indicador pessoal em tempo real.

## 5. Arquitetura proposta

```text
ChatGPT / entrada manual
           │
           ▼
    UsageProvider (interface)
      ├─ DemoProvider
      ├─ ManualProvider
      └─ ChatGPTSessionProvider [experimental]
           │
           ▼
  UsageSnapshot normalizado
  (itens, % usado, reset, atualizado_em, status)
           │
     ┌─────┴─────┐
     ▼           ▼
 Persistência   Controlador de atualização
     │           │
     └─────┬─────┘
           ▼
  Janela compacta Win32 + UI Python
  (layout, barras, menu, posição e DPI)
```

### Componentes

- `domain`: modelos tipados para `UsageItem`, `UsageSnapshot` e estados de falha.
- `providers`: contrato de obtenção de dados e implementações de demo/manual/sessão.
- `services`: agendamento de atualização, cálculo da contagem regressiva e cache do último snapshot válido.
- `ui`: janela compacta, cartões/barras, menu de contexto e tela mínima de configuração.
- `platform/windows`: DPI awareness, estilos Win32, posicionamento relativo à work area e inicialização com Windows.
- `storage`: configuração em `%LOCALAPPDATA%\ChatGPT Usage Widget\` e segredo no Windows Credential Manager.
- `logging`: log rotativo sem cookies, tokens, cabeçalhos de autorização ou conteúdo de conversas.

## 6. UX e layout

### Layout compacto inicial

Cada cota ocupará uma coluna estreita, semelhante à imagem de referência:

```text
 [ícone]  63%              [ícones da tray]
          ████████░░░░
          ↻ reset 23 ago · 14:00
```

- Largura padrão por item: 150–180 px; uma única linha no MVP.
- Até três itens lado a lado, reduzindo o texto de reset para não invadir a tray.
- Cores de progresso: azul até 74%, âmbar de 75–89%, vermelho a partir de 90%.
- Clique direito abre o menu; duplo clique abre a janela de detalhes/configuração.
- Hover mostra *tooltip* com nome completo da cota, último sucesso e reset em horário absoluto e relativo.
- O widget cresce para a esquerda, preservando a distância escolhida até a tray.

### Acessibilidade e resiliência visual

- Suportar DPI de 100% a 200% antes da primeira versão distribuída.
- Contraste suficiente, fontes do sistema (`Segoe UI`) e informação textual além da cor.
- Impedir que o widget cubra relógio, botões da tray ou controles de notificações; recolher para um único item quando faltar espaço.

## 7. Stack técnica

- Python 3.12+.
- `uv` para criação do projeto, ambiente, dependências, lockfile e comandos de desenvolvimento.
- `tkinter` para a primeira UI: distribuído com CPython, leve e suficiente para uma janela compacta. Complementar com `ctypes` para os estilos e chamadas Win32 necessárias.
- `Pillow` para desenhar barras e ícones com boa qualidade em DPI alto, se a UI nativa não for suficiente.
- `keyring` (Windows Credential Manager) para segredos; nunca JSON em texto puro.
- `pytest` para domínio, providers, formatação de datas e posicionamento calculável.
- `ruff` para lint/format e `pyright` para tipos.
- `PyInstaller` somente na etapa de empacotamento do MVP.

O projeto deverá nascer com `uv init`, dependências declaradas em `pyproject.toml` e `uv.lock` versionado. O fluxo de desenvolvimento será `uv run`, sem `pip` global ou ambiente virtual manual.

## 8. Estrutura inicial do repositório

```text
chatgpt-usage-widget/
├─ pyproject.toml
├─ uv.lock
├─ README.md
├─ src/chatgpt_usage_widget/
│  ├─ __main__.py
│  ├─ app.py
│  ├─ domain/
│  ├─ providers/
│  ├─ services/
│  ├─ ui/
│  ├─ platform/windows/
│  ├─ storage/
│  └─ assets/
├─ tests/
└─ scripts/
```

## 9. Fases de execução

### Fase 0 — descoberta e critérios de aceite (0,5 dia)

- Confirmar plano ChatGPT alvo (Free, Plus, Pro ou workspace gerenciado) e quais cotas devem ser mostradas.
- Validar em uma conta de teste o que a interface mostra como uso e reset.
- Definir se o MVP será manual, experimental por sessão ou ambos.
- Registrar política de dados e o procedimento de revogação da sessão.

**Aceite:** contrato `UsageSnapshot` definido a partir de exemplos reais anonimizados; nenhuma credencial salva em arquivo de texto.

### Fase 1 — fundação do projeto com `uv` (0,5 dia)

- Inicializar pacote, ferramentas de qualidade e testes.
- Criar comandos documentados para executar, testar, formatar e empacotar.
- Configurar diretório local de dados, log rotativo e instância única.

**Aceite:** aplicação de demonstração abre pelo `uv`, testes e lint passam em máquina Windows limpa.

### Fase 2 — domínio, demo e tela compacta (1–1,5 dias)

- Implementar modelos de dados e `DemoProvider`.
- Construir barra, percentual, reset absoluto/relativo e estados de erro.
- Criar o modo compacto de uma cota e o menu de contexto.

**Aceite:** a janela apresenta 0%, 63%, 90% e 100%, além de reset futuro e erro, com dados simulados.

### Fase 3 — integração Windows e posicionamento (1–1,5 dias)

- Ativar DPI awareness por processo.
- Aplicar janela sem borda, tool window, sem ativação e sempre no topo.
- Calcular posição antes da tray com base na área útil do monitor/barra de tarefas; salvar offset escolhido pelo usuário.
- Tratar troca de monitor, mudança de DPI e reinício do Explorer.

**Aceite:** o widget não entra em `Alt+Tab`, não muda a janela ativa e continua visível nos cenários de monitor/DPI definidos.

### Fase 4 — configuração e dados utilizáveis (1 dia)

- Adicionar `ManualProvider`, com campos de percentual e data/hora de reset.
- Persistir preferências não sensíveis e último snapshot válido.
- Implementar atualização periódica, atualização sob demanda e selo de dados desatualizados.

**Aceite:** usuário consegue manter o widget correto sem integração de sessão, inclusive após reiniciar o aplicativo.

### Fase 5 — spike do provedor ChatGPT experimental (1–2 dias)

- Investigar somente em perfil/conta de teste, documentando endpoint, payload, validade de sessão, limites e riscos.
- Criar adaptador isolado atrás de *feature flag*; proteger segredo com Credential Manager.
- Implementar detecção de expiração/revogação e remoção de segredo.

**Aceite:** se viável, dados de ao menos uma cota correspondem à interface do ChatGPT em testes repetidos. Se inviável, o MVP permanece entregue com modo manual e a descoberta é registrada como decisão explícita.

### Fase 6 — estabilização e distribuição local (0,5–1 dia)

- Testar em escalas 100%, 125%, 150% e 200%, um e dois monitores e tray expandida.
- Validar falhas de rede, sessão inválida e desligamento/reabertura.
- Empacotar executável local com PyInstaller e documentar instalação/remoção.

**Aceite:** executável abre, mantém a geometria, não vaza segredos nos logs e apresenta mensagem acionável em todas as falhas previstas.

## 10. Segurança e privacidade

- Não pedir senha do ChatGPT nem automatizar login.
- Se o modo experimental exigir um artefato de sessão, solicitar consentimento explícito, armazená-lo no Credential Manager e oferecer “Remover conexão”.
- Não transmitir telemetria nem conteúdo de conversas.
- Redigir logs; nunca registrar cookies, tokens, `Authorization`, e-mail ou payload bruto.
- Exibir no app que uma integração não documentada pode parar de funcionar sem aviso e deve ser tratada como opcional.

## 11. Riscos e decisões de contingência

| Risco | Impacto | Resposta no MVP |
| --- | --- | --- |
| Não existir endpoint pessoal estável para cotas | Dados automáticos indisponíveis | Manter `ManualProvider` como caminho suportado. |
| Mudanças nas cotas/modelos do ChatGPT | Rótulos e percentuais incorretos | Itens de uso dinâmicos; não codificar limite fixo no cliente. |
| Widget encobrir tray em DPI/monitores distintos | UX ruim | Limites de largura, recolhimento e recalibração ao mudar display. |
| Token de sessão expirar ou ser revogado | Falha de atualização | Mostrar estado “reconectar”, preservar último snapshot e remover segredo sob comando do usuário. |
| Uso de endpoint não documentado | Manutenção e conformidade | Isolar em feature flag, documentar e não torná-lo pré-requisito do MVP. |

## 12. Critério de conclusão do MVP

O MVP estará concluído quando um usuário Windows 11 conseguir iniciar o aplicativo com `uv`, manter um widget compacto antes da tray, ver pelo menos uma barra de uso com percentual e horário de reset, atualizar os dados manualmente ou por provedor disponível, e receber estados claros quando os dados não puderem ser obtidos — sem o widget roubar foco ou ocultar a interface do sistema.

## Referências

- [Claude Usage Widget for Windows](https://github.com/niccolo-sabato/claude-usage-widget) — referência de layout, janela sempre no topo, modo essencial, persistência e tratamento de DPI.
- [GPT-5.6 in ChatGPT — Usage limits](https://help.openai.com/en/articles/20001354) — limites variam por plano/modelo; o ChatGPT informa o reset quando disponível.
- [ChatGPT Free Tier FAQ](https://help.openai.com/en/articles/9275245) — limites do produto podem variar e o aviso de reset é exibido na interface.
