# Diagnóstico de produção: por que o sistema inteiro está lento

Levantado em 08/09/2026, com dados reais de produção (Vercel + Supabase), na
janela 17:30-19:40 UTC, em que só o Paulo estava usando o sistema.

## Resumo

O gargalo dominante **não está em Suprimentos**. Está no **Dashboard de
Precificação**, que recarrega o orçamento inteiro de cada precificação salva
toda vez que a página é montada. Como essa página era prefetchada
automaticamente em toda navegação, o sistema disparava dezenas de leituras de
2 MB por clique, saturava o banco, e **todo o resto ficava lento por
consequência**, Suprimentos incluído.

Números da janela medida, uma pessoa navegando:

| Evidência | Valor |
|---|---|
| Requisições ao banco em 2h10 | 6.210 |
| Pico por minuto | 489 |
| Leituras de `budget_posts` (a query de 2 MB) | 1.466 |
| Tempo médio de `budget_posts` | 16,4 s |
| Tempo médio de `budgets` | 6,3 s |
| Pior caso registrado | 135 s |
| Queries canceladas por statement timeout (1h) | 239 |
| Invocações serverless na Vercel (2h) | ~1.900 |

Quando o sistema está ocioso, a mesma rota responde em 0,30 s. Ou seja, não há
lentidão estrutural: **o sistema derruba a si mesmo sob o uso de uma pessoa.**

## Como isso foi medido

- `mcp vercel get_runtime_logs` e `get_runtime_errors` do projeto
  `orcaredeteste`, produção.
- Logs unificados do Supabase de produção (`edge_logs`, `postgres_logs`), com
  `response.origin_time` por requisição.
- Medição HTTP direta do domínio de produção, frio e quente.
- Leitura do código dos caminhos envolvidos.

## A cadeia causal

```
Você clica em qualquer lugar
        ↓
Link com `prefetch` força o Next a RENDERIZAR no servidor
todas as rotas visíveis (7 cards do Portal, todos os itens da sidebar)
        ↓
Uma delas é /tools/precificacao
        ↓
A página chama listSavedPricingBudgets, que resolve TODAS as
precificações salvas em Promise.all
        ↓
Cada precificação em modo "live" recarrega o ORÇAMENTO INTEIRO
(budgets + budget_posts com grupos, materiais e catálogo aninhados: ~2 MB)
        ↓
~11 orçamentos completos por montagem da página
        ↓
Banco satura: média de 16 s em budget_posts, 239 statements cancelados por
timeout em uma hora
        ↓
TODAS as outras queries ficam lentas, inclusive as de Suprimentos, que
passam a levar 3 a 6 segundos cada
        ↓
Funções serverless ficam presas esperando o banco e estouram
(um POST da Conciliação bateu o teto de 300 s)
```

## Os problemas, por impacto

### P1. O Dashboard de Precificação recarrega todos os orçamentos

[src/services/pricing/savedPricingBudgets.ts:345](src/services/pricing/savedPricingBudgets.ts#L345)

```ts
return Promise.all(rows.map((row) => resolveSavedPricingBudget(supabase, row, userId)));
```

`resolveSavedPricingBudget`, quando a linha está em modo `live`, chama
`getBudgetPricingSnapshot` → `getBudgetPostsForPricing`, que faz **duas**
leituras por linha: `budgets` e depois `budget_posts` com quatro níveis
aninhados (`post_types`, `post_item_groups`, `post_item_group_materials`,
`post_materials`, mais `materials` dentro de cada um).

É um N+1 clássico, só que cada "+1" custa 2 MB e 17 segundos.

Prova nos logs: das 1.466 leituras de `budget_posts`, **1.348 usam exatamente o
select da Precificação** (reconhecível por `post_types(id,name,code,description,shape,height_m,price)`).
Dividido pelas 118 montagens da rota na janela, dá ~11 orçamentos recarregados
por montagem, que é o número de precificações salvas em modo live.

A lista precisa de nome, cliente, cidade e totais. Ela não precisa de nenhum
poste. O orçamento completo só faz sentido quando alguém ABRE uma precificação.

### P2. Prefetch renderizando telas que ninguém abriu

Corrigido no commit `8dbb4b0`, ainda não publicado.

`prefetch` explícito nos Links de lista força o prefetch completo de rotas
dinâmicas: o servidor renderiza a página inteira, com as consultas dela, só
porque o link está na tela. Estava nos sete cards do Portal, em todos os itens
da sidebar (presente em toda tela), nos cards de sessão do Hub de Fornecedores
(em triplicata) e num `router.prefetch` da tela de Cenários.

Prova nos logs: as contagens por rota são quase idênticas entre módulos que
ninguém abriu: `/tarefas` 124, `/configuracoes` 122, `/tools/andamento-obra`
121, `/tools/precificacao` 118, `/propostas` 114, `/orcamentos` 112. Navegação
humana não produz esse padrão; fan-out automático produz.

P2 é o multiplicador de P1: sem ele, a Precificação só seria carregada quando
alguém abrisse a Precificação.

### P3. Suprimentos recarregando o BOM

Corrigido nos commits `a916919` e `c16695f`, ainda não publicados. O banco já
recebeu as funções novas.

Abrir Conciliação ou Cenários, e cada vínculo salvo, recarregava o orçamento
consolidado inteiro. Mesmo defeito de P1, em outro módulo e em menor escala: 136
das leituras de `budget_posts` usam o select de Suprimentos, contra 1.348 da
Precificação.

### P4. Função presa por 5 minutos na Conciliação

[src/actions/supplierQuotes.ts](src/actions/supplierQuotes.ts), em `processarConciliacaoAction`

```ts
after(async () => {
  await dispatchMatchToEdge(quoteIdTrimmed) // aguarda a Edge Function terminar
});
```

O `after()` mantém a função serverless viva até o callback terminar, e o
callback espera a Edge Function de match rodar a IA sobre a cotação inteira.
Registrado em produção hoje às 19:30:

```
Vercel Runtime Timeout Error: Task timed out after 300 seconds
route: /fornecedores/sessao/[sessionId]/conciliacao
```

Cinco minutos de uma instância ocupada sem entregar nada, e uma a menos para
atender as outras requisições. O disparo deveria ser fire-and-forget de verdade,
sem `await` no resultado da Edge, que já reporta progresso pela tabela de jobs.

### P5. O banco saturado, que é consequência e não causa

Com P1 e P2 rodando juntos, o Postgres de produção passa a cancelar trabalho:

```
canceling statement due to statement timeout   239 ocorrências em 1 hora
cron job 3 job startup timeout                 (nem os crons conseguem subir)
```

E o tempo médio de TUDO sobe, inclusive de endpoints triviais: `jwks.json` com
média de 996 ms, `current_module_access` com 5,4 s, um `select` de `budgets` por
chave primária levando 1,6 s.

É por isso que a lentidão parecia estar em todo lugar: estava mesmo. Só que a
origem era um caminho só.

## O que foi descartado, com evidência

- **Token de autenticação.** Os dois projetos assinam em ES256, então
  `getClaims()` valida a assinatura localmente, sem rede. O erro de refresh token
  que aparece no log local é de sessão expirada em dev, não do fluxo de produção.
- **Região.** Banco em us-east-1 (IPv6 AWS `2600:1f18`) e funções da Vercel em
  `iad1`. Mesma região, sem latência transatlântica.
- **Cold start como causa principal.** Existe (3,5 s a 7 s medidos), mas rotas
  ociosas respondem em 0,25 s a frio. O cold start é agravado pela saturação, não
  o contrário.
- **Bundle do cliente.** 723 KB comprimidos no Portal e 466 KB em Suprimentos.
  É gordo e vale enxugar um dia, mas não explica esperas de dezenas de segundos.

## Plano de correção

**1. Cortar o N+1 da Precificação.** A lista para de resolver o modo `live` por
linha. Duas opções, da mais simples para a melhor:

   a. A lista usa o snapshot salvo (`materials_snapshot`, que já está na tabela)
      e o modo `live` só é resolvido ao abrir uma precificação específica.
   b. O `valorMateriais` do modo `live` passa a ser calculado pela função
      `budget_consolidated_materials`, criada nesta leva, que devolve uma linha
      por material em vez de todos os postes. Mantém o valor sempre atualizado
      na lista e troca 2 MB por alguns KB.

**2. Publicar o que já está pronto.** Os commits de prefetch (P2) e de
Suprimentos (P3) estão na branch `perf/suprimentos-cotacao` e o banco de
produção já tem as migrations. Só falta o deploy.

**3. Soltar o `after()` da Conciliação (P4).** Disparar a Edge sem aguardar a
resposta, ou mover para a fila de jobs que o módulo já tem.

**4. Depois de 1 a 3, medir de novo.** A expectativa é que os 6.210 pedidos ao
banco em duas horas caiam para algumas centenas, e com isso o tempo médio das
queries volte para a casa das dezenas de milissegundos.

## Como validar

Com o mesmo percurso de hoje, repetir:

```sql
-- nos logs do Supabase de produção, janela de 1 hora
select log_attributes['request.path'] as caminho,
       count(*) as chamadas,
       round(avg(toFloat64OrNull(log_attributes['response.origin_time']))) as media_ms
from logs where source = 'edge_logs'
group by caminho order by chamadas desc limit 15;
```

Metas: `budget_posts` abaixo de 50 chamadas na janela, média geral abaixo de
500 ms, e zero `canceling statement due to statement timeout`.
