# Suprimentos e Cotação: mapeamento de desempenho

Levantamento feito em 08/09/2026, depois da refatoração de performance que atacou a
abertura de orçamento (commits `faf6e02`, `d5359c9`, `96a1149`, `0b3f297`, `4679aaf`).
O módulo de Suprimentos ficou de fora daquela leva e hoje carrega os mesmos vícios que
foram removidos do canvas, mais alguns próprios.

## 1. O território

### Rotas

| Rota | Server Component | Componente cliente |
|---|---|---|
| `/fornecedores` | `src/app/fornecedores/page.tsx` | `FornecedoresHub` (309 l.) |
| `/fornecedores/cadastro` | `cadastro/page.tsx` | `SupplierListView` (216 l.) |
| `/fornecedores/sessao/[id]` | `sessao/[sessionId]/page.tsx` | `SessionWorkspace` (238 l.) + `SessionExtractionRealtime` (666 l.) |
| `/fornecedores/sessao/[id]/conciliacao` | `conciliacao/page.tsx` | `ConciliationCurationView` (845 l.) |
| `/fornecedores/sessao/[id]/cenarios` | `cenarios/page.tsx` | `SessionScenariosView` (1448 l.) |
| `/fornecedores/sessao/[id]/dre` | `dre/page.tsx` | `DrePainel` (186 l.) |

### Camada de dados

`src/actions/supplierQuotes.ts` concentra **2411 linhas** e 30 server actions: leitura de
conciliação, cálculo de cenários, saves de vínculo, preço negociado, estoque, OC, cenário
ideal e fechamento. É o arquivo mais quente do módulo e o mais difícil de mexer.

Apoio: `actions/quotationSessions.ts` (418), `actions/suppliers.ts` (361), `actions/dre.ts` (191),
`actions/materials.ts` (219), `actions/purchaseOrders.ts` (54), `actions/sessionNotes.ts` (121).

Serviços: `services/suppliers/*` (extração, semantic match, auto match), `services/supplies/*`
(BOM consolidado, filtros, aplicação de preços), `services/scenarios/*` (export ideal).

### Volume real (base dev)

| Tabela | Linhas |
|---|---|
| `post_item_group_materials` | 97.079 |
| `post_materials` | 9.500 |
| `budget_posts` | 4.167 |
| `supplier_quote_items` | 3.922 |
| `materials` | 2.443 |
| `supplier_quotes` | 121 |

Maior orçamento (CURUMIN): 229 postes, 7.332 linhas de material em grupo, 291 avulsas.

## 2. Os cinco gargalos, por impacto

### G1. O BOM do orçamento inteiro é recarregado a cada clique

`loadFullConsolidatedBudgetMaterials` ([src/services/supplies/budgetMaterialQuantities.ts:113](src/services/supplies/budgetMaterialQuantities.ts#L113))
puxa todos os postes do orçamento com `post_item_groups`, `post_item_group_materials`,
`post_materials` e `materials` aninhados, limite de 2000 postes, e consolida em JavaScript.
Para o CURUMIN isso é da ordem de 8 mil linhas com objetos aninhados, serializadas pelo
PostgREST e reprocessadas no Node a cada chamada.

Quem chama:

- abrir Conciliação, dentro de `getConciliationPayloadBySessionAction` ([supplierQuotes.ts:1443](src/actions/supplierQuotes.ts#L1443));
- abrir Cenários, dentro de `calculateScenariosAction` ([supplierQuotes.ts:1017](src/actions/supplierQuotes.ts#L1017));
- **cada vínculo manual salvo**, via `assertMaterialInBudgetScope` ([supplierQuotes.ts:531](src/actions/supplierQuotes.ts#L531));
- **cada sugestão da IA aceita**, mesma coisa ([supplierQuotes.ts:640](src/actions/supplierQuotes.ts#L640));
- cotação manual, **duas vezes na mesma função** ([saveManualSessionQuoteItem.ts:35 e 48](src/services/suppliers/saveManualSessionQuoteItem.ts#L35));
- semantic match nível 2 ([runSemanticMatchLevel2.ts:53](src/services/suppliers/runSemanticMatchLevel2.ts#L53)).

O caso mais gritante é o `assertMaterialInBudgetScope`: ele carrega 8 mil linhas para
responder uma pergunta booleana ("esse material_id está no BOM?"). É a resposta para
"salvar está demorado".

### G2. Salvar em Cenários recalcula os cenários três ou quatro vezes

Salvar um preço negociado dispara, em sequência:

1. `updateNegotiatedPriceAction` faz `revalidatePath('/cenarios')` ([supplierQuotes.ts:1761](src/actions/supplierQuotes.ts#L1761)), o que já força o Next a re-renderizar a rota e rodar `calculateScenariosAction` de novo, dentro da mesma resposta da Server Action;
2. o cliente chama `refreshScenarios()`, que roda `calculateScenariosAction` outra vez ([useSessionScenariosRefresh.ts:44](src/hooks/useSessionScenariosRefresh.ts#L44));
3. o mesmo `runRefresh` termina com `router.refresh()`, terceira rodada;
4. o listener Realtime de `supplier_quote_items` recebe o UPDATE que o próprio save gerou e agenda uma quarta ([useSessionScenariosRefresh.ts:130](src/hooks/useSessionScenariosRefresh.ts#L130)).

Cada rodada arrasta o G1 junto. O mesmo padrão vale para OC, estoque, seleção ideal e
seleção em lote.

Detalhe adicional: esse listener de `supplier_quote_items` sobe **sem filtro no servidor**,
então recebe evento de qualquer cotação da organização e filtra no cliente.

### G3. RLS legado nas duas tabelas mais lidas da conciliação

`supplier_quote_items` e `semantic_match_suggestions` nunca receberam `org_id` e ficaram
fora da migração `96a1149`. As policies delas ainda são do modelo antigo:

```sql
-- supplier_quote_items_select
EXISTS (SELECT 1 FROM supplier_quotes sq
        WHERE sq.id = supplier_quote_items.quote_id AND sq.user_id = auth.uid())

-- semantic_match_suggestions_select: pior, junta duas tabelas
EXISTS (SELECT 1 FROM supplier_quote_items sqi
        JOIN supplier_quotes sq ON sq.id = sqi.quote_id
        WHERE sqi.id = ... AND sq.user_id = auth.uid())
```

Duas consequências: subquery correlacionada por linha em cima de 3.922 itens, e `auth.uid()`
fora de `(select ...)`, ou seja, reavaliado linha a linha em vez de virar InitPlan. Todo o
resto do módulo já usa `org_id = (select current_org_id())`.

Efeito colateral de escopo, não de performance: essas duas tabelas ainda filtram por
`user_id`, então a conciliação não enxerga cotação de colega da mesma organização, enquanto
`supplier_quotes` enxerga. Vale conferir se isso é intencional.

### G4. Saves fazem viagens redundantes ao banco

`saveManualMatchAction` ([supplierQuotes.ts:508](src/actions/supplierQuotes.ts#L508)) já
recebe `session_id` no join da primeira query, e mesmo assim faz mais duas consultas depois
do update só para redescobrir o `quote_id` e o `session_id` que já tinha em mãos
([supplierQuotes.ts:576-590](src/actions/supplierQuotes.ts#L576)). `acceptAiSuggestion`,
`rejectAiSuggestion` e `markQuoteConciliated` repetem o padrão.

Some ao fato de que cada uma dessas actions chama `revalidatePath` em quatro rotas
(`/fornecedores`, sessão, conciliação, cenários). Como a chamada vem do cliente, o Next
re-renderiza a rota atual e devolve o payload RSC junto da resposta, ou seja, todo save de
vínculo reexecuta a página de conciliação inteira, incluindo o G1.

### G5. Finalizar conciliação dispara N ações concorrentes

`handleFinalizar` ([ConciliationCurationView.tsx:586](src/components/suppliers/ConciliationCurationView.tsx#L586))
faz `Promise.all` de `markQuoteConciliatedAction` por cotação. Com 5 fornecedores são 5
server actions simultâneas, cada uma com 3 queries e 4 `revalidatePath`, e o Next serializa
server actions da mesma sessão. Deveria ser um único update com `.in('id', ids)`.

## 3. Sobre "abrir"

A página de conciliação encadeia em série: sessão, jobs, payload. E o payload por sua vez
faz sessão de novo, cotações, itens com sugestões aninhadas e o BOM completo, também em
série ([supplierQuotes.ts:1455-1530](src/actions/supplierQuotes.ts#L1455)). Nenhum
`Promise.all`, ao contrário da página de Cenários, que ao menos paraleliza as cinco leituras
de topo.

A busca de sessão é repetida: `getQuotationSessionByIdCached` na página, e de novo dentro do
payload sem passar pelo `cache()`.

## 4. Plano de ataque sugerido

Ordem por relação impacto/risco:

**Fase 1, o BOM (resolve G1, o maior ganho isolado)**
1. Trocar `assertMaterialInBudgetScope` por uma checagem pontual no banco, uma função SQL
   `is_material_in_budget(budget_id, material_id)` ou um `select ... limit 1` sobre as duas
   tabelas de vínculo. Deixa de carregar 8 mil linhas para responder sim ou não.
2. Criar uma view materializada ou função SQL `budget_consolidated_materials(budget_id)` que
   faça a agregação no Postgres e devolva uma linha por material (algumas centenas em vez de
   milhares). Consolidar em JS um `SUM` que o banco faz melhor é o padrão que a refatoração
   do canvas já removeu em outro lugar.
3. Enquanto a view não existe, envolver o loader em `cache()` do React para pelo menos
   deduplicar dentro da mesma requisição.

**Fase 2, os saves (resolve G2, G4, G5)**
4. Tirar os `revalidatePath` de cenários das actions de save e deixar o refresh explícito do
   cliente ser a única fonte de atualização, ou o contrário, mas não os dois.
5. Remover o `router.refresh()` de dentro do `runRefresh`.
6. Filtrar o Realtime de `supplier_quote_items` por cotação no servidor e ignorar eventos
   originados pelo próprio save.
7. Aproveitar o `session_id` que já vem no join e cortar as duas queries redundantes de
   `saveManualMatchAction` e irmãs.
8. `markQuoteConciliatedAction` vira update em lote.

**Fase 3, RLS (resolve G3)**
9. Adicionar `org_id` em `supplier_quote_items` e `semantic_match_suggestions`, backfill e
   troca das policies para `org_id = (select current_org_id())`, exatamente como foi feito
   nas tabelas-filhas do canvas. Índice em `(org_id)` junto.

**Fase 4, abertura**
10. Paralelizar as leituras de `getConciliationPayloadBySessionAction` com `Promise.all` e
    reaproveitar a sessão já lida pela página.
11. Considerar `Suspense` por seção na conciliação, para o cabeçalho e a lista de cotações
    aparecerem antes da tabela pesada.

## 5. Como medir

`src/lib/perf/serverTiming.ts` já existe e está desligado por padrão. Instrumentar
`getConciliationPayloadBySessionAction`, `calculateScenariosAction` e
`loadFullConsolidatedBudgetMaterials`, rodar `PERF=1 npm run dev` e registrar o antes e o
depois de cada fase. Sem número, qualquer uma dessas mudanças vira palpite.
