# Revisão de interface — v2

Restrições de renderização adotadas: preenchimentos sólidos e filetes de 1px; **sem blur, sem `BackdropEffect`, sem sombras grandes**; animações só de `opacity`, `translation_x` e `rotation_angle_z` (propriedades de compositor, sem re-layout). Barras desenhadas com Cairo, uma única vez por quota.

## Encontrado e resolvido

| # | Problema | Solução |
|---|---|---|
| 1 | Cartões brancos com borda dura e texto denso (~170 px por conta) | Cartão único por conta, hierarquia nome → plano → janelas; mais compacto |
| 2 | Dois níveis de navegação (título + abas Detalhes/Configurações) ocupavam uma linha inteira | Cabeçalho único: título + status, atualizar e ajustes. Ajustes e editor viram telas com botão voltar |
| 3 | Rodapé só para "Atualizado às…" e Atualizar | Status virou subtítulo vivo ("Atualizado há 2 min"); sem rodapé |
| 4 | Barra: gradiente fixo verde→vermelho recortado; 72% restante aparecia **laranja/vermelho** | Cor por estado: verde > 40%, âmbar 15–40%, vermelho ≤ 15%. Preenchimento em pílula com extremidades arredondadas e largura mínima visível |
| 5 | Reset exibido como "Reset qua., 30 de set. · 15:39" | Dia amigável + hora ao lado do nome da janela ("hoje 21:28", "dom 04/10 22:26"); "reiniciando" quando vencido |
| 6 | Percentual repetido como "Resta 72%" e legenda "Limite utilizado na barra superior" em toda conta | Uma linha por janela: "5 horas · hoje 21:28 … Resta 72%"; sem legenda extra nem chip |
| 7 | Título do cartão era o provider; nome do perfil ficava em segundo plano | Nome da conta em destaque, "Codex · Plus" (plano real quando o provider informa) abaixo |
| 8 | Seletores falsos (botão "▾" que expandia lista) | Controle segmentado inline: todas as opções visíveis, um clique |
| 9 | Interruptor genérico de menu | Switch próprio com knob animado |
| 10 | Intervalo de atualização: lista de 6 itens expansível | Stepper − 5 min + |
| 11 | Linha de conta com 5 botões de texto/ícone, "Remover" inline | Linha limpa com ações em ícones silenciosos; **Remover** só dentro do editor, com confirmação |
| 12 | Editor sem feedback: sem pré-visualização, paleta sem estado selecionado | Pré-visualização ao vivo (logo, iniciais, cor, nome); swatch selecionado com ✓; Enter salva; erro em linha; foco automático no nome |
| 13 | Erro de conta era uma linha vermelha solta | Callout com ícone, título e causa/ação; demais contas seguem normais |
| 14 | Estado vazio com texto cru | Ilustração mínima, título, explicação e botão primário |
| 15 | Spinner de refresh usava timer de 40 ms e girava em torno do canto superior esquerdo | Easing de compositor com pivô central; sem timer; botão esmaece enquanto consulta |
| 16 | Popup reabria na última tela (ex.: formulário esquecido) | Fechar o popup volta para Detalhes |
| 17 | Lista era reconstruída a cada minuto mesmo fechada | Detalhes reconstruídos só com o popup aberto; ao abrir, ele se atualiza |
| 19 | Cores de foco fixas | Acento do sistema (GNOME 47+: `accent-color`) em botão primário, switch, foco e seleção; azul como padrão |
| 20 | Scrollbar encostada no conteúdo | Scrollbar em calha própria, fina; rolagem volta ao topo ao trocar de tela |
| 21 | Painel: trilho e selo sem separação clara | Trilho 4px com base translúcida e selo com anel na cor do painel |
| 22 | Logo solto, sem âncora visual para o selo | Logo em tile 34px com selo sobreposto e anel; escala de espaçamento 4/8/12/14/16 px |

## Decisões mantidas (já estavam definidas no projeto)

- Preenchimento da barra ancorado à direita, recuando para a esquerda ao consumir quota.
- Falha de conta mostra `--` e erro; **nunca** uma quota antiga.
- Tema Automático/Claro/Escuro próprio do popup; formato de reset (24h/12h/relativo) rege o painel e o horário absoluto.

## Fora do escopo / observação

- Não há tooltips (St não tem nativo); cada botão de ícone tem `accessible_name`.
- Hover/foco e leitores de tela exigem verificação com mouse e Orca reais.
