# Plano — Organização e Multi-tenancy no OrçaRede

> **Status em 07/08/2026: as três fases estão aplicadas e validadas em DEV.**
> Nada foi aplicado em produção. Os pré-requisitos para isso estão na seção 9.

> **Documento de handoff.** Escrito em 06/08/2026 para que uma sessão nova retome
> o trabalho sem precisar redescobrir nada. Tudo que está em "Estado verificado"
> foi consultado no banco de **dev** via MCP — não é estimativa nem leitura de
> dump. Trechos riscados são afirmações da primeira versão que a execução provou
> erradas; ficam visíveis de propósito, porque o erro em si é informação.
>
> Complementa [mapeamentooperacional.md](mapeamentooperacional.md), que descreve
> a operação da ON do ponto de vista do negócio. Este aqui é o lado técnico.

---

## 1. O problema que estamos resolvendo

Hoje a fronteira de todo dado do OrçaRede é **a pessoa**. As policies dizem
`auth.uid() = user_id`. Isso significa que o dado pertence a quem o criou, e não
à empresa.

A consequência prática já apareceu: para dar acesso a um segundo usuário, a
migration `20260624000000_duplicate_luan_to_paulo.sql` precisou **duplicar
fisicamente linhas do banco**. Com quatro setores (Comercial, Engenharia,
Compras, Execução) esse caminho é inviável.

**O objetivo:** o dado passa a pertencer à **organização**. `user_id` sobrevive
como *autor* (auditoria, "quem criou"), não como dono. O Luan vira admin da org
ON Engenharia Elétrica e controla o acesso dos demais por módulo.

Multi-tenancy é requisito explícito — o sistema precisa suportar mais de uma
organização, não só a ON.

---

## 2. Estado verificado do banco (dev, 06/08/2026)

Projeto dev: `cvumyonqcazhnwxpclms` · Produção: `ubqyjbtjkzxlexbuxoum`

| Métrica | Valor |
|---|---|
| Tabelas em `public` | 86 |
| Policies RLS | 254 |
| Policies com `auth.uid() = user_id` literal | ~~68~~ — **subestimado**, o schema usa as duas ordens (ver Fase 2) |
| Tabelas com coluna `user_id` | 34 |
| Tabelas com coluna `org_id` | ~~0~~ → **33**, NOT NULL (Fase 2, 07/08/2026) |
| Tabelas sem RLS habilitada | **0** |
| `organizations` / `org_members` existem? | ~~Não~~ → **Sim, desde 07/08/2026** |
| `platform_admins` existe? | **Sim, desde 07/08/2026** |

### Usuários em dev (eram 3; hoje 2 — `teste@gmail.com` foi excluído, ver §7)

| E-mail | `profiles.role` | Budgets | Cotações | Materiais | `module_permissions` |
|---|---|---|---|---|---|
| `luan@onengenhariaeletrica.com.br` | engineer | **102** | 17 | 2.443 | 0 |
| `paulodev.website@gmail.com` | engineer | 3 | 1 | 0 | 0 |
| `teste@gmail.com` | engineer | 0 | 0 | 0 | 0 |

Dois pontos que isso revela:

- **A duplicação Luan→Paulo não está presente em dev** (3 budgets contra 102).
  Ou não rodou aqui, ou foi desfeita. **Verificar em produção antes de assumir
  qualquer coisa sobre limpeza de duplicatas.**
- **`module_permissions` está vazia para todo mundo.** A tabela de RBAC já existe
  (`user_id`, `module_key`, `can_view`, `can_edit`, `granted_by`, com CHECK
  `can_edit = false OR can_view = true`) mas nunca foi populada. Não precisa ser
  criada — precisa ser *usada*.

### Colunas de dono, por tabela

`user_id`: `budgets`, `budget_folders`, `materials`, `material_subgroups`,
`suppliers`, `supplier_material_mappings`, `supplier_quotes`,
`quotation_sessions`, `quotation_session_notes`, `session_material_exclusions`,
`session_material_stock_inputs`, `scenario_ideal_selections`,
`scenario_purchase_orders`, `extraction_jobs`, `finalized_budgets`,
`saved_pricing_budgets`, `proposals`, `proposal_templates`,
`proposal_template_responsibility_items`, `technical_responsibles`,
`item_group_templates`, `pole_standards`, `post_types`, `utility_companies`,
`company_settings`, `media_library`, `media_tags`, `media_library_tags`,
`device_tokens`, `notifications`, `user_module_seen`, `work_segments`,
`work_members`, `module_permissions`

**Exceções que quebram o padrão** — atenção na Fase 2:
- `works` → usa `engineer_id` e `manager_id`, **não tem `user_id`**
- `checklist_templates` → usa `engineer_id`
- `crew_members` → usa `owner_id`

---

## 3. ⚠ Duas correções importantes sobre exclusão de usuário

Eu havia afirmado que `budgets` e `budget_folders` sofrem `ON DELETE CASCADE` a
partir de `auth.users`. **Isso está errado** — a consulta ao banco mostrou o
contrário, e o risco real é de outro tipo.

### 3.1 — Tabelas que REALMENTE fazem CASCADE de `auth.users` (14)

Excluir o usuário **apaga essas linhas de verdade**:

`company_settings`, `crew_members.owner_id`, `device_tokens`, `media_library`,
`media_library_tags`, `media_tags`, `module_permissions`,
`proposal_template_responsibility_items`, `proposal_templates`, `proposals`,
`session_material_exclusions`, `technical_responsibles`, `user_module_seen`,
`work_segments`

> Note que **`proposals` está nessa lista.** Excluir um usuário apaga as
> propostas dele — inclusive as já publicadas com `share_token` para o cliente.

### 3.2 — Tabelas com `user_id` SEM foreign key nenhuma

`budgets`, `budget_folders`, `materials`, `quotation_sessions`, `suppliers` e
outras têm `user_id uuid` **solto, sem FK para `auth.users`**.

O risco aqui não é exclusão, é **orfandade**: excluído o usuário, as linhas
continuam no banco apontando para um UUID que não existe mais. Nenhum
`auth.uid()` bate, então o dado **some da interface** — mas é recuperável
reatribuindo o `user_id`. Menos grave que perda, ainda assim um incidente.

> **`profiles` está nessa categoria** (confirmado ao excluir `teste@gmail.com` em
> 07/08/2026): `profiles.id` **não tem FK para `auth.users`** — só `created_by`
> tem, e sem cascade. Apagar de `auth.users` deixa o perfil para trás, ainda
> listado na interface, com um `id` que não corresponde a login nenhum. Excluir
> alguém de verdade exige **dois** `DELETE`. Mais uma razão para o soft delete
> do §3.3 ser a regra.

### 3.3 — A regra que fica

**Desligamento de funcionário é sempre soft delete.** Nunca
`DELETE FROM auth.users`:

```sql
UPDATE public.profiles    SET is_active = false WHERE id = :user_id;
UPDATE public.org_members SET is_active = false WHERE user_id = :user_id;
```

---

## 4. Descoberta: o módulo de Propostas já existe

O `mapeamentooperacional.md` §5.2 pede um "Exibidor de Proposta em LP" como
trabalho a fazer. **Boa parte já está construída** — a branch atual é
`feature/modulo-propostas` e a tabela `proposals` já tem:

```
id, user_id, budget_id, template_id, technical_responsible_id,
proposal_number, version, scope_label, project_title, project_subtitle,
client_name, city, issued_at, validity_date, status, units_count, units_label,
institutional, activities, materials_snapshot, billing_conditions,
final_considerations, acceptance_closing_text, schedule_columns,
schedule_footnote, abc_grand_total, share_token, published_at, revoked_at,
ai_prompt_version, created_at, updated_at
```

Ou seja: `share_token` (URL pública), `version` (histórico de versões),
`published_at` / `revoked_at` (ciclo de vida) e `status` já existem.

### O que o código mostrou (verificado em 07/08/2026)

**O rastreamento de visualização já está pronto — e é robusto.** Existem
`proposal_views` e `proposal_view_events`, alimentados por
`src/app/proposta/[token]/track/route.ts` via as RPCs `track_proposal_view` e
`track_proposal_view_event`. Ele registra sessão com tempo e rolagem máxima,
dispositivo/SO/navegador, geo pelos headers da Vercel, e eventos de
`section_view`, `pdf_download` e `whatsapp_click`. O IP **nunca** é gravado em
claro: vira hash SHA-256 salgado com o próprio `share_token`, de modo que o mesmo
visitante gera hashes diferentes em propostas diferentes — dá para contar
visitantes distintos numa proposta sem correlacionar pessoas entre clientes.
Token inválido responde 204 silencioso, sem revelar se a proposta existe.

**Falta só o aceite formal digital.** Hoje é offline: `PublicProposalView.tsx:613`
diz *"o aceite formal é feito na via em PDF, assinada e devolvida ao responsável
comercial"*. Existe `acceptance_closing_text` e a seção `termo_aceite` renderiza,
mas não há coluna de aceite em `proposals` e `status` só tem `draft` em dev.

**Não replanejar propostas do zero** — é trabalho isolado e não bloqueia a org.

---

## 5. Arquitetura decidida

### 5.1 — Três eixos independentes (não confundir)

| Eixo | Onde | Valores | Para quê |
|---|---|---|---|
| **Operação da plataforma** | `platform_admins` | presença na tabela | Quem opera o sistema, **acima** de qualquer org |
| Autenticação de app | `profiles.role` | `engineer`, `manager` | **Contrato do APK Android** — imutável |
| Governança da org | `org_members.role` | `owner`, `admin`, `member` | Quem convida/remove/administra |
| Função operacional | `org_members.sector` | `comercial`, `engenharia`, `compras`, `execucao` | Roteamento de trabalho |
| Acesso a módulo | `module_permissions` | `module_key` + `can_view`/`can_edit` | O que cada um vê e edita |

**Admin de plataforma ≠ admin de org.** O Luan é `owner` da ON e administra a
ON. O dev **não é membro da ON**: ele é owner da própria org (`devpaulo`) e opera
a ON pelo eixo de plataforma.

Duas propriedades definem esse eixo:

- **Uma org por vez.** `is_org_member`/`is_org_admin` só concedem poder quando
  `_org_id = current_org_id()`. O admin de plataforma nunca enxerga duas orgs na
  mesma query — listagem não mistura tenants e nenhuma tela precisa de adaptação.
  Trocar de org é um `UPDATE` explícito em `profiles.active_org_id`, não um
  parâmetro de query.
- **A única leitura cross-org do sistema é `organizations_select`.** Sem ela o
  admin de plataforma veria só a org já ativa e ficaria preso, sem como listar as
  demais para trocar. Expõe metadado de tenant (nome, slug, CNPJ), nunca dado
  operacional.

> ⚠ **Por que `platform_admins` é tabela e não coluna em `profiles`.**
> `profiles_update` permite `auth.uid() = id` — o usuário edita a própria linha —
> e `trg_profiles_enforce_immutable` só congela `id`, `created_at`, `role`,
> `created_by` e `email`. Uma flag `is_platform_admin` ali seria
> **auto-promovível**: qualquer usuário viraria admin do sistema com um `PATCH`
> na API REST do Supabase. Numa tabela sem policy de escrita, a única forma de
> conceder é service role.

> **`profiles.role` NÃO PODE MUDAR.** O APK Android valida `role = 'manager'`
> direto no Supabase (`docs/apk-contracts/01-authentication.md`). Setor é coisa
> separada e vive em `org_members`.

### 5.2 — Org ativa por sessão

Multi-tenancy real significa que um usuário pode pertencer a várias orgs. Qual
delas vale na sessão fica em `profiles.active_org_id`.

Escolha deliberada: **fica em `profiles`, não numa tabela de sessão**, porque
trocar de org é decisão persistente do usuário — trocar no desktop e reabrir no
celular deve manter a escolha.

`current_org_id()` tem um `COALESCE` anti-lockout: se `active_org_id` for NULL,
cai para a primeira org ativa do usuário. Sem isso, todo usuário que nunca
escolheu uma org perderia acesso ao próprio dado no momento do flip da Fase 3.

### 5.3 — Helpers obrigatoriamente `SECURITY DEFINER`

Uma policy em `org_members` que consultasse `org_members` diretamente entra em
**recursão infinita**. O projeto já sangrou nisso — ver
`20260509000000_fix_rls_recursion_works_members` e o comentário de
`public.is_work_member`.

Toda policy usa helper, nunca subquery direta:

| Função | Retorna |
|---|---|
| `current_org_id()` | org ativa da sessão |
| `user_org_ids()` | todas as orgs ativas do usuário (seletor de org) |
| `is_org_member(uuid)` | é membro daquela org? |
| `is_org_admin(uuid)` | é owner/admin daquela org? |
| `current_org_sector()` | setor do usuário na org ativa |
| `shares_org_with(uuid)` | compartilha org com aquele usuário? |

**Performance:** são `STABLE` e sem argumento, então o planner resolve como
InitPlan (uma avaliação por statement, não por linha). Na Fase 3 as policies
devem escrever `(SELECT public.current_org_id())` — o `SELECT` explícito é o que
força o InitPlan. Sem ele, a função é chamada por linha, e `materials` tem 2.443
linhas só do Luan.

---

## 6. Roteiro em três fases

### Fase 1 — Fundação ✅ **APLICADA E VALIDADA EM DEV (07/08/2026)**

Arquivo: [`supabase/migrations/20260806120000_org_foundation.sql`](supabase/migrations/20260806120000_org_foundation.sql)

Cria:
- `organizations` (`name`, `slug`, `cnpj`, `is_active`)
- `org_members` (`org_id`, `user_id`, `role`, `sector`, `is_active`, `invited_by`)
  — **sem `UNIQUE(user_id)`**, é o que permite multi-org
- `profiles.active_org_id` + trigger que impede apontar para org da qual não se é
  membro (nomeado `trg_z_...` para rodar depois de `trg_profiles_enforce_immutable`)
- Os 6 helpers da tabela acima
- Trigger de **proteção do último owner** — impede que a org fique sem quem a
  administre. Tapa exatamente o buraco que `module_permissions` tem hoje ao se
  ancorar em `is_profile_creator`
- RLS de `organizations` e `org_members` (member vê, admin escreve, ninguém edita
  o próprio vínculo — anti-escalada de privilégio)
- Seed da ON, com membros entrando **por domínio de e-mail** (idempotente, e não
  arrasta `teste@gmail.com` para dentro)

Cria também `platform_admins` + `is_platform_admin()` (ver §5.1) e **duas orgs**:
`on-engenharia-eletrica` e `devpaulo`. Duas de propósito — uma org só não prova
isolamento nenhum, e com as duas dá para testar em dev que o dado de uma não
aparece na outra antes de o flip da Fase 3 ir para produção.

**É aditiva.** Nenhuma tabela existente ganha `org_id`, nenhuma policy de dado é
reescrita, `profiles.role` não é tocada.

**Única mudança de comportamento:** `profiles_select` ganha
`OR shares_org_with(id)`. Hoje colegas **não enxergam o nome um do outro** — sem
isso a tela de usuários lista vazio e o quadro não mostra responsável.

#### O que a aplicação revelou

1. **Bug de ordem, corrigido.** `current_org_id()` é `LANGUAGE sql`, e o Postgres
   valida o corpo de função SQL na criação (ao contrário de `plpgsql`). A coluna
   `profiles.active_org_id` era adicionada *depois* dos helpers, então a
   migration abortava com `column p.active_org_id does not exist`. **A versão
   original nunca teria rodado.** A coluna passou para a seção 3.
2. **Duas funções de trigger expostas via RPC.** `org_members_protect_last_owner`
   e `profiles_validate_active_org` são `SECURITY DEFINER`, e o PostgREST as
   publicava em `/rest/v1/rpc/<nome>` para `anon`. Trigger dispara pelo mecanismo
   do Postgres, que não exige `EXECUTE` do usuário — `REVOKE` de
   `PUBLIC, anon, authenticated` fecha a porta sem quebrar nada (reconfirmado por
   teste após o revoke).
3. **`search_path` mutável** nas duas funções de `updated_at` — fixado em `public`.
4. **Histórico dessincronizado.** `20260803134000_proposal_public_identity_read`
   estava aplicada em dev mas ausente de `supabase_migrations.schema_migrations`.
   Registrada. A `org_foundation` foi gravada com a version do relógio
   (`20260807164129`) e reescrita para `20260806120000`, batendo com o arquivo.

#### Verificação executada em dev

| Usuário | Org ativa | Membro ON | Admin ON | Setor | Plataforma |
|---|---|---|---|---|---|
| `luan@onengenhariaeletrica.com.br` | ON | ✅ | ✅ (owner) | engenharia | ✗ |
| `paulodev.website@gmail.com` | devpaulo | **✗** | **✗** | — | ✅ |
| `paulodev` *após eleger a ON* | ON | ✅ | ✅ | — | ✅ |
| `teste@gmail.com` | — | ✗ | ✗ | — | ✗ |

A linha do meio é a prova do "uma org por vez": **ser admin de plataforma, por si
só, não dá acesso à ON** — só depois de elegê-la como org ativa.

Cinco tentativas de abuso, todas bloqueadas:

| Tentativa | Barrado por |
|---|---|
| Estranho se insere em `platform_admins` | RLS (tabela sem policy de INSERT) |
| Não-membro elege a ON como org ativa | `trg_z_profiles_validate_active_org` |
| Não-membro se insere em `org_members` da ON | `org_members_insert` |
| Owner edita o **próprio** vínculo | `org_members_update` (`user_id <> auth.uid()`) |
| Rebaixar/desativar o **último** owner | `trg_org_members_protect_last_owner` |

### Fase 2 — `org_id` + backfill ✅ **APLICADA E VALIDADA EM DEV (07/08/2026)**

Arquivo: [`supabase/migrations/20260807120000_org_id_backfill.sql`](supabase/migrations/20260807120000_org_id_backfill.sql)

`org_id uuid REFERENCES organizations(id) ON DELETE RESTRICT` em **33 tabelas**,
com backfill a partir da org do dono, depois `SET NOT NULL`,
`DEFAULT public.current_org_id()` e índice em `(org_id)`.

**Nenhuma policy foi tocada.** O comportamento do sistema é idêntico antes e
depois — o risco todo está concentrado na Fase 3.

#### A descoberta que mudou o desenho: nem tudo vira org-scoped

A lista de "tabelas com `user_id`" da §2 **não** é a lista de tabelas que ganham
`org_id`. Três delas guardam dado genuinamente **pessoal**:

| Tabela | Por que fica de fora |
|---|---|
| `device_tokens` | Token de push do aparelho de alguém |
| `user_module_seen` | "Já vi o módulo X" — estado de interface individual |
| `notifications` | Tem destinatário; notificação é de uma pessoa |

Se virassem `org_id = current_org_id()`, **todo colega passaria a ler e apagar os
tokens de push e as notificações dos outros**. Continuam `auth.uid() = user_id` na
Fase 3, e isso não é dívida — é o correto.

Também ficam de fora `quotation_session_notes` (filha pura: `SELECT` e `DELETE`
são 100% `EXISTS` no pai) e a própria camada de org.

#### Classificação real, tirada de `pg_policies`

O plano dizia "68 policies com o padrão literal `auth.uid() = user_id`". **Está
subestimado**: o schema usa as duas ordens. `scenario_ideal_selections`,
`scenario_purchase_orders`, `session_material_exclusions` e
`session_material_stock_inputs` escrevem `user_id = auth.uid()` e por isso
escaparam da contagem original. São raiz também.

Outra distinção que a inspeção esclareceu: várias raízes têm um `EXISTS` **só no
INSERT** (ex.: `proposals_insert` confere que o `budget_id` é do mesmo dono).
Isso é **guarda de integridade referencial**, não herança de fronteira — elas são
raiz e ganham `org_id` mesmo assim. Confundir as duas coisas teria deixado 7
tabelas de fora do backfill.

#### Verificação executada em dev

| Tabela | ON Engenharia | devpaulo |
|---|---|---|
| `budgets` | 102 | 3 |
| `materials` | 2.443 | — |
| `supplier_quotes` | 121 | — |
| `quotation_sessions` | 17 | 1 |
| `works` | 5 | — |
| `proposals` | 2 | — |

Comportamento, todos confirmados:

| Teste | Resultado |
|---|---|
| `INSERT` do Luan sem informar `org_id` | cai na ON, pelo `DEFAULT` |
| `INSERT` do Paulo sem informar `org_id` | cai na devpaulo |
| `DELETE` de org **com** dado dentro | bloqueado pelo `RESTRICT` da FK |
| `DELETE` de org vazia | permitido |

O `DEFAULT current_org_id()` é o que torna a Fase 3 possível **sem tocar no app
nem no APK**: todo insert novo já nasce na org certa sem o cliente informar nada.

> Efeito colateral benigno observado: uma org **com owner** não pode ser apagada
> de jeito nenhum. O `DELETE` cascateia em `org_members` e o trigger de proteção
> do último owner barra antes mesmo de o `RESTRICT` ser avaliado.

### Fase 3 — Flip do RLS ✅ **APLICADA E VALIDADA EM DEV (07/08/2026)**

Arquivo: [`supabase/migrations/20260807140000_org_rls_flip.sql`](supabase/migrations/20260807140000_org_rls_flip.sql)

115 policies nas 33 tabelas org-scoped: **101 convertidas mecanicamente**, 14
tratadas à mão. Snapshot de rollback em `rls_backup.policies_pre_fase3`
(cada linha traz um `restore_stmt` pronto).

#### O desenho

| Comando | Regra |
|---|---|
| `SELECT` / `DELETE` | `org_id = (SELECT public.current_org_id())` |
| `UPDATE` | idem, no `USING` **e** no `WITH CHECK` |
| `INSERT` | idem **e** `auth.uid() = <coluna de autoria>` |

A assimetria do `INSERT` é deliberada: **o dado é da organização, mas quem cria
assina.** No `UPDATE` o `auth.uid() = user_id` sai de propósito — se ficasse, o
colega continuaria sem poder editar o orçamento do outro, que é o problema que
este projeto existe para resolver. O `WITH CHECK` do `UPDATE` também impede
**mover** uma linha para outra org.

#### Três defeitos que só apareceram testando

1. **O loop mecânico destruiria duas guardas de integridade.**
   `proposals_update` e `saved_pricing_budgets_update` têm `USING` de dono puro
   (casava no regex) mas `WITH CHECK` **composto com `EXISTS`** validando o
   orçamento pai. Reescritas mecanicamente, essa validação sumiria em silêncio e
   passaria a ser possível reapontar uma proposta para o orçamento de outra org.
   Foi o **snapshot de rollback que revelou isso** — o dump completo mostrou o
   `WITH CHECK` que a consulta de classificação resumida escondia.

2. **`TO public` quebra o link público da proposta.** Este é o mais sério.
   Quase todas as policies originais eram `TO public`, e `public` no Postgres
   significa *todos* os roles, `anon` inclusive. Enquanto a regra era
   `auth.uid() = user_id`, isso era inofensivo (dava falso). Passando a chamar
   `current_org_id()` — cujo `EXECUTE` foi revogado de `anon` na Fase 1 — o
   resultado deixa de ser "falso" e vira **erro**:
   `permission denied for function current_org_id`. Como `technical_responsibles`
   e `company_settings` têm uma policy `anon` e uma `public` cada, a consulta
   inteira abortava e **a página pública da proposta quebrava para o cliente**.
   Correção: toda policy org-scoped é `TO authenticated`. Hoje são 112
   `authenticated` + as 3 `anon` intactas.

3. **`profiles.id` sem FK para `auth.users`** — ver §3.2.

#### Isolamento verificado

| Cenário | budgets | materials | cotações | obras | propostas |
|---|---|---|---|---|---|
| Luan (org ON) | 102 | 2.443 | 17 | 5 | 2 |
| Paulo (org devpaulo) | **3** | **0** | **1** | **0** | **0** |
| Paulo após eleger a ON | 102 | 2.443 | 17 | 5 | 2 |

A linha do meio é a prova: o Paulo **não enxerga nada da ON**. E ao eleger a ON
ele deixa de ver os 3 da devpaulo — "uma org por vez" sobre dado real.

| Tentativa | Resultado |
|---|---|
| Editar orçamento de outra org | bloqueado (0 linhas) |
| Apagar orçamento de outra org | bloqueado (0 linhas) |
| Proposta apontando p/ orçamento de outra org | bloqueado pelo `WITH CHECK` |
| Criar assinando como outro usuário | bloqueado |
| Mover linha para outra org | bloqueado |
| **Editar orçamento do colega na MESMA org** | **permitido — era o objetivo** |
| Link público com token válido | abre (1 proposta, 19 seções filhas) |
| Link público com token errado / revogado | não retorna nada |

Comparação contra o snapshot: **115 policies antes, 115 depois, nenhuma sumiu,
nenhuma surgiu** — só mudaram expressão e role.

#### O caminho do APK, verificado por simulação

Dev não tem nenhum `profiles.role = 'manager'`, mas `profiles.id` e
`work_members.user_id` **não têm FK para `auth.users`** (§3.2), o que permitiu
simular um gerente sem criar login. Cenário: manager alocado a uma obra da ON e
**fora** de `org_members`.

| Consulta do APK | Resultado |
|---|---|
| `works` | **1 de 5** — só a obra em que está alocado |
| `work_milestones` | **6 de 30** — só os da obra dele |
| `work_members` | 2 — os membros da obra dele |
| `profiles` (o próprio) | 1 — o login do APK depende disso |
| `notifications`, `device_tokens` | acessíveis (dado pessoal, fora do flip) |
| `budgets`, `materials` | **0** — não vê dado da empresa |

É o `OR public.is_work_member(id, auth.uid())` de `works_select` que sustenta
isso. As 12 tabelas filhas do módulo consultam `work_members` **diretamente**,
sem passar por `works`, então o flip não as tocou; e a cláusula
`auth.uid() = user_id` preservada em `work_members_select` é o que mantém esses
`EXISTS` funcionando para quem não é da org.

### ⚠ Pendência aberta — o código web ainda filtra por pessoa

**A Fase 3 abriu o banco, mas a aplicação continua fechando.** O RLS já permite
que o Comercial leia o orçamento da Engenharia; o código, não:

```ts
// src/services/budgets/budgetWorkspace.ts:44-49
.from('budgets').select(BUDGET_COLUMNS)
  .eq('id', budgetId)
  .eq('user_id', userId)   // ← anula o ganho: colega recebe null
  .maybeSingle();
```

São **171 ocorrências de `.eq('user_id', …)` em 49 arquivos** sob `src/`. Não é
falha de segurança — filtrar demais é seguro —, é **funcionalidade não
entregue**: sem mexer nisso, a mudança toda é invisível na interface e o problema
que originou o projeto continua de pé.

Classificação a fazer, arquivo a arquivo:

| Categoria | Ação | Exemplos |
|---|---|---|
| Leitura/escrita de dado da empresa | **remover** o `.eq('user_id')` — o RLS já resolve | `budgets`, `materials`, `suppliers`, `quotation_sessions`, `proposals` |
| Dado pessoal | **manter** | `notifications` (≈5 ocorrências), `device_tokens`, `user_module_seen` |
| `user_id` em payload de INSERT | **manter** — é a autoria que o `WITH CHECK` exige | qualquer criação |

Cuidado ao varrer: nem toda ocorrência é filtro de leitura; muitas são campo de
payload. A contagem acima é de ocorrências do texto, não de filtros a remover.

**Também muda de dono:** `module_permissions` passou de `is_profile_creator` para
`is_org_admin`. Qualquer tela que administre permissões precisa refletir isso.

### Fase 4 — Quadro de Trabalho (o "Trello interno")

`mapeamentooperacional.md` §5.1. Depende das fases anteriores.

- Tasks vinculadas a `budget_id` (o fio condutor de toda a esteira)
- Setor responsável, prazo, status, histórico de transições
- Passagem entre setores com registro de cada transição
- Chat por task
- Kanban por setor, alimentado por `current_org_sector()`
- Notificações — **reaproveitar a infra existente** (`notifications`,
  `device_tokens`), não construir do zero

### Pendente, sem fase definida

- **Integração GestãoClick** (§5.4) — gerar OC pela API e devolver o número
- **Aceite formal do cliente + rastreamento de visualização** na proposta (§5.2),
  o que faltar depois de ler o código da branch

---

## 7. Decisões — resolvidas em 07/08/2026

1. **`paulodev.website@gmail.com` entra na ON?** **Não.** Ele é admin do
   *sistema*, não da org. Virou `platform_admins` + owner da org `devpaulo`. O
   bloco `⚠ REVISAR` foi removido do seed.

2. **Segundo `owner` da ON?** **Não é preciso.** O admin de plataforma é a rede
   de segurança: se a org travar, ele a elege como ativa e promove outro owner
   pela própria UI, sem service role. O Luan segue como owner único.

3. **Setor no seed?** **Não** — só o Luan sai como `engenharia`. Setor só tem
   efeito real na Fase 4 (Quadro de Trabalho); a atribuição é do Luan, na tela de
   administração da org.

4. **Escopo do admin de plataforma?** **Uma org por vez** (ver §5.1).

5. **Dado da conta dev sem org?** Virou a org `devpaulo` — que de quebra dá o
   segundo tenant para testar isolamento de verdade em dev.

6. **`teste@gmail.com`?** **Excluído em dev** (07/08/2026). Antes disso, varredura
   de **todas** as colunas UUID do schema `public` confirmou que a única
   referência ao usuário em todo o banco era a própria linha de `profiles` — zero
   dado, não era `created_by` de ninguém.

   > A exclusão revelou algo que vale para qualquer usuário: **`profiles.id` não
   > tem FK para `auth.users`** (só `created_by` tem). Apagar de `auth.users`
   > **não** remove o perfil — ele fica órfão, ainda listado na interface, com um
   > `id` que não corresponde a login nenhum. Foram necessários dois `DELETE`.
   > Isso reforça a regra do §3.3: desligamento de funcionário é soft delete.

### Aberto, agora para a Fase 3

- **A duplicata Luan→Paulo em produção** — não verificada; o MCP aponta só para
  dev. Em dev ela não existe (3 budgets do Paulo contra 102 do Luan).
- **`company_settings` pode ter mais de uma linha por org.** Hoje é uma linha por
  *usuário*. Depois do backfill, uma org com dois usuários que preencheram o
  cadastro fica com duas linhas de "dados da empresa", e o flip da Fase 3 faz as
  duas aparecerem sem critério de desempate. Em dev não se manifesta (a tabela
  está vazia), mas **conferir em produção antes do flip** e decidir pela linha
  canônica + `UNIQUE (org_id)`.

---

## 8. Estado do ambiente

- `.mcp.json` do projeto → dev (`cvumyonqcazhnwxpclms`), **autenticado e conectado**
- Existe também um `.mcp.json` em `C:\Users\conta\` com o mesmo ref — inofensivo
- `.claude/settings.local.json` → `enabledMcpjsonServers: ["supabase"]`
  (**estava `disabled`; era essa a trava que impedia o MCP de carregar**)
- Skills instaladas: `supabase`, `supabase-postgres-best-practices`
- Branch: `feature/modulo-propostas`
- Nada commitado ainda: `.mcp.json`, `.agents/`, `.claude/skills/`,
  `skills-lock.json`, esta migration e este documento

**Sobre o histórico de migrations:** ele já esteve dessincronizado (uma migration
aplicada em dev sem registro em `supabase_migrations.schema_migrations`, e a
`org_foundation` gravada com a version do relógio em vez da do arquivo). Ambos
corrigidos. Ao aplicar migration via MCP `apply_migration`, **conferir a version
registrada e alinhá-la ao nome do arquivo local** — senão um `supabase db push`
futuro tenta reaplicar.

---

## 9. Por onde a próxima sessão começa

**As três fases estão aplicadas e validadas em dev.** O banco de dev já opera com
a organização como fronteira. Prioridade acertada em 07/08/2026: **fechar o
sistema web primeiro; tudo de APK fica isolado para depois** (ver adiante).

1. **Limpar os `.eq('user_id')` do código web** — a pendência da seção acima. É o
   que falta para a mudança aparecer na interface; sem isso o projeto não
   entrega o que prometeu.
2. **Rodar a aplicação web** contra o dev já migrado. Toda a validação até aqui
   foi por SQL; falta exercitar as telas.
3. **UI da camada de org**: seletor de organização (alimentado por
   `organizations_select`) e tela de membros para o Luan atribuir setor e
   `module_permissions`.
4. **Conferir em produção**, antes de migrar: a duplicata Luan→Paulo e a
   multiplicidade de `company_settings` (§7). Exige credencial de produção — o
   MCP aponta só para dev.
5. **Aplicar em produção**, na ordem 20260806120000 → 20260807120000 →
   20260807140000, conferindo o portão de cada uma e **recriando o snapshot de
   rollback lá** antes do flip.
6. **Só então** avaliar apagar a duplicata do `20260624000000` — a razão de ser
   deste projeto.
7. **Aceite formal digital** na proposta (§4) — independente das fases de org.

### Isolado para quando o APK for o foco

O APK **ainda não está em produção** e tem pendências próprias, então nada aqui
bloqueia a migração do banco. Guardado para depois:

- **Gerente membro da org veria TODAS as obras.** `works_select` é
  `org_id = org ativa OR is_work_member(...)`, e a regra não distingue cargo. O
  seed da Fase 1 entra todo perfil ativo do domínio `@onengenhariaeletrica.com.br`
  — **managers inclusive**. Hoje o contrato diz que o gerente vê só as obras em
  que foi alocado (`docs/apk-contracts/02-works.md`), então isso seria uma
  mudança de comportamento. Três saídas: excluir `role = 'manager'` do seed
  (menor privilégio, preserva o contrato); um helper que tire manager do ramo de
  org em `works_select`; ou aceitar e atualizar o contrato.
- **O `.env` do APK aponta para produção** (`ubqyjbtjkzxlexbuxoum`), não para
  dev — logo ele não exercita o banco já migrado sem trocar a env.
- Rodar o aplicativo de verdade com um gerente real (a validação atual é
  simulação de RLS, que prova o banco, não o app).

### Ordem de aplicação e rollback

As três migrations são sequenciais e cada uma aborta se a anterior não estiver
completa. A Fase 3 tem rollback pronto em `rls_backup.policies_pre_fase3` — mas
esse snapshot é **do banco onde ela rodou**. Ao aplicar em produção, o snapshot
precisa ser recriado lá antes do flip; o da dev não serve.

### Estado em dev após as três fases

- Orgs: `ON Engenharia Elétrica` (Luan, owner/engenharia) e `devpaulo.com.br`
  (Paulo, owner) — dois tenants reais, que é o que permite testar isolamento
- `platform_admins`: `paulodev.website@gmail.com`
- Usuários: **2** (o `teste@gmail.com` foi excluído)
- `profiles.active_org_id`: NULL para ambos — resolvido pelo `COALESCE` de
  `current_org_id()`, que é o caminho que o flip exercita na prática
- Tabelas com `org_id` NOT NULL: **33** (+ `org_members`, da Fase 1)
- Policies org-scoped: **112 `authenticated`** + 3 `anon` (propostas públicas)
- Advisors de segurança: 118 lints (eram 124 antes das Fases 1–3). O único
  `rls_enabled_no_policy` é `watchdog_log`, pré-existente e intencional.
