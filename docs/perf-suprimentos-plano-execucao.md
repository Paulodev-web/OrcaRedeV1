# Suprimentos e Cotação: plano de execução da performance

Companheiro de [perf-suprimentos-cotacao-mapeamento.md](perf-suprimentos-cotacao-mapeamento.md),
que tem o diagnóstico. Aqui está o que fazer, em que ordem, e como saber que funcionou.

Regra que vale para o plano inteiro: **uma fase por branch, medida antes e depois**. A
refatoração do orçamento funcionou assim e é por isso que dá para confiar nela.

## Números que justificam a ordem

Medidos na base dev, orçamento CURUMIN (229 postes), em 08/09/2026:

| Fato | Valor |
|---|---|
| Linhas trafegadas hoje para montar o BOM | 7.623 |
| Materiais distintos que saem disso | 100 |
| Payload bruto no banco (sem overhead de JSON) | 1.433 kB |
| Mesma agregação feita em SQL | 100 linhas, ~370 ms a frio |

Ou seja, o sistema transporta e reprocessa mais de 1,4 MB para produzir uma lista de 100
itens, e faz isso a cada abertura de tela e a cada save.

## Fase 0: instrumentar (30 min, sem risco)

Sem isto o resto é palpite.

1. Envolver com `timeServer` de [src/lib/perf/serverTiming.ts](src/lib/perf/serverTiming.ts):
   `getConciliationPayloadBySessionAction`, `calculateScenariosAction`,
   `loadFullConsolidatedBudgetMaterials`, `getBudgetMaterialsAction`.
2. Rodar `PERF=1 npm run dev`, abrir Conciliação e Cenários no CURUMIN, salvar um vínculo,
   salvar um preço negociado, e colar a saída do terminal em
   `docs/perf-suprimentos-baseline.md`.

Isso vira o baseline. Cada fase seguinte repete a medição e registra ao lado.

## Fase 1: matar o recarregamento do BOM

O maior ganho isolado. Duas funções SQL novas e três trocas de chamada.

### 1.1 Migration `supplies_budget_bom_functions`

```sql
-- Consolidação do BOM feita no banco, não no Node.
-- Paridade com consolidateMaterialsFromBudgetDetails (src/services/budgetMaterialAggregation.ts):
--   quantidade  = soma de grupos + avulsos
--   preço unit. = primeiro registro encontrado, grupos antes de avulsos, postes por counter
--   grupo cai para materials.price quando price_at_addition é nulo ou zero; avulso não cai
create or replace function public.budget_consolidated_materials(p_budget_id uuid)
returns table (
  material_id uuid, code text, name text, unit text,
  required_qty numeric, unit_price numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with linhas as (
    select bp.counter, 0 as fonte, pigm.material_id, pigm.quantity as qty,
           coalesce(nullif(pigm.price_at_addition, 0), m.price, 0) as preco
    from budget_posts bp
    join post_item_groups pig on pig.budget_post_id = bp.id
    join post_item_group_materials pigm on pigm.post_item_group_id = pig.id
    join materials m on m.id = pigm.material_id
    where bp.budget_id = p_budget_id
    union all
    select bp.counter, 1, pm.material_id, pm.quantity,
           coalesce(nullif(pm.price_at_addition, 0), 0)
    from budget_posts bp
    join post_materials pm on pm.post_id = bp.id
    where bp.budget_id = p_budget_id
  )
  select l.material_id, m.code, m.name, m.unit,
         sum(l.qty)::numeric,
         (array_agg(l.preco order by l.counter, l.fonte))[1]
  from linhas l
  join materials m on m.id = l.material_id
  group by l.material_id, m.code, m.name, m.unit;
$$;

-- Substitui o "carrega 8 mil linhas para responder sim ou não".
create or replace function public.is_material_in_budget(p_budget_id uuid, p_material_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from budget_posts bp
    join post_item_groups pig on pig.budget_post_id = bp.id
    join post_item_group_materials pigm on pigm.post_item_group_id = pig.id
    where bp.budget_id = p_budget_id and pigm.material_id = p_material_id
  ) or exists (
    select 1 from budget_posts bp
    join post_materials pm on pm.post_id = bp.id
    where bp.budget_id = p_budget_id and pm.material_id = p_material_id
  );
$$;
```

`security invoker` de propósito: a RLS continua valendo, ninguém enxerga orçamento de outra
organização por dentro da função.

Índice que falta e o plano de execução pediu: `post_materials(post_id)` já existe, mas o
planner cai em Seq Scan porque a estatística está velha. Rodar `analyze post_materials;`
junto da migration.

### 1.2 Trocar as chamadas

| Arquivo | Hoje | Depois |
|---|---|---|
| [budgetMaterialQuantities.ts:113](src/services/supplies/budgetMaterialQuantities.ts#L113) | select aninhado + agregação em JS | `supabase.rpc('budget_consolidated_materials')` |
| [budgetMaterialQuantities.ts:179](src/services/supplies/budgetMaterialQuantities.ts#L179) `isMaterialInBudget` | carrega o BOM inteiro | `supabase.rpc('is_material_in_budget')` |
| [supplierQuotes.ts:1017](src/actions/supplierQuotes.ts#L1017) e [1443](src/actions/supplierQuotes.ts#L1443) | nenhuma mudança de assinatura | herdam o ganho |

A assinatura de `loadFullConsolidatedBudgetMaterials` continua devolvendo
`Map<string, BudgetMaterialQuantityRow>`, então nada mais no código precisa mudar.

Envolver o loader em `cache()` do React na mesma passada, para deduplicar dentro da mesma
requisição.

Remover a chamada duplicada em [saveManualSessionQuoteItem.ts:35 e 48](src/services/suppliers/saveManualSessionQuoteItem.ts#L35):
depois do `is_material_in_budget`, a segunda chamada só precisa de uma linha do BOM, não do mapa.

### 1.3 Verificação de paridade obrigatória antes do merge

Script temporário em `scripts/` que, para cada orçamento da base, roda os dois caminhos
(o JS atual e a RPC nova) e compara material a material.

Já sei o que ele vai acusar: em **245 de 7.981** pares orçamento/material o mesmo material
aparece com `price_at_addition` diferente em postes diferentes (3%). Nesses casos o preço
unitário de hoje depende da ordem em que o PostgREST devolveu as linhas, que não é
determinística porque nenhum `order by` cobre grupos e materiais. A função nova fixa a regra
(menor `counter`, grupo antes de avulso).

Isso não é regressão, é a remoção de um sorteio. E o impacto é estreito: `unit_price` só
alimenta o `budget_original_total`, o número de referência "orçamento original" da tela de
Cenários, não a decisão de compra. Ainda assim, conferir esse total antes e depois em dois
ou três orçamentos e registrar no PR.

**Ganho esperado:** abrir Conciliação e Cenários deixa de pagar 1,4 MB e a agregação em JS.
Salvar um vínculo manual deixa de pagar isso inteiro e passa a pagar um `exists`.

## Fase 2: parar de recalcular a mesma coisa três vezes

Puro código de aplicação, sem tocar no banco. Pode ir em paralelo com a Fase 1.

### 2.1 Escolher uma única fonte de atualização

Hoje o save avisa o Next (`revalidatePath`) **e** o cliente refaz a busca **e** chama
`router.refresh()`. Escolher o caminho do cliente, que já existe e é mais granular:

1. Remover `revalidatePath('.../cenarios')` de `updateNegotiatedPriceAction`
   ([supplierQuotes.ts:1761](src/actions/supplierQuotes.ts#L1761)),
   `saveSessionStockInputsAction` ([1705](src/actions/supplierQuotes.ts#L1705)),
   `saveIdealSelectionAction` ([1877](src/actions/supplierQuotes.ts#L1877)),
   `bulkSaveIdealSelectionsAction` ([1933](src/actions/supplierQuotes.ts#L1933)),
   `savePurchaseOrderAction` ([2019](src/actions/supplierQuotes.ts#L2019)) e
   `removeIdealSelectionAction` ([2264](src/actions/supplierQuotes.ts#L2264)).
2. Remover o `router.refresh()` do fim de `runRefresh`
   ([useSessionScenariosRefresh.ts:64](src/hooks/useSessionScenariosRefresh.ts#L64)). O hook
   já entrega os dados novos por `onScenarios`, o refresh do router só repete o trabalho.

Manter `revalidatePath` apenas onde a mudança sai da tela atual e precisa aparecer em outra
rota depois de navegar, que é o caso de `closeIdealScenarioAndUpdateMaterialsAction` e
`updateMaterialsFromSupplierAction` (mexem no catálogo global).

### 2.2 Não reagir ao próprio eco do Realtime

O listener de `supplier_quote_items`
([useSessionScenariosRefresh.ts:130](src/hooks/useSessionScenariosRefresh.ts#L130)) sobe sem
filtro no servidor e recebe evento de qualquer cotação da organização, inclusive do UPDATE
que o próprio usuário acabou de fazer.

1. Guardar num `Set` os ids de item que a própria aba acabou de salvar e ignorar o evento
   correspondente por alguns segundos.
2. Se e quando a Fase 3 entrar, filtrar do lado do servidor por `quote_id=in.(...)`.

### 2.3 Cortar as viagens redundantes dos saves

`saveManualMatchAction` ([supplierQuotes.ts:508](src/actions/supplierQuotes.ts#L508)) já
recebe `session_id` no join da primeira query e mesmo assim faz mais duas consultas depois do
update para redescobrir o que já tinha. Mesmo padrão em `acceptAiSuggestionAction`,
`rejectAiSuggestionAction` e `markQuoteConciliatedAction`. Usar o valor que já está em mãos.

Nessas quatro, reduzir os quatro `revalidatePath` para o mínimo: a conciliação já atualiza a
tela de forma otimista no cliente
([ConciliationCurationView.tsx:421](src/components/suppliers/ConciliationCurationView.tsx#L421)),
então o `revalidatePath` da própria rota de conciliação só serve para desfazer o trabalho que
o otimismo já fez.

### 2.4 Finalizar conciliação em uma tacada

`handleFinalizar` ([ConciliationCurationView.tsx:586](src/components/suppliers/ConciliationCurationView.tsx#L586))
dispara N server actions em paralelo, e o Next as serializa. Criar
`markQuotesConciliatedAction(quoteIds: string[])` com um único
`update(...).in('id', quoteIds)` e uma revalidação só.

**Ganho esperado:** salvar preço, OC, estoque ou seleção ideal passa de três ou quatro
recálculos completos para um. Combinado com a Fase 1, cada um desses recálculos também fica
muito mais barato.

## Fase 3: RLS das duas tabelas que ficaram para trás

Mesma cirurgia do commit `96a1149`, agora em `supplier_quote_items` e
`semantic_match_suggestions`.

### 3.1 Migration `supplies_items_org_rls`

1. `alter table ... add column org_id uuid references orgs(id)`.
2. Backfill a partir de `supplier_quotes.org_id` (e, nas sugestões, via o item).
3. Trigger de default no insert, seguindo o que as outras tabelas do módulo já fazem.
4. `create index ... (org_id)`.
5. Trocar as policies para `org_id = (select current_org_id())`, dropando as antigas com
   `EXISTS` correlacionado e `auth.uid()` solto.
6. Adicionar a policy de `DELETE` que falta em `semantic_match_suggestions`.

### 3.2 Decisão de escopo que precisa da sua palavra

Hoje essas duas tabelas filtram por `user_id`, então a conciliação **não** enxerga cotação
importada por um colega da mesma organização, enquanto `supplier_quotes` enxerga. Trocar
para `org_id` alinha o módulo com o resto do sistema, mas muda comportamento: quem importou
deixa de ser dono exclusivo do item.

Se a intenção era mesmo isolar por pessoa, então a correção não é trocar por `org_id` e sim
manter `user_id` com `(select auth.uid())` envolvido e uma coluna denormalizada, para acabar
com a subquery por linha sem mudar o escopo. As duas saídas resolvem a performance; a
escolha é de produto.

**Ganho esperado:** leitura de 3.922 itens deixa de rodar subquery correlacionada por linha.
Sensível na Conciliação, que é a tela que mais lê essas duas tabelas.

## Fase 4: abertura das telas

1. Paralelizar `getConciliationPayloadBySessionAction`
   ([supplierQuotes.ts:1455](src/actions/supplierQuotes.ts#L1455)): sessão, cotações e BOM
   podem ir juntos num `Promise.all`; só os itens dependem dos ids das cotações. Hoje são
   quatro idas em série.
2. Reaproveitar a sessão já lida pela página em vez de buscar de novo dentro do payload
   (usar `getQuotationSessionByIdCached`, que já é memoizado por requisição).
3. Cortar `supplier_quote_items(id, match_status)` de
   [sessao/[sessionId]/page.tsx:40](src/app/fornecedores/sessao/[sessionId]/page.tsx#L40):
   a tela só quer duas contagens, e hoje traz uma linha por item para contar no Node. Vale um
   `count` agregado ou uma view.
4. `Suspense` por seção na Conciliação, para o cabeçalho e a lista de cotações pintarem antes
   da tabela pesada.

## Ordem sugerida e esforço

| Fase | Depende de | Esforço | Risco |
|---|---|---|---|
| 0 instrumentar | nada | 30 min | nenhum |
| 2 saves e refresh | nada | meio dia | baixo, é remoção de trabalho duplicado |
| 1 BOM em SQL | 0 para medir | 1 dia com o script de paridade | médio, mexe em número exibido |
| 3 RLS | decisão de escopo | meio dia | médio, migration com backfill |
| 4 abertura | 1 | meio dia | baixo |

A Fase 2 vai primeiro na prática por ser a de melhor relação ganho/risco e não tocar no
banco. A Fase 1 dá o ganho maior, mas quer o script de paridade rodado antes.

## Como saber que acabou

Com `PERF=1`, no CURUMIN, as metas:

- abrir Conciliação: hoje ainda a medir, meta abaixo de 800 ms no servidor;
- abrir Cenários: mesma meta;
- salvar vínculo manual: meta abaixo de 200 ms, contra o BOM inteiro de hoje;
- salvar preço negociado: uma única execução de `calculateScenariosAction`, verificável
  contando as linhas `[perf]` no terminal.
