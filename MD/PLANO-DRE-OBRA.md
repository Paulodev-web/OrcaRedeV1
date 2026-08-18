# Plano — DRE de Obra (Suprimentos → Resultado)

> Escrito em 17/08/2026. Referência: planilha "DRE Obra Elétrica"
> (`1NtlcB6jnq2FRZqQmsM5RRXW1OUPisP6N_dRlsfeOzEQ`, aba PLANILHA).
> Decisões travadas: âncora é `budget_id`; receita vem de proposta + precificação.
> Estado atual: **nada existe** do lado de execução financeira. Zero migrations.

---

## 1. O que a planilha é

Dois blocos que se olham no espelho e um rodapé de resultado.

| Bloco | Colunas | Total da obra-exemplo |
|---|---|---|
| Planejamento Obra | Descrição, Valor, **Grupo** | R$ 390.301,20 |
| Execução da Obra | Nº OC, Empresa, Frete, Valor OC, Valor Frete, **Grupo**, Entrega | R$ 346.725,33 |
| Resultado | Contrato, Lucro planejado, Lucro real, Margem | R$ 420.000 → 17,45% |

Composição planejada:

| Grupo | Valor | % |
|---|---|---|
| Material | R$ 325.681,20 | 83,44% |
| Mão de obra | R$ 32.300,00 | 8,28% |
| Imposto | R$ 27.900,00 | 7,15% |
| Comissão | R$ 1.980,00 | 0,51% |
| Adicional | R$ 1.626,00 | 0,42% |
| Frete | R$ 814,00 | 0,21% |

**A coluna `Grupo` é a peça central.** Ela aparece nos dois blocos e é a única coisa
que torna orçado e comprado comparáveis. Sem uma taxonomia única no banco, não
existe DRE — existem duas listas que não se somam.

---

## 2. O que já temos, e o que falta

### 2.1 Orçado — resolvido, só falta classificar

`saved_pricing_budgets` (`20260526151000`, estendida por `20260803130000`) já guarda
a estrutura inteira do bloco de planejamento:

| Planilha | Coluna existente |
|---|---|
| Material | `valor_materiais` |
| Mão de obra / Comissão / Adicional / Frete | `cost_items` JSONB → `CostItem[]` |
| Imposto | `imposto_valor` (derivado de `imposto_percent`) |
| Lucro planejado | `lucro_liquido` |
| Preço ao cliente | `preco_total_cliente` |

O `CostItem` (`src/components/precificacao/types.ts:7`) tem `tipo`
(`unitario | maoDeObra | percentual`), que é *como calcula* — **não** *que grupo é*.
Uma comissão de 3% e um imposto de 7% são ambos `percentual`. Falta `grupo`.

### 2.2 Comprado — existe uma etiqueta, não uma OC

A cadeia de suprimentos hoje:

```
quotation_sessions → supplier_quotes → supplier_quote_items.preco_negociado
                                     → scenario_ideal_selections  (fornecedor escolhido)
                                     → scenario_purchase_orders   (nº da OC)
```

E `scenario_purchase_orders` (`20260701000000`) é só isto:

```sql
session_id  UUID
material_id UUID
oc_number   TEXT
UNIQUE (session_id, material_id, user_id)
```

Uma **etiqueta de texto por material**. Não tem valor, fornecedor, frete, data de
entrega nem status. A planilha trata OC como documento com cabeçalho e N itens.
São modelos incompatíveis — não dá pra estender, tem que promover.

### 2.3 Os buracos, nomeados

| # | Buraco | Consequência |
|---|---|---|
| 1 | OC não é entidade | Sem valor de OC não existe "Custo Executado" |
| 2 | **Frete não existe em nenhuma tabela** do schema (grep em todas as migrations: zero) | Duas colunas da planilha sem origem |
| 3 | Realizado cobre só material | Compara 100% do orçado contra 83% do comprado |
| 4 | Sem taxonomia de grupo compartilhada | Os dois blocos não se somam |
| 5 | Sem "opção aceita" na proposta | A receita da DRE não tem fonte (ver §3) |
| 6 | `scenario_*` ainda é `user_id`-only, o resto migrou pra `org_id` (`20260807140000`) | Luan não enxerga a DRE da obra do Paulo |

---

## 3. Receita — de onde vem o valor de contrato

Decisão: **da proposta**, com fallback na precificação.

`proposal_pricing_options` (`20260803132000:76`) já congela `grand_total`,
`material_total` e `labor_total` por opção de preço. É o número certo: é o que o
cliente viu e assinou, imune a reprecificação posterior.

O que falta é dizer **qual opção o cliente fechou**. Hoje existe só
`is_recommended` (o que a ON sugeriu), que não é a mesma coisa.

```sql
ALTER TABLE public.proposals
  ADD COLUMN accepted_pricing_option_id UUID NULL
    REFERENCES public.proposal_pricing_options(id) ON DELETE RESTRICT,
  ADD COLUMN accepted_at TIMESTAMPTZ NULL;
```

Cascata de resolução da receita, nessa ordem:

1. `proposals.accepted_pricing_option_id` → `grand_total` da opção. **Fonte canônica.**
2. Sem proposta aceita: `saved_pricing_budgets` com `is_primary` → `preco_total_cliente`.
3. Sem nenhum dos dois: DRE não abre. O card diz "feche uma proposta primeiro".

O passo 3 é deliberado. DRE com receita chutada é pior que DRE nenhuma.

---

## 4. O risco que o design tem que matar

Na planilha de referência: lucro planejado R$ 29.698, lucro real R$ 73.274. **2,5×.**

Isso não é economia de compra de 146%. É DRE parcial — o executado só soma o que
já virou OC de material, enquanto o planejado soma os seis grupos. Enquanto mão de
obra, imposto e comissão não forem lançados, a margem aparece inflada.

Se reproduzirmos isso, o painel mente durante a obra inteira e só acerta no fim —
que é exatamente quando ninguém mais precisa dele.

**Antídoto, embutido no modelo:** cada grupo tem estado de fechamento
(`aberto | fechado`). Enquanto um grupo estiver aberto, o realizado dele usa o
**orçado como proxy** e o número aparece rotulado como *projetado*. Margem **real**
só é exibida quando todos os seis grupos estiverem fechados. O painel mostra sempre
os dois: "Projetado 17,4% · Real — (2 de 6 grupos abertos)".

---

## 5. Modelo de dados

Âncora: `budget_id`. É o que já amarra precificação (`saved_pricing_budgets.budget_id`),
proposta (`proposals.budget_id`) e sessão de cotação (`quotation_sessions.budget_id`).
Uma DRE por orçamento.

### 5.1 Taxonomia de grupo

```sql
CREATE TYPE public.dre_group AS ENUM (
  'material', 'mao_de_obra', 'imposto', 'frete', 'comissao', 'adicional'
);
```

ENUM e não tabela: são as seis linhas da DRE, não um cadastro. Grupo novo é decisão
de negócio que merece migration.

### 5.2 `work_dre` — cabeçalho

```sql
CREATE TABLE public.work_dre (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL DEFAULT public.current_org_id(),
  budget_id         UUID NOT NULL REFERENCES public.budgets(id) ON DELETE RESTRICT,
  proposal_id       UUID NULL REFERENCES public.proposals(id) ON DELETE SET NULL,

  -- Receita congelada na abertura (§3)
  contract_value    NUMERIC NOT NULL CHECK (contract_value > 0),
  revenue_source    TEXT NOT NULL CHECK (revenue_source IN ('proposal', 'pricing')),

  -- Orçado congelado na abertura (§5.3)
  planned_snapshot  JSONB NOT NULL,

  status            TEXT NOT NULL DEFAULT 'aberta'
                    CHECK (status IN ('aberta', 'fechada')),
  closed_at         TIMESTAMPTZ NULL,
  created_by        UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, budget_id)
);
```

### 5.3 Por que `planned_snapshot` congela

`saved_pricing_budgets` com `save_mode = 'live'` **muda sozinho** quando o orçamento
muda. Se a DRE ler ao vivo, reprecificar em julho reescreve o planejado de março e
a variação desaparece sem rastro. O orçado é congelado no momento em que a DRE abre:

```jsonc
{ "material": 325681.20, "mao_de_obra": 32300.00, "imposto": 27900.00,
  "frete": 814.00, "comissao": 1980.00, "adicional": 1626.00,
  "source_pricing_id": "…", "frozen_at": "2026-08-17T…" }
```

Reabrir/recongelar é ação explícita, com registro.

### 5.4 `purchase_orders` — a OC como documento

**Ancora em `budget_id`, não em `dre_id`.** A OC nasce durante a compra; a DRE só
abre depois. Pendurar a OC na DRE tornaria impossível emitir OC antes de existir
DRE — que é a ordem real dos fatos. A DRE agrega as OCs pelo `budget_id`, e OC de
sessão global (`quotation_sessions.budget_id IS NULL`) simplesmente não entra em
DRE nenhuma.

```sql
CREATE TABLE public.purchase_orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL DEFAULT public.current_org_id(),
  budget_id      UUID NULL REFERENCES public.budgets(id) ON DELETE SET NULL,
  session_id     UUID NULL REFERENCES public.quotation_sessions(id) ON DELETE SET NULL,
  supplier_id    UUID NULL REFERENCES public.suppliers(id) ON DELETE SET NULL,

  oc_number      TEXT    NOT NULL,
  supplier_name  TEXT    NOT NULL,        -- denormalizado: a OC não muda se o cadastro mudar
  items_value    NUMERIC NOT NULL DEFAULT 0 CHECK (items_value  >= 0),
  freight_value  NUMERIC NULL CHECK (freight_value IS NULL OR freight_value >= 0),
  delivery_date  DATE    NULL,
  status         TEXT    NOT NULL DEFAULT 'emitida'
                 CHECK (status IN ('emitida', 'entregue', 'cancelada')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, oc_number)
);

CREATE TABLE public.purchase_order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  material_id       UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  quantidade        NUMERIC NOT NULL CHECK (quantidade > 0),
  preco_unit        NUMERIC NOT NULL CHECK (preco_unit >= 0),
  UNIQUE (purchase_order_id, material_id)
);
```

`freight_value` é **nullable de propósito**: `NULL` = não informado (todas as OCs
migradas do modelo antigo, que não tinha o campo), `0` = esta compra não teve frete.
A DRE soma `NULL` como zero mas avisa em quantas OCs o frete está em branco — senão
o grupo `frete` mostra R$ 0,00 e ninguém desconfia.

`items_value` mantido por trigger a partir dos itens — a UI da DRE lista dezenas de
OCs e não pode agregar filhas a cada render.

O frete entra na DRE como grupo `frete`, **nunca** somado ao material. É o que a
planilha faz (colunas separadas) e é o que permite ver frete como % do custo.

### 5.4.1 O que a migração real revelou (aplicada em dev em 18/08/2026)

A suposição de que toda OC nasce de uma escolha no Cenário Ideal
(`scenario_ideal_selections`) **não é como o Paulo usa o sistema na prática**.
Auditoria em dev, sobre `scenario_purchase_orders` (152 linhas, 5 números de OC):

| Achado | Número |
|---|---|
| Linhas com seleção ideal (fornecedor resolvível sem ambiguidade) | 27 (18%) |
| Linhas sem seleção ideal, mas com 1 cotação candidata só (resolvidas por fallback) | incluídas nas 27 |
| Linhas sem seleção ideal e com **múltiplas cotações concorrentes** — fornecedor real perdido | 125 (82%) |

Ou seja: o Paulo frequentemente digita o número da OC na tela de cotação sem
antes escolher qual fornecedor venceu no Cenário Ideal. Quando isso acontece e
mais de uma cotação tem aquele material casado, **não há registro em lugar
nenhum de qual delas foi a compra real**. Inventar um vencedor fabricaria custo
— a mesma recusa do §3 para a receita se aplica aqui.

Duas migrations adicionais nasceram desse achado:

- `20260818122500_purchase_orders_unambiguous_fallback.sql` — resolve
  (sessão, material) sem seleção ideal quando existe exatamente 1 cotação
  candidata. Recuperou o caso "FATURAR DIRETO" (4 itens, 1 fornecedor).
- `20260818122600_purchase_orders_merge_duplicate_headers.sql` — corrige um
  bug que a migration acima introduziu: ela não sabia que já existia um
  cabeçalho sem sufixo para o mesmo fornecedor (criado pela passada anterior),
  e criou um segundo cabeçalho sufixado pro OC "619"/ELECTRASUL. Mesclado.

**Resolvido em 18/08/2026** — `20260818130000_purchase_orders_resolve_remaining.sql`.
Decisão do Paulo: em vez de reconciliar manualmente, resolver automaticamente.
As 125 linhas pertenciam a só **3 obras** (não 125 telas separadas):

| Obra | OC(s) | Tratamento |
|---|---|---|
| SUBESTAÇÃO 225kVA — FECOERGS | 619 | Estendeu ELECTRASUL, já confirmado por 17 dos 47 itens via seleção real no Cenário Ideal — **não é chute**, é a mesma OC/fornecedor |
| SE 112,5kVA — COPREL | 625 | Estendeu ELECTRASUL, já confirmado por 2 dos 43 itens |
| Evandro Casa Nova | 596 | Estendeu ELECTRASUL, já confirmado por 2 dos 11 itens |
| Evandro Casa Nova | 595 | **Estimado** — nenhuma âncora confirmada nesta OC; vence CELESP por maior cobertura (41/41 materiais) e menor total entre 3 concorrentes. Cabeçalho gravado com `notes` avisando que é estimativa, não confirmação |

A regra: quando a OC já tem PARTE confirmada por uma escolha real no Cenário
Ideal, estender esse mesmo fornecedor para o resto não é uma adivinhação — uma
ordem de compra é, na prática, sempre de um fornecedor só. Só a OC 595 (sem
nenhuma âncora) usou heurística de fato, e só ela ficou marcada como estimada.

4 materiais (de 152) seguem sem OC — não por ambiguidade, mas por ausência
total de cotação com quantidade válida em qualquer fornecedor da sessão. Não
há como inferir preço do nada; ficam de fora e reportados por `RAISE WARNING`.
**148 de 152 linhas resolvidas (97%).**

### 5.5 `dre_actuals` — o realizado que não é compra

```sql
CREATE TABLE public.dre_actuals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL DEFAULT public.current_org_id(),
  dre_id       UUID NOT NULL REFERENCES public.work_dre(id) ON DELETE CASCADE,
  grupo        public.dre_group NOT NULL,
  descricao    TEXT    NOT NULL CHECK (length(btrim(descricao)) > 0),
  valor        NUMERIC NOT NULL CHECK (valor >= 0),
  competencia  DATE    NOT NULL DEFAULT CURRENT_DATE,
  created_by   UUID    NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dre_actuals_nao_material CHECK (grupo <> 'material')
);
```

O CHECK é a regra de ouro do modelo: **material realizado vem só de OC**. Lançamento
manual de material criaria caminho duplo e dupla contagem silenciosa.

### 5.6 `dre_group_status` — o antídoto do §4

```sql
CREATE TABLE public.dre_group_status (
  dre_id     UUID NOT NULL REFERENCES public.work_dre(id) ON DELETE CASCADE,
  grupo      public.dre_group NOT NULL,
  fechado    BOOLEAN NOT NULL DEFAULT false,
  fechado_em TIMESTAMPTZ NULL,
  PRIMARY KEY (dre_id, grupo)
);
```

### 5.7 RLS

Todas as quatro tabelas nascem no padrão org (`20260807140000`): SELECT/UPDATE/
DELETE exigem `org_id = current_org_id()`; INSERT soma `auth.uid() = user_id`.
Como no resto do sistema, `can_edit` **não** entra na policy — quem barra é a
aplicação (`src/lib/auth/moduleAccess.ts`), não o RLS; a tabela `module_permissions`
só decide o que aparece na navegação e a URL direta.

`module_key` novo: **`dre-obra`** — sem CHECK a adicionar,
`module_permissions.module_key` é livre por design (`20260803124000:71`).
Semeado com `can_view = true, can_edit = false` para todo membro ativo (dado
financeiro: quem lança recebe `can_edit` explicitamente); admin/owner sempre
vê e edita via `is_org_admin()`, independente de linha.

---

## 6. Fases

### Fase 1 — Fundação de dados — ✅ aplicada em dev (18/08/2026)
- `20260818120000_proposals_accepted_option.sql`: `accepted_pricing_option_id` +
  `accepted_at` (§3). Aditiva.
- `20260818121000_dre_core.sql`: ENUM `dre_group` + `work_dre` + `dre_group_status`
  + RLS + seed do módulo `dre-obra`.
- `20260818122000_purchase_orders.sql`: `purchase_orders` + `purchase_order_items`
  + trigger de `items_value` + migração de `scenario_purchase_orders` (via
  `scenario_ideal_selections`).
- `20260818122500_purchase_orders_unambiguous_fallback.sql`: fallback para
  (sessão, material) sem seleção ideal mas com 1 só cotação candidata (§5.4.1).
- `20260818122600_purchase_orders_merge_duplicate_headers.sql`: corrige
  cabeçalho duplicado que o fallback introduziu (§5.4.1).
- `20260818123000_dre_actuals.sql`.
- `20260818123500_dre_functions_search_path.sql`: `SET search_path = public`
  nas 7 funções trigger, pedido pelo linter de segurança do Supabase.
- `20260818130000_purchase_orders_resolve_remaining.sql`: resolve os 125 pares
  que ficaram de fora (detalhe completo em §5.4.1) — decisão do Paulo de
  resolver automaticamente em vez de reconciliar manualmente.

**Resultado real em dev:** 152 linhas de `scenario_purchase_orders` → 6
`purchase_orders`, **148 de 152 itens resolvidos (97%)**. Só 4 materiais (sem
cotação de nenhum fornecedor em lugar nenhum) seguem fora, reportados por
`RAISE WARNING`. Frete e data de entrega entram NULL em toda OC migrada — não
há de onde tirar. `scenario_purchase_orders` fica de pé, marcada como
deprecada, só some na Fase 4.

### Fase 2 — Classificação por grupo — ✅ implementada (18/08/2026)
- `CostItem` ganha `grupo: DreCostGroup` em [types.ts](../src/components/precificacao/types.ts)
  (`mao_de_obra | imposto | frete | comissao | adicional` — sem `material`,
  que não é um `CostItem`). Campo em JSONB: **sem migration**, como previsto.
- `inferCostItemGroup()`: heurística por palavra-chave na descrição (imposto,
  comissão, frete, mão de obra/diária/ajudante/equipe), com `tipo ===
  'maoDeObra'` como critério secundário e `adicional` como default. Roda em
  `sanitizeCostItems` (leitura), não como migration de dado — toda linha
  legada classifica ao carregar, sem backfill em banco.
- [CostItemsTable.tsx](../src/components/precificacao/CostItemsTable.tsx) ganhou
  a coluna "Grupo (DRE)"; export Excel ([buildPricingWorkbook.ts](../src/services/pricing/buildPricingWorkbook.ts))
  ganhou a mesma coluna, para não ficar defasado da UI.
- **Resolvido em 18/08/2026:** campo "Imposto sobre o serviço (%)" adicionado em
  [ServiceValueInput.tsx](../src/components/precificacao/ServiceValueInput.tsx),
  ao lado de "% sobre os materiais" e "Valor do Serviço". Decisão do Paulo: por
  orçamento, não um padrão fixo de empresa — cada precificação define o seu.
  `PrecificacaoCalculator.tsx` ganhou o estado `impostoPercentInput` e parou de
  gravar `impostoPercent: 0` fixo; o cálculo (`calculateServicePricing`) já
  incidia corretamente sobre o Valor do Serviço, só faltava a entrada real.

### Fase 3 — Cálculo e painel — ✅ implementada (18/08/2026)
- `src/services/dre/`:
  - `types.ts` — `DreGroup` (espelha o ENUM), `DrePlannedSnapshot`, `DreResult`.
  - `computeDreResult.ts` — **pura**, sem I/O. Implementa o antídoto do §4:
    grupo fechado usa realizado; grupo aberto usa o orçado como proxy no
    "custo projetado"; `custoReal`/`margemRealPercent` só existem
    (não-`null`) quando os 6 grupos estão fechados. Validado com os números
    da planilha de referência: com só o grupo material fechado, a margem
    projetada cai para ~2% (bem longe do "lucro real" 17,45% da planilha,
    que é o efeito colateral que o modelo existe para evitar); com todos os
    grupos fechados e realizado = orçado, projetada e real batem exatamente.
  - `resolveContractValue.ts` — implementa a cascata do §3.
  - `buildPlannedSnapshot.ts` — soma `CostItem[]` por `grupo` + `valorMateriais`
    + `impostoValor` (as duas fontes de imposto, que não se sobrepõem).
  - `openDre.ts` — resolve receita + orçado e grava `work_dre` (lança
    `DreOpenError` com mensagem de usuário quando falta receita ou
    precificação — nunca abre com número inventado).
  - `loadDreContext.ts` — soma o realizado: material/frete de
    `purchase_orders` (excluindo `cancelada`), os outros 4 grupos de
    `dre_actuals`. Frete com `freight_value NULL` soma como zero mas é
    contado à parte (`freightGap`) para a UI nunca mostrar R$ 0,00 sem avisar
    que está incompleto.
- `src/actions/dre.ts` — `openDreAction`, `addDreActualAction`,
  `deleteDreActualAction`, `setDreGroupClosedAction`, `closeDreAction`
  (recusa fechar com grupo aberto), `reopenDreAction`.
- Rota `/orcamentos/[budgetId]/dre` — **não** `/obra/[budgetId]/dre` como o
  rascunho original cogitava: `/obra/[...slug]` já é a página pública de
  acompanhamento de obra, rota diferente. Segue a convenção existente da
  esteira do orçamento (`/orcamentos/[budgetId]/materiais`,
  `.../precificacao`, `.../proposta`), inclusive a nova aba "DRE" em
  [BudgetWorkspaceChrome.tsx](../src/components/orcamentos/BudgetWorkspaceChrome.tsx).
  Gate de acesso: herdado do layout pai (`requireModuleAccess('orca-rede')`)
  — sem checagem de módulo própria, pelo mesmo motivo de materiais/precificação/
  proposta não terem.
- Painel ([DrePainel.tsx](../src/components/orcamentos/dre/DrePainel.tsx)):
  estado "ainda não aberta" com botão de abertura; tabela de 6 grupos
  (orçado/realizado/variação/toggle fechado-aberto); bloco de resumo com
  **Projetado** (sempre) e **Real** (só com os 6 fechados, com contagem de
  quantos seguem abertos); aviso de OCs sem frete informado; lançamento e
  remoção manual de `dre_actuals`; fechar/reabrir DRE.
- **Export XLSX da DRE em si não foi feito** — o item do rascunho original
  citava reaproveitar `src/services/excel/`, mas esse diretório não existe no
  projeto (o export existente é `src/services/pricing/buildPricingWorkbook.ts`,
  específico da precificação). Fica para quando fizer sentido — o painel na
  tela já cobre a necessidade imediata de leitura.
- **Módulo `dre-obra` de `module_permissions` (semeado na Fase 1) não está
  wireado a nenhuma checagem de código.** A página usa o gate do módulo pai
  (`orca-rede`), consistente com o resto da esteira. As linhas seguem no
  banco, sem efeito — hook pronto para uma gate mais fina no futuro
  (ex.: só quem tem `can_edit` em `dre-obra` pode fechar uma DRE), não usado
  agora para não introduzir um padrão de permissão que o resto da árvore
  `/orcamentos/[budgetId]/*` não tem.

#### Validação end-to-end em dev (18/08/2026)

Rodado com Playwright contra o `next dev` local apontando pro banco de dev —
login real, navegação real, banco real (obra "ACMA - ILUMINAÇÃO", que já
tinha precificação principal salva **e** a OC "FATURAR DIRETO" resolvida na
Fase 1). Usuário de teste descartável criado só pra isso (org `ON Engenharia
Elétrica`, papel `admin`) e removido ao final, junto com a DRE de teste aberta
nessa obra — não sobrou rastro no banco.

**Achou um bug real antes de chegar no Paulo:** `resolveContractValue.ts`
falhava em **toda** tentativa de abrir DRE, não só quando havia proposta
aceita. A migration `20260818120000` criou `proposals.accepted_pricing_option_id
REFERENCES proposal_pricing_options(id)` — uma SEGUNDA foreign key entre
`proposals` e `proposal_pricing_options` (a primeira é
`proposal_pricing_options.proposal_id`). Com duas FKs entre as mesmas duas
tabelas, o embed do PostgREST (`proposal_pricing_options!inner(...)`) fica
ambíguo e falha com "more than one relationship was found" — meu próprio
`ON DELETE RESTRICT` de propósito virou ambiguidade de propósito nenhum.
Corrigido nomeando a constraint explicitamente:
`proposal_pricing_options!proposals_accepted_pricing_option_id_fkey(grand_total)`.

Depois do fix, validado o fluxo inteiro clicando de verdade na tela: abrir DRE
(receita R$ 82.743,94 da precificação principal, orçado por grupo batendo com
o banco), lançar custo manual de mão de obra, ver "Realizado" e "Variação"
recalcularem, fechar o grupo (contador "5 de 6 grupos abertos" atualizou),
tentar fechar a DRE inteira e ser recusado com a mensagem certa por ainda
haver grupo aberto. Zero erros de console em qualquer etapa.

### Fase 3.5 — Realocação e redesign — ✅ implementada (18/08/2026)

**Decisão do Paulo:** a DRE não é etapa da esteira do orçamento — é do módulo
de Suprimentos e Cotação. Rota mudou de `/orcamentos/[budgetId]/dre` para
`/fornecedores/sessao/[sessionId]/dre`, seguindo a mesma convenção de
`cenarios`/`conciliacao`: resolve o `budget_id` pela sessão, mas
`work_dre` continua por orçamento (sem mudança de schema). Aba "DRE" saiu de
`BudgetWorkspaceChrome` e entrou em `SuppliesHeader`. `DrePainel.tsx` mudou de
pasta (`components/orcamentos/dre` → `components/suppliers/dre`) e passou a
receber `sessionId` além de `budgetId` — as actions revalidam pelo caminho da
sessão, não mais do orçamento.

**Achado ao comparar com a planilha de referência do Paulo:** ela tem uma
coluna de tipo de frete (CIF/FOB) por OC que o modelo original não capturava.
Isso não é só um dado a mais — explica uma ambiguidade real: frete **CIF**
(embutido no preço do material) tem `freight_value` zero/NULL por definição
**correta**, não por dado faltando; só frete **FOB** (pago à parte) é lacuna
de verdade. Sem isso, o aviso de "OC sem frete" tratava as duas situações
igual. Migration `20260818140000` adiciona `purchase_orders.freight_type`
(`cif | fob | NULL`); `loadDreContext.ts` só conta como lacuna OC `fob` sem
valor ou sem classificação nenhuma — nunca `cif`.

**Redesign do painel**, pedido explicitamente como "mais completo": a
planilha do Paulo serviu de referência de **conteúdo** (não veio dela nada de
cor ou de visual), a imagem `public/image.png` (mockup de dashboard SaaS) de
referência de **linguagem visual** (grid bento, número grande em destaque,
cards de tamanho variável) — nem cor nem funcionalidade vieram dela.

Antes de desenhar qualquer gráfico, validado contra `scripts/validate_palette.js`
do skill de dataviz: a paleta do sistema (croma baixo de propósito — "azul
empoeirado", ver `MD/DESIGN_SYSTEM.md`) **falha** o piso de cromatismo para um
donut de 6 fatias categóricas em todo nível testado (500/600/700, todas as 5
famílias secundárias). Em vez de forçar cor onde a paleta não sustenta,
trocado por formas que não dependem de 6 hues distinguíveis:

- Donut de composição → **lista ranqueada** de barras num hue só (accent),
  proporcional ao valor — identidade vem do rótulo, não da cor
  (`DreCompositionList.tsx`).
- Gráfico Previsto×Realizado → **barras pareadas em CSS puro** (sem lib de
  gráfico), cor de **status** (verde/vermelho, já reservada e usada na
  tabela de variação) em vez de categórica — nunca as duas ao mesmo tempo
  na mesma barra (`DreHeroStats.tsx`). A barra "Realizado" nunca usa
  `custoReal`/`lucroReal` enquanto algum grupo está aberto: usa
  `custoProjetado`/`lucroProjetado` e troca o rótulo pra "Projetado
  (parcial)" — a mesma garantia do §4, agora também visual.

**Conteúdo novo, inspirado na planilha:**
- `DrePurchaseOrdersTable.tsx` — ledger de OCs direto na DRE (Nº OC,
  fornecedor, toggle CIF/FOB, valor OC, valor frete editável, checkbox de
  entrega). Não existia nenhuma visão de OC individual na DRE antes — só
  agregado por grupo. Ícone de aviso quando a OC tem `notes` (ex.: as
  "estimadas automaticamente" da Fase 1, §5.4.1) — informação que antes só
  existia no banco, agora visível.
- `src/actions/purchaseOrders.ts` — `updatePurchaseOrderAction`, edita frete/
  tipo/status direto da tabela.
- Hero com 3 números grandes (Investimento/Custo projetado/Lucro projetado) +
  % de margem — antes só existia dentro do bloco "DRE de Obra" compacto.

Revalidado com Playwright + usuário QA descartável (criado e removido ao
final, incluindo OC de teste) numa obra sem dados reais ("EXPengenharia"):
abrir DRE, alternar CIF/FOB, marcar entrega, tudo recalculando sem erro de
console. `tsc`/`eslint` limpos no repo inteiro.

### Deploy em produção — ✅ aplicado (18/08/2026)

**Antes de aplicar**, auditoria confirmou que dev e produção são bancos
Supabase **separados** (`cvumyonqcazhnwxpclms` vs `ubqyjbtjkzxlexbuxoum`), e
que o registro de migrations de produção **não é confiável sozinho** —
`current_module_access()` existe lá sem aparecer no `list_migrations`. Cada
pré-requisito (`budgets.org_id`, `proposal_pricing_options`,
`current_org_id()`, `is_org_admin()` etc.) foi conferido objeto por objeto
antes de aplicar qualquer coisa.

**Achado central:** produção tem 249 linhas de `scenario_purchase_orders` em
**11 grupos de OC**, não os 4 do dev — dev é um snapshot antigo de produção
(mesmos números de OC 595/596/619/625 aparecem nos dois, com os mesmos
valores), mas produção cresceu desde então. A migration `20260818130000`
(hardcoded pros 4 números do dev) **não teria feito nada** nos outros 7
grupos. Escrita e testada uma versão genérica —
`20260818150000_purchase_orders_reconcile_ambiguous.sql` — que resolve por
regra (maior cobertura + fornecedor já confirmado tem prioridade), não por
número de OC escrito no código. Testada como no-op limpo em dev antes de
aplicar em produção.

**Bug pego em produção, corrigido antes de declarar pronto:** a OC "596"
ficou de fora na primeira passada — ELECTRASUL e Schimanko empatavam em
cobertura (9 materiais cada) e o desempate por menor preço escolheu Schimanko,
divergindo do fornecedor já confirmado (ELECTRASUL) por seleção real no
Cenário Ideal. A regra tratou isso como conflito e recusou resolver — seguro,
mas conservador demais: quando a âncora está EMPATADA na cobertura máxima,
ela deveria vencer o desempate por preço, não ser descartada por ele. Corrigido
em `20260818151000_purchase_orders_prefer_anchor_on_tie.sql`, testado como
no-op em dev, aplicado em produção.

**Resultado final em produção:**

| | |
|---|---|
| Migrations aplicadas | 10 (`120000` → `151000`, pulando a `130000` específica do dev) |
| `purchase_orders` / `purchase_order_items` | 17 cabeçalhos / 244 itens |
| Taxa de resolução | 244 de 249 linhas (98%) |
| Sem OC migrada (lacuna genuína, sem cotação de ninguém) | 5 — GUSTAVO VINCENZI/619 (3), ADROALDO ROSSATO/625 (1), RICARDO CATANI/FATURAMENTO DIRETO (1) |
| Cabeçalhos marcados como estimativa (`notes` preenchido) | 4 |
| Advisors de segurança | Limpo — só uma função pré-existente não relacionada (`update_scenario_purchase_orders_updated_at`) |
| `module_permissions` (`dre-obra`) semeadas | 3 (membros ativos da org) |

`work_dre` e `dre_actuals` nascem vazios em produção — ninguém abriu DRE lá
ainda. `scenario_purchase_orders` segue de pé (deprecada), removida só na
Fase 4.

### Fase 4 — Fechamento
- Ação "fechar grupo" e "fechar DRE".
- Drop de `scenario_purchase_orders`.
- Permissão `dre-obra` na tela de usuários.

---

## 7. Decisões travadas

| Questão | Decisão |
|---|---|
| Âncora | `budget_id`, um-para-um |
| Receita | Opção aceita da proposta → fallback precificação primária → senão não abre |
| Orçado | Congelado em `planned_snapshot` na abertura |
| Material realizado | Só via OC. Nunca lançamento manual |
| Frete | Grupo próprio, jamais somado ao material. NULL ≠ 0 |
| OC ancora em | `budget_id` (não `dre_id` — a OC nasce antes da DRE) |
| Margem | Projetada sempre; real só com os 6 grupos fechados |
| RLS | Org desde o nascimento, FK de org com `ON DELETE RESTRICT` |
| Módulo | `dre-obra`, semeado com view para membros ativos e edit só para admin |

---

## 8. Fora de escopo

Fluxo de caixa (pago × a pagar), retenção de imposto por nota, medição por etapa,
rateio entre obras. A planilha não faz nada disso e a DRE não é o lugar de começar.
