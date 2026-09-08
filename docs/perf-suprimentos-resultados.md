# Suprimentos e Cotação: o que foi feito e o que mudou

Execução do [plano](perf-suprimentos-plano-execucao.md), em 08/09/2026, branch
`perf/suprimentos-cotacao`. O diagnóstico que originou tudo está em
[perf-suprimentos-cotacao-mapeamento.md](perf-suprimentos-cotacao-mapeamento.md).

## Medições

Medido de ponta a ponta contra o Supabase de dev (inclui rede e serialização),
orçamento CURUMIN, 229 postes, mediana de 5 execuções:

| Operação | Antes | Depois | |
|---|---|---|---|
| Carregar o BOM do orçamento | 1.476 ms | 263 ms | 5,6x |
| Checar se um material está no orçamento | 728 ms | 246 ms | 3,0x |
| Payload JSON do BOM | 2,04 MB | alguns kB | |

O piso de ~250 ms nas duas colunas da direita é latência de ida e volta até o
banco, não trabalho. Rodando na Vercel, perto do banco, a proporção melhora.

Esses números multiplicam, porque cada operação da tela pagava o BOM várias
vezes:

- **abrir Conciliação**: pagava 1 BOM em série com o resto; agora paga 1 BOM
  barato, em paralelo com as outras leituras;
- **salvar um vínculo manual**: pagava a checagem de escopo (728 ms) mais duas
  consultas redundantes, e o `revalidatePath` da própria rota reexecutava o
  payload inteiro da conciliação, com mais um BOM dentro. Agora é um `exists` de
  246 ms mais o update;
- **salvar preço, OC, estoque ou seleção ideal**: rodava `calculateScenariosAction`
  de três a quatro vezes, cada uma com um BOM de 1.476 ms dentro. Agora roda uma,
  com um BOM de 263 ms.

## O que mudou

### Banco (3 migrations, aplicadas em dev)

`20260908120000_supplies_budget_bom_functions.sql`
- `budget_consolidated_materials(budget_id)`: a consolidação do BOM passou para o
  Postgres. Devolve uma linha por material em vez das 7.623 linhas aninhadas que
  o Node agregava.
- `is_material_in_budget(budget_id, material_id)`: a pergunta booleana que rodava
  a cada save agora é um `exists`.
- Ambas `security invoker`, então a RLS continua valendo por dentro.

`20260908121000_supplies_items_org_rls.sql`
- `org_id` em `supplier_quote_items` e `semantic_match_suggestions`, com backfill,
  portão de integridade, trigger de derivação e `NOT NULL`.
- Policies trocadas de `EXISTS (... auth.uid())` correlacionado por linha para
  `org_id = (SELECT current_org_id())`.
- Adicionada a policy de `DELETE` que faltava em `semantic_match_suggestions`.
- **Muda comportamento**: um colega da mesma organização passa a enxergar os
  itens e as sugestões das cotações da organização. Antes enxergava a cotação na
  lista e ela abria vazia, porque o filho ainda filtrava por `user_id` enquanto o
  pai já filtrava por organização.

`20260908122000_supplies_items_fk_indexes.sql`
- Índices nas FKs para `materials`, apontados pelo linter.

### Aplicação

| Arquivo | Mudança |
|---|---|
| `services/supplies/budgetMaterialQuantities.ts` | BOM via RPC; `isMaterialInBudget` vira `exists`; novo `loadBudgetMaterialRow` para quem só quer um material |
| `services/suppliers/saveManualSessionQuoteItem.ts` | duas varreduras do orçamento viraram uma consulta |
| `actions/supplierQuotes.ts` | `revalidateAfterConciliationWrite` e `revalidateAfterScenarioWrite`: nenhuma action revalida mais a rota de onde foi chamada; saves não refazem as consultas que já tinham em mãos; `markQuotesConciliatedAction` em lote; leituras da conciliação em `Promise.all` |
| `hooks/useSessionScenariosRefresh.ts` | sem `router.refresh()`; `markLocalWrite` para não reagir ao eco do próprio save |
| `components/suppliers/SessionScenariosView.tsx` | marca a escrita local ao salvar preço negociado |
| `components/suppliers/ConciliationCurationView.tsx` | Finalizar manda um update em lote em vez de N actions |
| `app/fornecedores/sessao/[sessionId]/page.tsx` e `.../conciliacao/page.tsx` | leituras independentes em paralelo |

Uma correção veio a reboque da migration de `org_id`: `calculateScenariosAction`
filtrava as cotações por `supplier_quotes.user_id`. Com a Conciliação passando a
enxergar as cotações da organização, os Cenários continuariam ignorando as de um
colega, e o efeito seria pior que uma inconsistência de tela: o material
apareceria sem oferta e sairia da comparação de preço. O filtro saiu; quem isola
por organização é a RLS.

### Verificação

`scripts/check-bom-parity.mjs` compara o caminho antigo com a RPC nova em todos
os orçamentos da base. Resultado em 105 orçamentos:

```
orcamentos identicos:       97/105
divergencias de presenca:   0
divergencias de quantidade: 0
divergencias de preco:      35
```

As 35 são o caso previsto no plano: material que aparece com `price_at_addition`
diferente em postes diferentes. No caminho antigo o vencedor dependia da ordem
não determinística do PostgREST; agora a regra é fixa. Afeta apenas o
`budget_original_total`, o número de referência da tela de Cenários.

Os triggers de `org_id` foram testados em transação desfeita: o valor derivado
bate com o da cotação pai nas duas tabelas.

A RLS nova foi verificada com `EXPLAIN ANALYZE` rodando como um usuário
autenticado real (`set role authenticated` mais as claims do JWT). O plano da
leitura de itens da Conciliação agora traz:

```
Filter: (org_id = (InitPlan 1).col1)
```

Uma comparação direta contra um InitPlan avaliado uma vez, no lugar do `EXISTS`
correlacionado que rodava por linha. Vale registrar que **em dev o ganho de tempo
não é mensurável**: são 3.922 itens no total e a maior sessão tem 581, volume em
que qualquer plano é rápido. A validação aqui é estrutural, e é a mesma aposta da
migration do canvas, que só mostrou serviço em produção.

O app sobe e as quatro rotas do módulo compilam e respondem
(`/fornecedores/sessao/[id]`, `/conciliacao`, `/cenarios`, `/dre`), sem erro no
log do `next dev`. Isso testa o boot, não o comportamento logado.

`tsc --noEmit` e `npm run build` passam.

## Como aplicar em produção

As três migrations estão aplicadas só em dev. Elas são idempotentes
(`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`) e a de `org_id`
aborta sozinha se encontrar linha órfã, desfazendo tudo, porque roda numa
transação só.

Ordem e o que cada uma faz:

1. `20260908120000_supplies_budget_bom_functions.sql`: só cria funções. Seguro a
   qualquer hora, e o código novo depende dela, então **vai antes do deploy**.
2. `20260908121000_supplies_items_org_rls.sql`: adiciona coluna, faz backfill,
   cria trigger, troca policies. É a que pede janela tranquila: enquanto roda, as
   duas tabelas ficam travadas para escrita. Com o volume de prod é questão de
   segundos, mas evite fazer no meio de uma extração de PDF.
3. `20260908122000_supplies_items_fk_indexes.sql`: dois índices.

Dois caminhos, tanto faz:

```bash
supabase db push          # confere o que vai subir antes de confirmar
```

Ou, para rodar pelo SQL Editor do dashboard, o arquivo
[docs/sql/aplicar-perf-suprimentos-prod.sql](sql/aplicar-perf-suprimentos-prod.sql)
é a concatenação das três na ordem certa, com as conferências no fim e o registro
no histórico de migrations para o CLI não tentar reaplicar depois. Cole inteiro e
execute de uma vez: assim o Postgres trata como uma transação só, e qualquer
falha desfaz tudo.

A idempotência foi testada de verdade, reaplicando os statements críticos em dev:
a coluna, o backfill, o `NOT NULL`, o índice, a policy e o comentário rodam de
novo sem erro.

Depois de aplicar, três conferências rápidas:

```sql
-- 1. nenhuma linha ficou sem org_id (a migration já aborta, isto é cinto e suspensório)
select count(*) from supplier_quote_items where org_id is null;

-- 2. as policies novas estão no lugar
select tablename, policyname, qual from pg_policies
 where tablename in ('supplier_quote_items','semantic_match_suggestions');

-- 3. o BOM bate com o que a tela mostra
select count(*), sum(required_qty) from budget_consolidated_materials('<um budget_id>');
```

E na aplicação: abrir a Conciliação de uma sessão com cotações e confirmar que os
itens aparecem. Se algo sair errado, o caminho de volta é restaurar as policies
antigas (estão no git, em `20260404000000_supplier_module.sql` e
`20260409101000_...`); a coluna `org_id` pode ficar, ela não atrapalha.

Vale rodar `scripts/check-bom-parity.mjs` apontando para prod (via `.env` com as
chaves de prod) antes de confiar nos números da tela de Cenários, já que a
divergência de preço documentada acima depende dos dados de cada base.

## O que falta

1. **Rodar as migrations em produção.** Não consegui fazer daqui: o classificador
   de permissões do Claude Code bloqueia acesso ao projeto de produção neste
   modo. O runbook acima está pronto para `supabase db push`.
2. **Medir com `PERF=1` no fluxo real.** A instrumentação está pronta
   (`timeServer` em `calculateScenariosAction`,
   `getConciliationPayloadBySession` e nas funções do BOM), mas exige navegar
   logado. Os números acima vieram de benchmark direto contra o banco, que não
   inclui o custo de render do React.
3. **O que foi deliberadamente não feito:** trocar o embed
   `supplier_quote_items (id, match_status)` da página da sessão por contagem
   agregada. A maior sessão da base tem 581 itens, então o embed custa alguns kB,
   e a complexidade não se paga. Fica registrado para o dia em que crescer.
4. Dois problemas de lint pré-existentes continuam em
   `ConciliationCurationView.tsx` (ref acessada no render) e
   `SessionScenariosView.tsx` (dependência faltando). Não foram tocados por serem
   de outro assunto.
