# Plano para deixar o sistema rápido

Baseado no [diagnóstico de produção](perf-diagnostico-producao.md) de 08/09/2026.
A ordem aqui é por relação ganho/risco, não por dificuldade.

## Onde estamos e onde queremos chegar

| Medida (você sozinho, 2h de uso) | Hoje | Meta |
|---|---|---|
| Pedidos ao banco | 6.210 | menos de 600 |
| Pico por minuto | 489 | menos de 60 |
| Leituras de `budget_posts` (2 MB cada) | 1.466 | menos de 50 |
| Tempo médio de `budget_posts` | 16,4 s | menos de 500 ms |
| Statements cancelados por timeout (1h) | 239 | 0 |
| Abrir uma tela, sistema em uso | 3 a 20 s | menos de 1 s |

A última linha é a que você sente. As outras são as causas dela.

Referência que prova que a meta é alcançável: **com o sistema ocioso, as mesmas
telas já respondem em 0,25 a 0,30 s hoje.** Não é preciso reescrever nada para
chegar lá, é preciso parar de fazer trabalho desnecessário.

## Situação em 08/09/2026

| Fase | Estado |
|---|---|
| 0. Publicar o que estava pronto | pendente, é deploy |
| 1. N+1 da Precificação | feito, na branch |
| 2. Conciliação presa em `after()` | feito, na branch (exige deploy da Edge) |
| 3. Custo fixo por tela | aguardando medição pós-deploy |
| 4. Navegador | aguardando medição pós-deploy |
| 5. Impedir que volte | feito |

## Fase 0: publicar o que já está pronto

Nada a escrever, só publicar. O banco de produção já recebeu as migrations.

- Commits `a916919`, `c16695f`, `be78c6d`, `8dbb4b0`, `0d14eaf`, na branch
  `perf/suprimentos-cotacao`.
- Corta o fan-out de prefetch (cada navegação deixa de renderizar 7 telas que
  ninguém pediu) e o recarregamento do BOM em Suprimentos.

**Esforço:** minutos. **Risco:** baixo, é remoção de trabalho.
**Ganho esperado:** o volume de invocações cai para perto de um oitavo, e as
136 leituras pesadas de Suprimentos somem.

## Fase 1: matar o N+1 da Precificação

O maior ganho isolado do plano. Hoje montar a lista de precificações recarrega
~11 orçamentos completos.

Em [savedPricingBudgets.ts:345](src/services/pricing/savedPricingBudgets.ts#L345),
`listSavedPricingBudgets` resolve cada linha com `resolveSavedPricingBudget`, que
no modo `live` chama `getBudgetPostsForPricing` e traz todos os postes.

**A correção:** a lista para de carregar postes. Duas peças:

1. `listSavedPricingBudgets` passa a usar o `materials_snapshot` que já está
   gravado na tabela, sem resolver `live` por linha.
2. Onde o valor precisa estar atualizado, usar a função
   `budget_consolidated_materials` (já criada e no ar em produção), que devolve
   uma linha por material em vez de todos os postes. Troca ~2 MB por alguns KB e
   mantém o número correto.

O modo `live` continua existindo e sendo resolvido quando alguém **abre** uma
precificação, que é onde ele faz sentido.

**Esforço:** meio dia, incluindo conferir os totais na tela antes e depois.
**Risco:** médio-baixo. Mexe em número exibido, então precisa de comparação
lado a lado em duas ou três precificações.
**Ganho esperado:** as 1.348 leituras de 2 MB desaparecem. É o que hoje entope
o banco.

### Feito

`listSavedPricingBudgets` não chama mais `resolveSavedPricingBudget`. A lista
agora faz duas consultas fixas (a tabela de precificações e os cabeçalhos dos
orçamentos em modo live, em um `in`) mais uma chamada de
`budget_consolidated_materials` por orçamento live. Nenhum poste é carregado.

`resolveSavedPricingBudget` continua igual e é o caminho de quem ABRE uma
precificação, que é onde a lista de materiais item a item faz falta.

Conferência do número exibido, na base de dev: das 9 precificações em modo
live, o total consolidado bate exatamente com o gravado em 7. As duas que
diferem são orçamentos que mudaram depois de salvos, que é justamente o que o
modo live existe para mostrar. Onde o preço de um material é ambíguo (o mesmo
material com `price_at_addition` diferente em postes diferentes), a diferença
máxima possível na base inteira é de R$ 16,00 em um total de R$ 30.740, e nesse
caso o valor antigo era sorteio, não referência.

## Fase 2: soltar a função presa na Conciliação

`processarConciliacaoAction` usa `after()` e dentro dele **aguarda** a Edge
Function da IA terminar. A instância fica viva até 5 minutos, e hoje bateu o teto
de 300 s em produção.

**A correção:** disparar a Edge sem aguardar o resultado, ou empurrar para a fila
de `extraction_jobs`, que o módulo já tem e já reporta progresso em tempo real
para a tela.

**Esforço:** algumas horas. **Risco:** baixo, mas exige conferir que o
acompanhamento na tela continua funcionando pelo Realtime.
**Ganho esperado:** nenhuma instância presa, fim dos timeouts de 300 s.

### Feito

A inversão foi feita do lado da Edge, que é onde ela resolve de vez: a
`match-supplier-quote` valida a cotação, responde `202` e roda a conciliação em
segundo plano com `EdgeRuntime.waitUntil`. O `after()` do lado do Next continua
lá, mas agora só segura a instância até o aceite, alguns milissegundos, com um
teto de 20 s por garantia. Desistir de esperar não cancela nada: o trabalho vive
na Edge e o fim é gravado no status de `supplier_quotes`, que a tela acompanha
por Realtime.

**Atenção no deploy:** a Edge Function precisa ir junto com o app. Se o app
novo subir antes dela, o teto de 20 s passa a cortar uma conciliação que ainda
só responde no fim.

O mesmo defeito existe em `createQuoteAndDispatchExtractAction`, que espera a
`extract-supplier-pdf` terminar dentro de um `after()`. Não foi mexido porque
está fora do escopo desta fase, mas é a mesma correção e o mesmo risco de
instância presa.

## Fase 3: enxugar o custo fixo de cada tela

Depois das fases acima o volume cai muito, e aí vale olhar o que sobra por
render. Nos logs de hoje, por trás de cada página vinham também:

- `notifications`: 313 chamadas
- `quotation_sessions`: 238
- `profiles`: 188
- `current_module_access`: 429

Boa parte desaparece junto com o prefetch. O que restar deve ser medido de novo
antes de mexer, porque com o banco saudável essas consultas custam dezenas de
milissegundos e podem não valer trabalho.

**Esforço:** a definir depois de medir. **Risco:** baixo.

## Fase 4: o lado do navegador

Duas coisas conhecidas, ambas de percepção:

1. `AppContext` segura a tela em "Inicializando aplicação..." enquanto busca
   orçamentos, concessionárias e pastas. Medido em 3 segundos no seu log. Vale
   soltar a tela antes e carregar em segundo plano.
2. O JavaScript é gordo: 723 KB comprimidos no Portal, 466 KB em Suprimentos.
   Não explica esperas de dezenas de segundos, mas pesa no primeiro
   carregamento e em máquina mais fraca.

**Esforço:** um a dois dias. **Risco:** baixo para o item 1, médio para o 2.
**Ganho:** percepção de abertura, principalmente no primeiro acesso do dia.

## Fase 5: impedir que volte

O sistema chegou aqui porque três decisões razoáveis sozinhas viraram um
problema juntas. Sem uma trava, volta.

1. **Regra sobre prefetch:** `prefetch` explícito só com justificativa escrita no
   código. O padrão do Next já dá navegação instantânea sem renderizar a página
   inteira. Vale um comentário em `AdminPortal` e `AppSidebar` explicando, que já
   está lá nos commits desta leva.
2. **Regra sobre listagem:** nenhuma tela de lista pode carregar o detalhe
   completo de cada item. Se o valor precisa ser recalculado, isso vira uma
   função no banco que devolve o agregado, como
   `budget_consolidated_materials`.
3. **Um olho no painel:** uma vez por semana, rodar a consulta de validação do
   diagnóstico nos logs do Supabase. Se `budget_posts` aparecer com centenas de
   chamadas, alguma tela voltou a carregar orçamento inteiro sem precisar.

### Feito

As três regras saíram do papel:

1. O comentário sobre prefetch está em `AdminPortal` e em `AppSidebar`, nos dois
   lugares onde a tentação de voltar a usar `prefetch` é maior.
2. A regra de listagem está escrita em cima de `listSavedPricingBudgets`, que é
   onde ela foi quebrada, com o número do estrago junto.
3. A conferência semanal virou arquivo pronto para colar:
   [docs/sql/perf-validacao-semanal.sql](sql/perf-validacao-semanal.sql), com as
   três consultas, onde rodar (é o Logs Explorer, não o SQL Editor) e as metas.

## Sequência recomendada

```
Fase 0 (publicar)  →  medir  →  Fase 1 (Precificação)  →  medir
      →  Fase 2 (Conciliação)  →  medir  →  decidir se 3 e 4 valem
```

Medir entre as fases não é formalidade: depois da Fase 0 e 1 o sistema deve
mudar de patamar, e o que sobrar de lentidão pode ser outra coisa, que só
aparece quando o barulho principal some.

## A consulta de validação

Nos logs do Supabase de produção, mesma janela de uso:

```sql
select log_attributes['request.path'] as caminho,
       count(*) as chamadas,
       round(avg(toFloat64OrNull(log_attributes['response.origin_time']))) as media_ms
from logs where source = 'edge_logs'
group by caminho order by chamadas desc limit 15;
```

E o teste de fumaça, que não precisa de ferramenta nenhuma: abrir o Portal, ir
até uma sessão de Suprimentos e voltar. Se cada passo responder abaixo de um
segundo com o sistema em uso, chegamos.
