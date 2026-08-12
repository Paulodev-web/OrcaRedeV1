# Resumo da entrega — Esteira de Trabalho

**Data:** 12/08/2026 · **Branch:** `feat/esteira-tarefas` · **Base:** `feat/org-multitenancy-web`

Reescrita completa do módulo `/tarefas`, que tinha sido entregue de manhã como
"Quadro de Trabalho" e não servia. O plano que originou este trabalho está em
[`MD/PLANO-ESTEIRA-TAREFAS.md`](PLANO-ESTEIRA-TAREFAS.md); aqui está o que de
fato foi construído.

---

## 1. Por que reescrever em vez de ajustar

Três defeitos de modelo, não de acabamento:

| | O que estava errado | Consequência |
|---|---|---|
| **1** | `budget_id NOT NULL` em `tasks` | O Comercial **não conseguia abrir a primeira demanda**. O mapeamento diz que todo projeto entra pelo Comercial (Fase 1) e o orçamento só nasce na Engenharia (Fase 2). O fluxo real voltava pro WhatsApp. |
| **2** | `setor = quadro`, `status = coluna` | Quatro quadros isolados. Para saber onde estava o job do cliente era preciso abrir 4 abas, e "concluída no Comercial" + "na fila da Engenharia" eram o mesmo evento sem ligação nenhuma. |
| **3** | Server Action + `router.refresh()` a cada movimento | `router.refresh()` troca o DOM: os cards desmontavam e remontavam. Nenhuma animação era possível — não faltava CSS, faltava o nó sobreviver à mutação. |

Somava-se: sem anexos, sem drag, sem ordenação, sem "as minhas"; chat visível para
menos gente que a própria task; `transition_note` existia no banco mas nenhuma
tela mandava nota (o histórico nascia mudo); e `tasks_seed_members` adicionava o
setor inteiro a cada handoff, o que transformaria o sino em ruído em duas semanas.

Como **nada tinha sido aplicado em produção** e dev tinha 1 task de teste, as
migrations do dia foram reescritas em vez de receberem `ALTER` por cima.

---

## 2. Banco — 5 migrations

Todas em `supabase/migrations/`. **Aplicadas e validadas em dev; produção continua
sendo aplicação manual sua, após backup** (regra §3.2 do escopo).

### `20260812120000_tarefas_core.sql`

Derruba a versão da manhã (no-op em qualquer banco que nunca a recebeu) e cria:

- **`tasks`** com o modelo novo:
  - `stage` — a coluna da esteira: 7 etapas de trabalho + `concluido`/`perdido`. `NULL` = card avulso.
  - `sector` — **derivado** de `stage` por trigger. Continua existindo porque alimenta notificação, `current_org_sector()` e o filtro "meu setor".
  - `budget_id` **nulável** + `work_id` + `client_name` — a demanda existe antes do orçamento.
  - `position NUMERIC` — ordem dentro da coluna, inserção no ponto médio.
  - `blocked_reason` — substitui o status manual que ninguém mantinha.
  - **Sem `status`**: quem tem responsável está em andamento, quem não tem está aguardando, sair da etapa é concluir a etapa.
- **`task_stage_sector()`** e **`task_stage_order()`** — o vocabulário da esteira em SQL, espelhado em `src/types/tasks.ts`.
- **`task_events`** (era `task_transitions`) — linha do tempo append-only com `kind`: `criada`, `movida`, `atribuida`, `desatribuida`, `bloqueada`, `desbloqueada`, `prazo`, `vinculada`. Guarda `direction` (`avanco`/`retorno`/`encerramento`), calculada no banco porque é ela que decide a cor do flash do card.
- **`tasks_before_write()`** — deriva setor, limpa responsável e bloqueio no handoff, calcula direção, grava o evento e zera `transition_note`, tudo na mesma transação.
- **`rebalance_task_positions()`** — reescreve a ordem da coluna quando o intervalo entre posições aperta.
- **`REPLICA IDENTITY FULL`** em `tasks` — sem isso o payload de UPDATE do Realtime não diz de qual coluna o card saiu.

### `20260812121000_tarefas_chat.sql`

- **Leitura do chat vira org-wide.** `task_messages_select` passa a usar `org_id = current_org_id()`, igual à task. Acabou a assimetria de "vejo onde o card está mas não a conversa".
- **`task_members` → `task_followers`.** A lista agora só decide **quem é notificado**, e entra nela quem demonstrou interesse: criou, é responsável, comentou. O setor de destino de um handoff **não** entra mais.
- `task_messages` com `body` nulável (mensagem só de anexo) e `client_event_id` único (retry não duplica).

### `20260812122000_tarefas_attachments.sql`

- **`task_attachments`** com `message_id NULL` — é o que faz "anexei no card" e "mandei a foto no chat" caírem na mesma grade, sem o usuário escolher.
- **Bucket `tarefas`, privado**, path `{org_id}/{task_id}/{uuid}-{nome}`. O primeiro segmento é o **org_id**, não o user_id: o arquivo é da empresa, e colega precisa baixar o que o outro anexou.
- Policies de `storage.objects` para `authenticated` porque o upload vai **direto do browser** — Server Action na Vercel tem teto de ~4.5 MB e foto de celular estoura sozinha.

### `20260812123000_tarefas_notifications.sql`

Reaproveita `notifications` sem nenhum `ALTER`. Volume corrigido:

| Evento | Quem recebe |
|---|---|
| Handoff (mudou de **setor**) | membros ativos do setor de destino, menos quem agiu |
| Responsável atribuído | a pessoa |
| Travou / destravou | seguidores |
| Mensagem no chat | **seguidores**, nunca o setor inteiro |

Trocar `orcamento → precificacao` não notifica ninguém: continua na Engenharia, não é chegada de trabalho novo.

### `20260812124000_tarefas_module_permissions_seed.sql`

Sem alteração de conteúdo — o módulo continua nascendo visível para todo `org_members` ativo.

**Validação em dev:** ciclo completo testado (criar sem orçamento → handoff com nota → avanço interno → retorno → travar → assumir → encerrar) e os 7 eventos saíram com a direção certa. Um ajuste veio desse teste: o card chegava em "Concluído" ainda marcado como travado — o bloqueio agora é limpo silenciosamente ao trocar de etapa.

---

## 3. Front

### Arquitetura — o que destravou a animação

```
Server Component → esteira inteira, uma vez (initialData)
       ↓
BoardProvider (client) → DONO do estado
       ↓                  • mutação otimista: o card move na hora
       ↓                  • Server Action em background
       ↓                  • erro → volta ao snapshot + toast
       ↓
Realtime (tasks, org_id=eq.…) → reconcilia colega, sem remontar nada
```

**`router.refresh()` saiu do board.** É a mudança que torna o resto possível.

### Arquivos

| Caminho | O que é |
|---|---|
| `src/types/tasks.ts` | Vocabulário da esteira em TS, espelhando as funções SQL. `TASK_STAGE_META` com rótulo, setor, fase e dica por etapa. |
| `src/app/tarefas/_data/tasks.ts` | `getBoard` (esteira inteira numa consulta), `getTaskDetail`, `getBoardMembers`, `getBudgetOptions`. |
| `src/app/tarefas/_actions/tasks.ts` | `moveTaskAction` (posição pelo ponto médio, calculada **no servidor** a partir dos ids dos vizinhos), criar, atribuir, travar, editar campos, excluir, mensagens, anexos, seguidores. |
| `src/components/tarefas/board/BoardProvider.tsx` | Estado, filtros, otimismo, Realtime, snapshot/rollback. |
| `src/components/tarefas/board/EsteiraBoard.tsx` | `DragDropProvider` + `move()`. |
| `src/components/tarefas/board/StageColumn.tsx` | Coluna com faixa de 2px na cor do setor dono. |
| `src/components/tarefas/board/TaskCardView.tsx` | Card `useSortable`, com guarda de 5px para o clique não disparar depois do arrasto. |
| `src/components/tarefas/board/BoardToolbar.tsx` | Filtros: setor, só as minhas, busca, mostrar encerradas. |
| `src/components/tarefas/board/ReturnNoteDialog.tsx` | Motivo obrigatório ao devolver. |
| `src/components/tarefas/detail/TaskDetailPanel.tsx` | Card por dentro, com título e descrição editáveis inline (salva no blur). |
| `src/components/tarefas/detail/TaskActivity.tsx` | **Atividade unificada** — mensagens e eventos no mesmo fio, em ordem. |
| `src/components/tarefas/detail/TaskAttachmentGrid.tsx` | Grade com arrastar-para-subir, colar da área de transferência e lightbox. |
| `src/components/tarefas/detail/TaskSidebar.tsx` | Etapa, responsável, prazo, travar, seguidores, excluir, e o **atalho para o módulo da etapa**. |
| `src/components/tarefas/detail/uploadTaskFiles.ts` | Upload browser→Storage + registro por action. |
| `src/components/tarefas/CreateTaskDialog.tsx` | Nasce em "Solicitação", **sem orçamento**. |

Removidos: `Board.tsx`, `SectorTabs.tsx`, `TaskCard.tsx`, `MoveTaskMenu.tsx`, `AssignSelfButton.tsx`, `TaskChat.tsx`, `TaskDetailPanel.tsx` (versões antigas).

### A esteira

```
Solicitação → Orçamento técnico → Precificação → Proposta →
Projeto executivo → Compras → Execução → [Concluído | Perdido]
 Comercial      Engenharia      Engenharia    Comercial
                Engenharia      Compras       Execução
```

Faixa de 2px por setor no topo de cada coluna — é o que torna legível o vaivém
Comercial ↔ Engenharia. Arrastar para a direita avança, para a esquerda devolve
(e **exige motivo**). Filtros esmaecem em vez de esconder: ver a fila do vizinho é
o ponto do módulo.

### Animação

`@dnd-kit/react@0.5.0` + `@dnd-kit/helpers` — o `@dnd-kit/dom` que vem junto traz
o motor de FLIP e move o DOM otimista por padrão. **Sem Framer Motion.**

O que foi adicionado ao `globals.css` (o que o dnd-kit não cobre):

| Momento | Efeito |
|---|---|
| Pegar o card | `scale(1.02) rotate(1.5deg)` + sombra sobe; origem em 40% de opacidade |
| Arrastando | segue o ponteiro **sem transição** (transição aqui = sensação de elástico) |
| Coluna sob o card | fundo `accent-50` + contorno tracejado, 150 ms |
| Pousar avançando | anel `accent-500` que apaga em 400 ms |
| Pousar devolvendo | mesmo movimento, anel **âmbar** — a cor diz o que aconteceu sem texto |
| Encerrar | anel verde |
| Card chegando pelo Realtime | fade + `translateY(-6px)`, 200 ms |
| Bolha nova no chat | fade + `translateY(8px)`, 180 ms |

`prefers-reduced-motion` já é global no `globals.css` (linha 644) — o arrasto
continua funcionando, só perde os transforms decorativos.

---

## 4. Verificação

- `npx tsc --noEmit` — limpo
- `npx eslint` no módulo — limpo
- `npm run build` — compila, 41 rotas geradas
- Migrations aplicadas em dev; ciclo de vida completo testado em SQL
- 8 cards de demonstração semeados **em dev** para avaliação visual

Limpar os cards de demonstração:

```sql
delete from public.tasks where org_id = (select id from public.organizations order by created_at limit 1);
```

---

## 5. O que ficou de fora (Fase 5 do plano)

Automação da esteira — cada item é independente e a esteira funciona 100% manual sem eles:

- Criar orçamento a partir do card (preenche `budget_id`, avança para Orçamento técnico)
- Precificação salva como principal → avança
- Proposta publicada → avança
- **Cliente aceita na página pública → avança para Projeto executivo e notifica a Engenharia** (pedido nominalmente em `mapeamentooperacional.md` §5.2)
- Obra criada no Andamento de Obra → preenche `work_id`, avança para Execução

Também em aberto, herdado do plano anterior: integração GestãoClick (§5.4), e o
card em modal por *intercepting route* (hoje o card abre em página cheia, que
funciona e é deep-linkável).

---

## 6. Antes de aplicar em produção

1. Backup.
2. Aplicar as 5 migrations na ordem (`20260812120000` → `20260812124000`).
3. O preâmbulo do `tarefas_core` derruba as tabelas `tasks`/`task_messages`/`task_members`/`task_transitions` **se existirem**. Em produção elas não existem — mas confira antes de rodar.
4. Conferir que o bucket `tarefas` nasceu privado.

---

## 7. Segunda rodada — correções e OrçaRede

### 7.1 O bug do drop (a esteira ficava "estranha" ao soltar)

Três causas, todas reais:

**a) O `dragend` lia o estado errado.** `onDragEnd` dispara no mesmo tique do
último `onDragOver`, antes de o React recomeçar o render. Ler `columns` do
closure ali devolvia o arranjo de **antes** do arrasto, e a posição gravada saía
calculada sobre os vizinhos errados — por isso o card pulava de lugar segundos
depois de soltar, quando o eco do Realtime chegava com a posição real.

Correção: `cardsRef`/`columnsRef` viraram espelhos **síncronos**, escritos junto
com o `setState` dentro dos manipuladores de evento. `applyColumns()` devolve o
arranjo novo, e o `dragend` passa esse arranjo direto para `commitMove` em vez
de ler do estado.

**b) `move()` só rodava no `dragover`.** O arranjo final do `dragend` pode
diferir do último `dragover`. Agora roda nos dois.

**c) O filtro escondia cards e desalinhava os índices.** Cada card entrega um
`index` ao `useSortable` que precisa bater com a posição real dentro de
`columns[key]`. Como `visibleIds()` filtrava a lista renderizada, a numeração
ganhava buracos e o `move()` reordenava sobre índices inexistentes. Agora o
filtro **esmaece** (que era o comportamento documentado desde o início) e o
contador da coluna mostra `casam/total`.

Ainda nessa: o card declarava `accept: ['card', 'column']`, se anunciando como
destino de uma coluna inteira e sujando a detecção de colisão. Passou a
`accept: 'card'` — quem aceita card para o caso da coluna vazia é o droppable da
própria coluna.

**Bônus:** o efeito que ressincronizava o board com o servidor saiu e no lugar
entrou o `pollingFallbackMs` do `useRealtimeChannel` (30 s) apontando para uma
ação nova, `getBoardSnapshotAction`. Só roda quando o canal cai de verdade, e
nunca com arrasto em voo.

### 7.2 O card virou modal

Rota interceptadora `@card/(.)[taskId]`: clicar num card abre um modal de
`1120×860` (limitado a 94vw/88vh) **por cima** do board, que continua montado
atrás — nada é desmontado e fechar é instantâneo. `/tarefas/[taskId]` continua
servindo link direto, F5 e nova aba, com os mesmos componentes; há um botão de
"abrir em página cheia" no cabeçalho do modal.

Organização do modal: cabeçalho fixo (título editável + etapa + cliente +
orçamento), corpo em duas colunas com **rolagem independente**, e a atividade
ocupando a altura que sobra (`fill`) em vez do teto de 520 px da página.

Arquivos: `src/app/tarefas/@card/(.)[taskId]/page.tsx`,
`src/app/tarefas/@card/default.tsx`, `src/components/tarefas/detail/TaskModal.tsx`,
e o slot `card` no `src/app/tarefas/layout.tsx`.

### 7.3 dnd-kit no OrçaRede (pastas)

O Dashboard usava drag-and-drop **nativo do HTML5**: `draggable`, `dataTransfer`,
e um `setDragImage` que desenhava uma etiqueta fora da tela porque o fantasma
padrão do navegador é feio. Não funcionava em toque, e exigia quatro estados em
paralelo (item, alvo, "está por cima", validade) mais um `setTimeout` de 50 ms
para contornar o flicker do `dragleave` ao passar por cima de um filho.

Agora é o mesmo motor da Esteira.

**Uma correção que veio junto, e era necessária:** `BudgetCard` e `FolderCard`
estavam declarados **dentro** do corpo do `Dashboard`. Componente declarado
dentro de outro ganha identidade nova a cada render do pai, e o React desmonta e
remonta a subárvore inteira — com HTML5 isso só custava performance, mas com
dnd-kit apagaria o registro do elemento arrastável no meio do gesto. Os dois
foram extraídos para módulos próprios com props explícitas.

| Arquivo | O que é |
|---|---|
| `src/components/orcamentos/BudgetCard.tsx` | Cartão de orçamento, arrastável |
| `src/components/orcamentos/FolderCard.tsx` | Cartão de pasta: arrastável **e** alvo de drop (dois hooks, refs compostos) |
| `src/components/orcamentos/dnd/dashboardDnd.ts` | Ids estruturados (`budget:<id>`, `zone:<nome>:<pasta>`) |
| `src/components/orcamentos/dnd/FolderDropZone.tsx` | Zona de drop com render-prop |
| `src/components/orcamentos/dnd/useDragToOpenGuard.ts` | Soltar depois de arrastar não conta como clique (guarda geométrica de 5 px, no lugar do `isClick` que dependia da ordem `dragstart`→`click` do HTML5) |

Zonas de drop: cartão da pasta, cada item do breadcrumb, "subir um nível" e a
área do nível atual. A validação (pasta dentro de si mesma, dentro de uma
descendente, ou já no destino) roda tanto no realce visual quanto no `dragend`,
porque toque e teclado podem soltar sem passar pelo hover.

As cores fixas de `blue-*` dessas áreas foram trocadas pelos tokens `accent-*`
do sistema de design.

*Segunda rodada escrita em 12/08/2026*
