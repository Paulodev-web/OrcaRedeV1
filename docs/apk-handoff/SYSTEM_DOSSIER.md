# SYSTEM_DOSSIER — OrçaRede / Módulo Andamento de Obra

**Versão do dossiê:** 1.0
**Data:** 2026-05-07
**Contratos APK:** `v1.0.0-web-complete`
**Audiência:** Coordenador (Claude) que iniciará a fase APK Android num novo chat. O objetivo deste documento é fornecer, em ~15min de leitura, todo o contexto necessário sobre o sistema atual sem exigir leitura de outros arquivos.

> Notas de fidelidade ao escopo original: (1) os contratos APK estão em `docs/apk-contracts/` (caminho plano), e a versão `v1.0.0-web-complete` é uma tag interna declarada no `README.md` desse diretório — não há subpasta com esse nome; (2) `docs/known-debt.md` contém 13 entradas (`DEBT-001`..`DEBT-012` e `DEBT-014`); o ID `DEBT-013` foi pulado e não existe.

---

## Sumário

| Seção | Conteúdo                                                       |
| -----:| -------------------------------------------------------------- |
|     1 | Visão geral do produto + personas                              |
|     2 | Stack atual (web) e estrutura de pastas                        |
|     3 | Banco de dados — 29 tabelas com colunas críticas, RLS, triggers |
|     4 | Storage — bucket `andamento-obra`, paths, policies, TTLs       |
|     5 | Server Actions consumidas pelo APK (assinaturas TS exatas)     |
|     6 | Realtime — 3 canais e padrão de retry                          |
|     7 | Padrões estabelecidos (idempotência, foto-antes-do-registro, retry) |
|     8 | Pendências e dívidas técnicas relevantes                       |
|     9 | Contratos formais já documentados (15 arquivos)                |
|    10 | Decisões arquiteturais travadas (10) e pendentes (10.1)        |
|    11 | Riscos para a fase APK                                         |
|    12 | Como o APK deve operar — princípios                            |
|    13 | Glossário                                                      |

### Como ler este dossiê

- **Engenheiro de APK começando do zero**: leia em ordem (1 → 13). 15min.
- **Quem só precisa do schema**: pule para Seção 3 (banco) e Seção 4 (Storage).
- **Quem vai implementar uma feature específica**: leia Seção 5 + abra o contrato indicado em `docs/apk-contracts/0X-NOME.md`.
- **Quem vai decidir stack do APK**: leia Seção 10.1 (decisões pendentes) + Seção 12 (princípios).
- **Quem vai planejar testes**: leia Seção 7 (padrões) + Seção 8 (DEBT-008).

---

## 1. Visão geral do produto

**OrçaRede** é uma plataforma SaaS para engenheiros eletricistas que orçam, contratam e acompanham obras de redes de distribuição (BT/MT) com postes, conexões e materiais. Estrutura modular: módulo de Orçamentos (planta + materiais + cotações de fornecedores) já em produção; módulo de Suprimentos (extração de cotações e match semântico via Gemini) em estabilização.

**Módulo Andamento de Obra** é o foco deste dossiê. Cobre a fase pós-orçamento: a obra é criada importando snapshot do orçamento (planta PDF + postes + conexões + materiais planejados), recebe um gerente, e passa por chat 1:1, diário diário, marcação de postes em campo, marcos de aprovação, checklists e alertas. Estado entregue: 9 blocos web concluídos + correções pós-Bloco 9.

**APK Android (em planejamento)** é a interface de campo do **gerente**. Consome diretamente Supabase (Auth + PostgREST + Storage + Realtime) e parte das Server Actions do web via HTTP. Operação 100% offline-first com fila SQLite local; idempotência forte por `client_event_id` UUID v4 gerado no dispositivo.

**Personas do módulo:**

- **Engineer** (web): dono dos dados; cria obras, importa orçamentos, alocados gerentes, valida diários, aprova/rejeita marcos, valida ou devolve checklists, fecha alertas. `profiles.role = 'engineer'`.
- **Manager** (APK): único usuário do APK; opera no canteiro; publica diários, marca postes, reporta marcos, executa checklists, abre alertas. `profiles.role = 'manager'`. Conta criada pelo engineer no web (Admin API).
- **Crew** (sem login): membros da equipe (eletricistas, ajudantes) gerenciados pelo engineer em `crew_members`. Não autenticam. Aparecem como participantes em diários e como alocação em `work_team`.

---

## 2. Stack atual (web)

Versões exatas extraídas de [package.json](../../package.json):

| Camada              | Tecnologia / Versão                                |
| ------------------- | -------------------------------------------------- |
| Framework           | Next.js `^16.0.0` (App Router)                     |
| Runtime UI          | React `^19.0.0` + React DOM `^19.0.0`              |
| Linguagem           | TypeScript `^5`                                    |
| Estilo              | Tailwind CSS `^4` + `@tailwindcss/postcss ^4`      |
| BaaS                | Supabase (Auth, PostgREST, Storage, Realtime)      |
| Cliente Supabase    | `@supabase/ssr ^0.9.0` + `@supabase/supabase-js ^2.100.1` |
| Banco               | Postgres 15 (gerenciado pelo Supabase)             |
| Lint                | ESLint `^9` + `eslint-config-next ^16`             |
| Gerenciador         | npm                                                |
| AI (suprimentos)    | `@google/generative-ai ^0.24.1`                    |
| PDF                 | `pdfjs-dist ^5.5.207` + `react-pdf ^10.4.1`        |
| Canvas pan/zoom     | `react-zoom-pan-pinch ^3.7.0`                      |
| UI primitives       | Radix UI (`accordion`, `dialog`, `popover`, `select`, `slot`, `tabs`) |
| Outros              | `clsx`, `cmdk`, `lucide-react`, `sonner` (toasts), `tailwind-merge`, `xlsx` |

**Estrutura de pastas (resumida):**

```
src/
  app/                       # App Router; rotas em /tools/andamento-obra/...
  components/                # UI; subdiretório andamento-obra/ para o módulo
    andamento-obra/
      works/                 # canvas, chat, diário, marcos, postes, etc.
  contexts/                  # React Context (BudgetContext, etc.)
  providers/                 # Wrappers de providers
  hooks/                     # Hooks de UI (não confundir com src/lib/hooks)
  data/                      # Constantes estáticas
  lib/
    auth/                    # ensureMember, ensureEngineer
    canvas/                  # tokens, geometria do canvas
    hooks/                   # useRealtimeChannel, useNotificationsRealtime, useSignedUrlWithFallback
    storage/                 # publicUrl
    supabaseServer.ts        # createSupabaseServerClient + service role
    supabaseClient.ts        # cliente browser (singleton)
  services/
    works/                   # ~30 services de leitura (getWorksForEngineer, getWorkMessages, ...)
    people/                  # getCrewMembers, getCurrentUserProfile, getManagers, supabaseAdmin
    notifications/           # getNotificationsForUser
    suppliers/, ai/          # módulo de suprimentos
  actions/                   # Server Actions ('use server'); 22 arquivos
  types/
    works.ts                 # ~1100 linhas: todos os types/zod-likes do módulo
    supabase.ts              # gerado via supabase gen types
  proxy.ts                   # Next.js middleware/proxy

supabase/
  migrations/                # 23 arquivos; 8 do módulo Andamento (prefixo 202605*)

docs/
  apk-contracts/             # 12 contratos formais + README + CHANGELOG + diagramas
  apk-handoff/               # ESTE arquivo
  known-debt.md
  security-audit.md
  smoke-test-checklist.md
```

### Endpoints e configuração

- **Supabase URL** e **anon key**: em `.env.local` (não comitado) como `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. APK vai precisar dos mesmos dois valores no `.env` (ou via `app.config.ts` do Expo). **Service role key** (`SUPABASE_SERVICE_ROLE_KEY`) **nunca** sai do servidor — APK não tem acesso e não precisa.
- **Projeto Supabase em uso (dev)**: `ubqyjbtjkzxlexbuxoum` (cf. DEBT-014). Em produção será o Supabase do cliente, ainda a definir no momento da virada.
- **PostgreSQL versão**: 15 (gerenciado pelo Supabase).
- **Bucket único do módulo**: `andamento-obra` (privado).
- **Domínio de Realtime**: `wss://{ref}.supabase.co/realtime/v1` (transparente via SDK).

### Comandos úteis no repositório

| Comando                       | O que faz                                                |
| ----------------------------- | -------------------------------------------------------- |
| `npm run dev`                 | Levanta Next.js em http://localhost:3000                 |
| `npm run build`               | Build de produção                                        |
| `npm run lint`                | Roda ESLint                                              |
| `npm run gen:supabase-types`  | Regenera `src/types/supabase.ts` a partir do schema atual |

---

## 3. Banco de dados — esquema consolidado

Total de **28 tabelas** do módulo Andamento de Obra (não inclui tabelas de Orçamento e Suprimentos). Apresentadas na ordem do roadmap. Para cada tabela: propósito (1 linha), colunas críticas que o APK lê/escreve, RLS resumida, triggers críticos. Detalhes de tipos completos em [supabase/migrations/](../../supabase/migrations).

### 3.1 `profiles`

**Propósito:** estende `auth.users` 1:1 com papel (`engineer`/`manager`) e auditoria mínima.
**Colunas críticas:** `id` (= `auth.users.id`), `full_name`, `phone`, `email`, `role` CHECK in (`engineer`,`manager`), `created_by` (UUID do engineer que criou um manager), `is_active`, `created_at`.
**RLS:** SELECT por `auth.uid() = id` OU (`auth.uid() = created_by` AND `role = 'manager'`); UPDATE com mesmo predicado. INSERT/DELETE bloqueados (criação via trigger `on_auth_user_created`; soft delete por `is_active`).
**Trigger crítico:** `on_auth_user_created` (AFTER INSERT em `auth.users`, SECURITY DEFINER, tolerante via `RAISE WARNING`); `profiles_enforce_immutable_columns` (BEFORE UPDATE) força `id`, `created_at`, `role`, `created_by`, `email` a permanecerem com valores antigos quando ator é `self` ou `created_by`.
**Constraint extra:** `manager_requires_creator` (CHECK: `role <> 'manager' OR created_by IS NOT NULL`).

### 3.2 `crew_members`

**Propósito:** membros de equipe **sem login** (não autenticam) ligados ao engineer dono.
**Colunas críticas:** `id`, `owner_id` (engineer), `full_name`, `role` (eletricista, ajudante…), `phone`, `document_id`, `notes`, `is_active`.
**RLS:** SELECT/INSERT/UPDATE/DELETE apenas para `auth.uid() = owner_id`. Manager e APK **não** veem `crew_members` diretamente — recebem nomes via `crew_present[]` em revisões de diário e via `work_team`.

### 3.3 `device_tokens`

**Propósito:** tokens de push notification do APK (Expo / FCM).
**Colunas críticas:** `id`, `user_id`, `token` UNIQUE, `platform` CHECK in (`ios`,`android`,`web`), `last_seen_at`, `created_at`.
**RLS:** SELECT/INSERT/UPDATE/DELETE apenas para `auth.uid() = user_id`. Tabela já existe; será populada pelo APK ao registrar o token Expo.

### 3.4 `works`

**Propósito:** entidade central — uma obra pertence a um engineer e (opcionalmente) a um manager.
**Colunas críticas:** `id`, `engineer_id`, `manager_id`, `budget_id` (FK opcional para `budgets`), `name`, `client_name`, `utility_company`, `address`, `status` CHECK in (`planned`,`in_progress`,`paused`,`completed`,`cancelled`), `started_at`, `expected_end_at`, `completed_at`, `last_activity_at` (TIMESTAMPTZ NOT NULL DEFAULT now()), `notes`.
**RLS:** SELECT para qualquer `work_members` da obra; INSERT apenas com `auth.uid() = engineer_id`; UPDATE apenas com `auth.uid() = engineer_id`; DELETE bloqueado (soft delete via `status='cancelled'`).
**Triggers críticos:**
- `seed_work_defaults` (AFTER INSERT, **estrito**): cria 6 marcos padrão, insere `work_members` para engineer (e manager se houver) e cria notification `work_created` para o engineer.
- `sync_work_manager` (AFTER UPDATE OF `manager_id`): sincroniza `work_members` quando manager troca.
- `update_works_updated_at` (BEFORE UPDATE).

> **Importante para o APK:** o gerente lista obras a que pertence apenas com `select * from works order by last_activity_at desc` — RLS já filtra por `work_members`. Não há query de "obras alocadas" separada; o filtro é implícito.

### 3.5 `work_members`

**Propósito:** quem participa de qual obra (engineer + manager). PK composta `(work_id, user_id)`.
**Colunas críticas:** `work_id`, `user_id`, `role` CHECK in (`engineer`,`manager`), `created_at`.
**RLS:** SELECT por self OR membro da mesma obra. INSERT/UPDATE/DELETE **bloqueados** para `authenticated` — gerenciado pelos triggers `seed_work_defaults` e `sync_work_manager` (SECURITY DEFINER).

### 3.6 `work_milestones`

**Propósito:** 6 marcos padrão por obra (Locação, Postes instalados, Cabeamento BT, Cabeamento MT, Energização, Comissionamento). Estendidos no Bloco 6 com fluxo de aprovação.
**Colunas críticas:** `id`, `work_id`, `code`, `name`, `order_index`, `status` CHECK in (`pending`,`in_progress`,`awaiting_approval`,`approved`,`rejected`), `reported_by`, `reported_at`, `approved_by`, `approved_at`, `rejected_at`, `rejection_reason`, `notes`, `evidence_media_ids` (JSONB array).
**RLS:** SELECT para membros; UPDATE para membros (restrições finas por `work_milestones_protect_fields`); INSERT/DELETE bloqueados.
**Triggers críticos:**
- `work_milestones_protect_fields` (BEFORE UPDATE, **estrito**): valida transições por role (engineer aprova/rejeita; manager reporta de `pending`/`in_progress` → `awaiting_approval`); imutáveis: `id`, `work_id`, `code`, `order_index`, `created_at`.
- `on_milestone_reported_notify` (AFTER UPDATE → `awaiting_approval`, **tolerante** via `RAISE WARNING`): notifica engineer com `kind='milestone_reported'`.
- `on_milestone_decision_notify` (AFTER UPDATE → `approved|rejected`, tolerante): notifica manager.
- `update_work_last_activity_on_milestone` (AFTER UPDATE quando status mudou).

### 3.7 `notifications`

**Propósito:** feed de notificações por usuário (gerador de push triggers para o APK).
**Colunas críticas:** `id`, `user_id`, `work_id` (NULL quando notificação não pertence a obra), `kind` (string livre — `work_created`, `message_received`, `milestone_reported`, `milestone_approved`, `milestone_rejected`, `daily_log_*`, `pole_installed`, `checklist_*`, `alert_*`), `title`, `body`, `link_path`, `is_read`, `created_at`.
**RLS:** SELECT por `auth.uid() = user_id`; UPDATE (apenas `is_read`) por self; INSERT/DELETE bloqueados (criação via triggers SECURITY DEFINER e service role).
**Realtime:** publicado em `supabase_realtime`. APK assina canal `user:{user_id}:notifications` filtrando `user_id=eq.{userId}`.

### 3.8 `work_project_snapshot`

**Propósito:** 1:1 com `works`; snapshot **imutável** do projeto importado do orçamento (PDF + materiais planejados + metragens planejadas).
**Colunas críticas:** `work_id` (PK), `source_budget_id`, `pdf_storage_path` (caminho no bucket `andamento-obra/{work_id}/project/projeto.pdf`), `original_pdf_path`, `render_version`, `pdf_num_pages`, `materials_planned` JSONB array `[{material_id, code, name, unit, quantity}]`, `meters_planned` JSONB `{BT, MT, rede}`, `imported_at`, `imported_by`.
**RLS:** SELECT para membros; INSERT/UPDATE/DELETE bloqueados (writes apenas via service role no fluxo `createWorkFromBudget`).

### 3.9 `work_project_posts`

**Propósito:** postes **planejados** copiados do orçamento (não confundir com `work_pole_installations` que são os postes **instalados em campo**).
**Colunas críticas:** `id`, `work_id`, `source_post_id`, `numbering`, `post_type`, `x_coord`, `y_coord` (no quadro lógico 6000×6000), `metadata` JSONB.
**RLS:** SELECT para membros; INSERT/UPDATE/DELETE bloqueados.

### 3.10 `work_project_connections`

**Propósito:** conexões/redes planejadas entre postes do snapshot.
**Colunas críticas:** `id`, `work_id`, `from_post_id`, `to_post_id`, `color` CHECK in (`blue`,`green`) ou NULL, `metadata` JSONB.
**RLS:** SELECT para membros; INSERT/UPDATE/DELETE bloqueados.

### 3.11 `work_messages`

**Propósito:** chat 1:1 entre engineer e manager por obra.
**Colunas críticas:** `id`, `work_id`, `sender_id`, `sender_role` CHECK in (`engineer`,`manager`), `body` (≤ 4000 chars), `client_event_id` (UUID UNIQUE WHERE NOT NULL — idempotência), `read_by_engineer_at`, `read_by_manager_at`, `created_at`.
**RLS:** SELECT para membros; INSERT com `sender_id = auth.uid()` AND `sender_role` bate com role real em `work_members`; UPDATE para membros (apenas `read_by_*` permitido pelo trigger); DELETE bloqueado.
**Triggers críticos:**
- `work_messages_protect_fields` (BEFORE UPDATE, estrito): apenas `read_by_engineer_at` e `read_by_manager_at` podem mudar.
- `on_new_work_message_notify` (AFTER INSERT, SECURITY DEFINER): notifica destinatário com `kind='message_received'`.
- `update_work_last_activity_on_message` (AFTER INSERT).
**Realtime:** publicado.

### 3.12 `work_message_attachments`

**Propósito:** anexos (image/video/audio) de mensagens.
**Colunas críticas:** `id`, `message_id`, `work_id` (denormalizado para policies), `kind` CHECK in (`image`,`video`,`audio`), `storage_path` (`{work_id}/chat/{message_id}/{file}.{ext}`), `mime_type`, `size_bytes`, `duration_seconds`, `width`, `height`, `thumbnail_path`.
**RLS:** SELECT para membros; INSERT por dono da `work_messages` parent; UPDATE/DELETE bloqueados.

### 3.13 `work_daily_logs`

**Propósito:** 1 diário ativo por `(work_id, log_date)` com fluxo de aprovação engineer.
**Colunas críticas:** `id`, `work_id`, `log_date` (DATE; UNIQUE com `work_id`), `published_by` (manager), `current_revision_id` (FK ciclícla DEFERRABLE), `status` CHECK in (`pending_approval`,`approved`,`rejected`), `approved_by`, `approved_at`, `rejected_at`.
**RLS:** SELECT para membros; INSERT com `published_by = auth.uid()` AND role manager; UPDATE para membros (transições restritas pelo trigger); DELETE bloqueado.
**Triggers críticos:**
- `work_daily_logs_protect_fields` (BEFORE UPDATE, estrito): engineer pode `pending_approval → approved|rejected`; manager pode `rejected → pending_approval` atualizando `current_revision_id` (republicação). Imutáveis: `id`, `work_id`, `log_date`, `published_by`, `created_at`.
- `on_daily_log_decision_notify` (AFTER UPDATE → approved/rejected, tolerante).
**Realtime:** publicado.

### 3.14 `work_daily_log_revisions`

**Propósito:** histórico **imutável** de revisões; `revision_number` incremental por `daily_log_id`.
**Colunas críticas:** `id`, `daily_log_id`, `revision_number` (UNIQUE com `daily_log_id`), `crew_present` JSONB array de strings, `activities` (10–4000 chars), `posts_installed_count`, `meters_installed` JSONB `{BT, MT, rede}`, `materials_consumed` JSONB array `[{materialId, name, unit, quantity}]`, `incidents`, `rejection_reason` (NULL na primeira revisão; preenchido em republicações), `client_event_id` UUID UNIQUE WHERE NOT NULL.
**RLS:** SELECT para membros; INSERT por manager membro; UPDATE/DELETE bloqueados (imutáveis).
**Trigger crítico:** `on_new_daily_log_published_notify` (AFTER INSERT) e `on_daily_log_republished_notify` (em UPDATE de status do parent), ambos SECURITY DEFINER tolerantes; `update_work_last_activity_on_daily_log`.
**Realtime:** publicado.

### 3.15 `work_daily_log_media`

**Propósito:** mídias (image/video) anexadas a uma revisão.
**Colunas críticas:** `id`, `revision_id`, `daily_log_id`, `work_id` (denormalizado), `kind` CHECK in (`image`,`video`), `storage_path` (`{work_id}/daily-logs/{daily_log_id}/{revision_id}/{uuid}.{ext}`), `mime_type`, `size_bytes`, `width`, `height`, `duration_seconds`.
**RLS:** SELECT para membros; INSERT por manager membro do parent; UPDATE/DELETE bloqueados.

### 3.16 `work_milestone_events`

**Propósito:** histórico de transições de marcos (reported/approved/rejected/reset).
**Colunas críticas:** `id`, `milestone_id`, `work_id`, `event_type` CHECK in (`reported`,`approved`,`rejected`,`reset`), `actor_id`, `actor_role` CHECK in (`engineer`,`manager`), `notes`, `client_event_id` UUID UNIQUE WHERE NOT NULL.
**RLS:** SELECT para membros; INSERT com `actor_id = auth.uid()` AND `actor_role` bate com role real; UPDATE/DELETE bloqueados.
**Realtime:** publicado.

### 3.17 `work_milestone_event_media`

**Propósito:** mídia de evidência por evento.
**Colunas críticas:** `id`, `event_id`, `work_id`, `milestone_id`, `kind` CHECK in (`image`,`video`), `storage_path` (`{work_id}/milestones/{milestone_id}/{event_id}/{uuid}.{ext}`), `mime_type`, `size_bytes`, `width`, `height`.
**RLS:** SELECT para membros; INSERT pelo ator do evento parent; UPDATE/DELETE bloqueados.

### 3.18 `work_pole_installations`

**Propósito:** **postes instalados em campo** pelo manager (distintos dos `work_project_posts` planejados). Soft-delete via `status='removed'`.
**Colunas críticas:** `id`, `work_id`, `created_by` (manager), `x_coord` (0–6000), `y_coord` (0–6000), `gps_lat` (-90..90), `gps_lng` (-180..180), `gps_accuracy_meters`, `numbering`, `pole_type`, `notes` (≤1000), `installed_at` (timestamp do APK; preserva timeline real), `status` CHECK in (`installed`,`removed`), `removed_at`, `removed_by`, `client_event_id` UUID NOT NULL UNIQUE (idempotência forte).
**RLS:** SELECT para membros; INSERT com `created_by = auth.uid()` AND role manager; UPDATE com `created_by = auth.uid()` AND role manager; DELETE bloqueado.
**Triggers críticos:**
- `work_pole_installations_protect_fields` (BEFORE UPDATE, estrito): apenas o criador edita; imutáveis incluem `x_coord`, `y_coord`, `gps_*`, `installed_at`, `client_event_id`, `created_at`. Permite `installed → removed` (com `removed_at` + `removed_by = auth.uid()`).
- `on_pole_installation_notify` (AFTER INSERT, tolerante): `kind='pole_installed'` para o engineer.
- `update_work_last_activity_on_pole_installation` (AFTER INSERT/UPDATE quando status mudou — correções de notes/numbering NÃO sobem a obra na ordenação).
**Realtime:** publicado.

### 3.19 `work_pole_installation_media`

**Propósito:** fotos vinculadas a uma instalação; `is_primary` marca a foto destacada.
**Colunas críticas:** `id`, `installation_id`, `work_id` (denormalizado), `kind` CHECK in (`image`,`video`), `storage_path` (`{work_id}/pole-installations/{installation_id}/{uuid}.{ext}`), `mime_type`, `size_bytes`, `width`, `height`, `duration_seconds`, `is_primary`.
**RLS:** SELECT para membros; INSERT pelo dono da `work_pole_installations` parent (`created_by = auth.uid()` AND manager); UPDATE/DELETE bloqueados.

### 3.20 `checklist_templates`

**Propósito:** modelos reutilizáveis criados pelo engineer. **Manager nunca cria templates.**
**Colunas críticas:** `id`, `engineer_id`, `name`, `description`, `is_default`, `is_active`. Índice único parcial em `(engineer_id) WHERE is_default = true AND is_active = true` garante apenas 1 default ativo por engineer.
**RLS:** SELECT/INSERT/UPDATE/DELETE apenas para `engineer_id = auth.uid()`. Manager **não vê** esta tabela.

### 3.21 `checklist_template_items`

**Propósito:** itens de um template.
**Colunas críticas:** `id`, `template_id`, `order_index` (UNIQUE com `template_id`), `label`, `description`, `requires_photo`.
**RLS:** SELECT/INSERT/UPDATE/DELETE pelo dono do template parent.

### 3.22 `work_checklists`

**Propósito:** instância de checklist atribuída a uma obra (snapshot do template no momento da atribuição).
**Colunas críticas:** `id`, `work_id`, `template_id` (FK opcional), `template_snapshot` JSONB (cópia do template no momento da atribuição), `name`, `description`, `assigned_by` (engineer), `assigned_to` (manager), `due_date`, `status` CHECK in (`pending`,`in_progress`,`awaiting_validation`,`validated`,`returned`), `validated_by`, `validated_at`, `returned_at`, `return_reason`.
**RLS:** SELECT para membros; INSERT com `assigned_by = auth.uid()` AND role engineer; UPDATE para membros (transições por trigger).
**Trigger crítico:** `work_checklists_protect_fields` (BEFORE UPDATE, estrito) com matriz de transições por role; `on_work_checklist_assigned` (AFTER INSERT) instancia `work_checklist_items` a partir de `template_snapshot`; `on_checklist_decision_notify` notifica manager em validated/returned.
**Realtime:** publicado.

### 3.23 `work_checklist_items`

**Propósito:** estado de cada item da instância.
**Colunas críticas:** `id`, `work_checklist_id`, `order_index` (UNIQUE com parent), `label`, `description`, `requires_photo`, `is_completed`, `completed_at`, `completed_by`, `notes`, `client_event_id` UUID UNIQUE WHERE NOT NULL.
**RLS:** SELECT para membros; INSERT bloqueado (criados por trigger); UPDATE para membros (com restrições por `work_checklist_items_protect_fields`).
**Trigger crítico:** `on_checklist_item_marked` (AFTER UPDATE quando `is_completed = true`) — auto-completa o checklist parent para `awaiting_validation` se todos os itens estão concluídos.
**Realtime:** publicado.

### 3.24 `work_checklist_item_media`

**Propósito:** fotos anexadas ao marcar item (especialmente quando `requires_photo = true`).
**Colunas críticas:** `id`, `item_id`, `work_checklist_id`, `work_id` (denormalizado), `kind`, `storage_path` (`{work_id}/checklists/{checklist_id}/{item_id}/{uuid}.{ext}`), `mime_type`, `size_bytes`, `width`, `height`, `duration_seconds`.
**RLS:** SELECT para membros; INSERT por manager membro; UPDATE/DELETE bloqueados.

### 3.25 `work_alerts`

**Propósito:** alertas/emergências em campo abertos pelo manager.
**Colunas críticas:** `id`, `work_id`, `created_by` (manager), `severity` CHECK in (`low`,`medium`,`high`,`critical`), `category` CHECK in (`accident`,`material_shortage`,`safety`,`equipment`,`weather`,`other`), `title` (5–200), `description` (10–2000), `gps_lat`, `gps_lng`, `gps_accuracy_meters`, `status` CHECK in (`open`,`in_progress`,`resolved_in_field`,`closed`), `field_resolution_at`, `field_resolution_notes`, `closed_by` (engineer), `closed_at`, `closure_notes`, `client_event_id` UUID NOT NULL UNIQUE (idempotência forte).
**RLS:** SELECT para membros; INSERT com `created_by = auth.uid()` AND role manager; UPDATE para membros (transições por trigger); DELETE bloqueado.
**Triggers críticos:**
- `work_alerts_protect_fields` (BEFORE UPDATE, estrito) — matriz de transições por role.
- `on_alert_opened_notify` (AFTER INSERT, tolerante): notifica engineer.
- `on_alert_status_change_notify` (AFTER UPDATE de status, tolerante).
- `update_work_last_activity_on_alert` (AFTER INSERT/UPDATE).
**Realtime:** publicado.

### 3.26 `work_alert_updates`

**Propósito:** histórico de tratativas (timeline de comentários e mudanças).
**Colunas críticas:** `id`, `alert_id`, `work_id`, `actor_id`, `actor_role` CHECK in (`engineer`,`manager`), `update_type` CHECK in (`opened`,`in_progress`,`resolved_in_field`,`reopened`,`closed`,`comment`), `notes`, `client_event_id` UUID UNIQUE WHERE NOT NULL.
**RLS:** SELECT para membros; INSERT com `actor_id = auth.uid()` AND `actor_role` bate com role real; UPDATE/DELETE bloqueados.
**Realtime:** publicado.

### 3.27 `work_alert_media`

**Propósito:** fotos do alerta inicial e de tratativas.
**Colunas críticas:** `id`, `alert_id`, `update_id` (NULL para mídias da abertura), `work_id`, `kind`, `storage_path` (`{work_id}/alerts/{alert_id}/{uuid}.{ext}` ou subpath por update), `mime_type`, `size_bytes`, `width`, `height`, `duration_seconds`.
**RLS:** SELECT para membros; INSERT para qualquer membro (sem restrição de role nesta tabela — engineer também pode anexar em comments/closure); UPDATE/DELETE bloqueados.

### 3.28 `work_team`

**Propósito:** alocação de `crew_members` numa obra.
**Colunas críticas:** `id`, `work_id`, `crew_member_id`, `role_in_work`, `allocated_at`, `deallocated_at` (NULL = ativa).
**RLS:** SELECT para membros (manager **lê** a equipe); INSERT/UPDATE/DELETE apenas para role engineer (manager **não aloca** crew).
**Realtime:** publicado.

### 3.29 `work_team_attendance`

**Propósito:** presença diária dos membros de equipe; populada **automaticamente** por trigger quando um diário é aprovado.
**Colunas críticas:** `id`, `work_id`, `crew_member_id`, `attendance_date`, `daily_log_id` (FK opcional), UNIQUE `(work_id, crew_member_id, attendance_date)`.
**RLS:** SELECT para membros; INSERT/UPDATE/DELETE **bloqueados** para `authenticated`. Único caminho de escrita: trigger `on_daily_log_approved_attendance` (SECURITY DEFINER) que cruza `crew_present[]` da revisão aprovada com `work_team` da obra.
**Realtime:** publicado.

> Total: 3 (people) + 4 (works skeleton) + 3 (project snapshot) + 2 (chat) + 5 (daily logs + milestones) + 2 (pole installations) + 5 (checklists) + 3 (alerts) + 2 (team) = **29 tabelas**. Observação: o roadmap original menciona 28 (juntando templates + items numa única linha conceitual); aqui listamos cada uma separadamente para precisão.

---

## 4. Storage

Bucket único do módulo: **`andamento-obra`** (privado), criado em `20260504200000_andamento_obra_project_snapshot.sql`.

### 4.1 Layout de paths

Sempre prefixados pelo `work_id` para alinhar com as policies que validam pertencimento:

| Categoria             | Path canônico                                                                          |
| --------------------- | -------------------------------------------------------------------------------------- |
| Projeto (PDF)         | `{work_id}/project/projeto.pdf`                                                        |
| Chat                  | `{work_id}/chat/{message_id}/{file_uuid}.{ext}`                                        |
| Diário                | `{work_id}/daily-logs/{daily_log_id}/{revision_id}/{uuid}.{ext}`                       |
| Marcos                | `{work_id}/milestones/{milestone_id}/{event_id}/{uuid}.{ext}`                          |
| Postes (instalações)  | `{work_id}/pole-installations/{installation_id}/{uuid}.{ext}`                          |
| Checklists            | `{work_id}/checklists/{checklist_id}/{item_id}/{uuid}.{ext}`                           |
| Alertas               | `{work_id}/alerts/{alert_id}/{file}.{ext}` (ou subpath por update)                     |

### 4.2 Policies (resumo)

**SELECT global** (`andamento_obra_storage_select`): qualquer arquivo cujo primeiro segmento (`storage.foldername(name)[1]`) seja `work_id` de uma obra a que o usuário pertence (`work_members`). Vale para todos os paths acima sem distinção de role.

**INSERT por path** (segundo segmento `storage.foldername(name)[2]`):

| Path             | Policy                                            | Restrição                            |
| ---------------- | ------------------------------------------------- | ------------------------------------ |
| `chat/`          | `andamento_obra_storage_insert_chat`              | Qualquer `work_members` (engineer ou manager) |
| `daily-logs/`    | `andamento_obra_storage_insert_daily_logs`        | `work_members` AND role = `manager`  |
| `milestones/`    | `andamento_obra_storage_insert_milestones`        | `work_members` AND role = `manager`  |
| `pole-installations/` | `andamento_obra_storage_insert_pole_installations` | `work_members` AND role = `manager`  |
| `checklists/`    | `andamento_obra_storage_insert_checklist`         | `work_members` AND role = `manager`  |
| `alerts/`        | `andamento_obra_storage_insert_alert`             | Qualquer `work_members` (engineer também anexa em comments/closure) |
| `project/`       | sem policy de INSERT para `authenticated`         | Apenas service role (fluxo `createWorkFromBudget`) |

**UPDATE/DELETE no Storage:** sem policies para `authenticated` em qualquer path. Cleanup via job batch ou ações administrativas.

### 4.3 TTL e limites (constantes do `src/types/works.ts`)

**Chat (`CHAT_*`):**
- Upload URL TTL: 15 min (`CHAT_UPLOAD_URL_TTL_SECONDS = 60*15`) — observação: `createSignedUploadUrl` em `supabase-js@2.100` ignora `expiresIn`; TTL real é o default da plataforma (~2h). A constante existe como referência conceitual.
- Download URL TTL: 30 min (`CHAT_DOWNLOAD_URL_TTL_SECONDS = 60*30`)
- Limites por kind: image **10 MB**, video **100 MB**, audio **25 MB**.
- `CHAT_MESSAGE_BODY_MAX = 4000`, `CHAT_MESSAGE_MAX_ATTACHMENTS = 10`, `CHAT_MESSAGES_PAGE_SIZE = 50`.

**Diário (`DAILY_LOG_*`):**
- Download URL TTL: 30 min.
- Limites por kind: image **10 MB**, video **100 MB**.
- `DAILY_LOG_ACTIVITIES_MIN = 10`, `MAX = 4000`; `DAILY_LOG_PAGE_SIZE = 20`.

**Marcos (`MILESTONE_*`):**
- Download URL TTL: 30 min.
- Reusa `DAILY_LOG_MEDIA_LIMITS` (image 10 MB, video 100 MB).
- `MILESTONE_NOTES_MAX = 1000`; `REJECTION_REASON_MIN = 5`, `MAX = 1000`.

**Postes (`POLE_INSTALLATION_*`):**
- Upload URL TTL: 15 min; Download URL TTL: 30 min.
- Limites: image **10 MB**, video **50 MB**.
- `POLE_INSTALLATION_NOTES_MAX = 1000`.

**Checklists (`CHECKLIST_*`):**
- Limites: image **10 MB**, video **50 MB** (`CHECKLIST_MEDIA_LIMITS`).
- `CHECKLIST_TEMPLATE_NAME_MIN = 3`, `MAX = 200`; `ITEM_LABEL_MAX = 500`; `RETURN_REASON_MIN = 5`, `MAX = 1000`.

**Alertas (`ALERT_*`):**
- Limites: image **10 MB**, video **50 MB** (`ALERT_MEDIA_LIMITS`).
- `ALERT_TITLE_MIN = 5`, `MAX = 200`; `DESCRIPTION_MIN = 10`, `MAX = 2000`; `CLOSURE_NOTES_MIN = 5`, `MAX = 1000`.

> **Padrão de upload (offline-first):** APK obtém signed upload URL via Server Action correspondente, faz PUT no Storage, e só então envia o registro principal (que inclui `storage_path`). Ver Seção 7 e Seção 12.

---

## 5. Server Actions consumidas pelo APK

Apenas o subset de actions que o APK chama. Todas as actions retornam o tipo discriminado `ActionResult<T>`:

```typescript
type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
```

> Detalhes ricos (request/response JSON, exemplos, códigos de erro) estão nos contratos `docs/apk-contracts/0X-NOME.md`. Aqui ficam **assinaturas TS exatas** e descrição de 1 linha.

### 5.1 Auth

O APK **não chama Server Actions** para autenticar — usa o SDK Supabase diretamente.

- `supabase.auth.signInWithPassword({ email, password })` — login do gerente. Retorna `Session` com `access_token` (JWT) e `refresh_token`. Detalhes em [docs/apk-contracts/01-authentication.md](../apk-contracts/01-authentication.md).
- **Validação de role pós-login:** após sessão criada, executar `supabase.from('profiles').select('role').eq('id', session.user.id).single()` e **rejeitar acesso** se `role !== 'manager'`. Mostrar mensagem "Esta conta não é de gerente; acesse pelo portal web" e fazer `supabase.auth.signOut()`. APK é exclusivo de manager.
- **Origem das credenciais:** managers são criados pelo engineer no portal web via action `createManager` em [src/actions/people.ts](../../src/actions/people.ts) (linha 49). Internamente usa `supabaseAdmin.auth.admin.createUser({ email, password, user_metadata: { role: 'manager', created_by, full_name, phone }, email_confirm: true })`. O trigger `on_auth_user_created` materializa o `profiles` com `role='manager'` e `created_by` apontando para o engineer.
- **Persistência da sessão no Expo:** SDK do Supabase suporta `AsyncStorage` (ou `expo-secure-store`) como storage adapter. Refresh do token é automático pelo SDK. Configurar `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: false`.

### 5.2 Obras (read-only)

O APK **não chama Server Actions** para listar/detalhar obras — usa PostgREST direto, RLS filtra automaticamente:

```typescript
// Listar obras alocadas (RLS filtra implicitamente)
supabase.from('works').select('*').order('last_activity_at', { ascending: false });

// Detalhe
supabase.from('works').select('*').eq('id', workId).single();
```

Detalhes em [docs/apk-contracts/02-works.md](../apk-contracts/02-works.md).

### 5.3 Chat

Em [src/actions/workMessages.ts](../../src/actions/workMessages.ts):

```typescript
sendWorkMessage(input: SendWorkMessageInput): Promise<ActionResult<{ messageId: string }>>
```
Envia mensagem (body opcional + attachments com paths já uploadados); idempotente por `clientEventId`.

```typescript
getUploadUrlForChatAttachment(input: GetUploadUrlForChatAttachmentInput): Promise<ActionResult<ChatAttachmentUploadInfo>>
```
Gera signed upload URL para um anexo; retorna `{ uploadUrl, uploadToken, storagePath, messageId }` (messageId pré-gerado server-side se ausente).

```typescript
markMessagesAsRead(workId: string): Promise<ActionResult<{ count: number }>>
```
Marca todas as mensagens não lidas pelo lado oposto como lidas (atualiza `read_by_*_at`).

```typescript
getOlderWorkMessages(workId: string, cursor: string, limit?: number): Promise<ActionResult<{ items: WorkMessage[]; hasMore: boolean }>>
```
Paginação cursor-based por `created_at DESC`; cursor = `created_at` do item mais antigo carregado.

> Detalhes em [docs/apk-contracts/03-chat.md](../apk-contracts/03-chat.md).

### 5.4 Diário

Em [src/actions/workDailyLogs.ts](../../src/actions/workDailyLogs.ts):

```typescript
publishDailyLog(input: PublishDailyLogInput): Promise<ActionResult<PublishDailyLogResult>>
```
Publica diário (manager). Aceita `crew_present`, `activities` (10–4000), `posts_installed_count`, `meters_installed`, `materials_consumed`, `incidents`, `media[]` com paths já uploadados; idempotente por `clientEventId`. Se já existe diário rejeitado na data, cria nova revision e faz `rejected → pending_approval`. Retorna `{ dailyLogId, revisionId, revisionNumber }`.

```typescript
getUploadUrlForDailyLogMedia(input: GetUploadUrlForDailyLogMediaInput): Promise<ActionResult<DailyLogMediaUploadInfo>>
```
Signed upload URL para mídia de uma revisão. Path: `{workId}/daily-logs/{dailyLogId}/{revisionId}/{uuid}.{ext}`.

```typescript
loadDailyLogHistory(dailyLogId: string): Promise<ActionResult<DailyLogWithHistoryWithUrls>>
```
Carrega diário + todas as revisões + signed URLs das mídias.

> Detalhes em [docs/apk-contracts/04-daily-logs.md](../apk-contracts/04-daily-logs.md).

### 5.5 Marcos

Em [src/actions/workMilestones.ts](../../src/actions/workMilestones.ts):

```typescript
reportMilestone(input: ReportMilestoneInput): Promise<ActionResult<{ eventId: string }>>
```
Manager reporta marco como concluído (`pending|in_progress → awaiting_approval`). Aceita `notes`, `media[]`; idempotente por `clientEventId`. Cria `work_milestone_events` com `event_type='reported'` e atualiza `work_milestones.status`.

```typescript
setMilestoneInProgress(input: { milestoneId: string }): Promise<ActionResult>
```
Manager move marco de `pending → in_progress` (sinaliza início de trabalho).

```typescript
getUploadUrlForMilestoneEvidence(input: GetUploadUrlForMilestoneEvidenceInput): Promise<ActionResult<MilestoneEvidenceUploadInfo>>
```
Signed upload URL. Retorna também `eventId` pré-gerado server-side. Path: `{workId}/milestones/{milestoneId}/{eventId}/{uuid}.{ext}`.

```typescript
loadMilestoneHistory(milestoneId: string): Promise<ActionResult<MilestoneHistoryWithUrls>>
```
Carrega marco + todos os eventos + signed URLs.

> Detalhes em [docs/apk-contracts/05-milestones.md](../apk-contracts/05-milestones.md).

### 5.6 Postes (instalações)

Em [src/actions/workPoleInstallations.ts](../../src/actions/workPoleInstallations.ts):

```typescript
recordPoleInstallation(input: RecordPoleInstallationInput): Promise<ActionResult<RecordPoleInstallationResult>>
```
Registra um poste instalado em campo. **`clientEventId` é obrigatório** (UUID v4 do APK). `installationId` opcional (APK costuma enviar para casar com path de upload). Aceita `xCoord/yCoord` (0–6000), `gpsLat/gpsLng` opcionais, `numbering`, `poleType`, `notes`, `installedAt` (timestamp do dispositivo, preserva timeline real), `media[]` com paths uploadados. Idempotência forte: se `clientEventId` já existe, retorna `{ installationId, isNew: false }`.

```typescript
removePoleInstallation(input: RemovePoleInstallationInput): Promise<ActionResult>
```
Soft delete (`status='removed'`); apenas o criador pode chamar.

```typescript
getUploadUrlForPoleInstallationMedia(input: GetUploadUrlForPoleInstallationMediaInput): Promise<ActionResult<PoleInstallationMediaUploadInfo>>
```
Signed upload URL. Path: `{workId}/pole-installations/{installationId}/{uuid}.{ext}`. **Importante:** APK gera `installationId` antes do upload para que o caminho da foto e o registro principal possuam o mesmo ID.

```typescript
loadPoleInstallation(installationId: string): Promise<ActionResult<LoadInstallationResult>>
```
Carrega instalação + mídias + signed URLs (para pré-visualização no APK após sync).

> Detalhes em [docs/apk-contracts/06-pole-installations.md](../apk-contracts/06-pole-installations.md).

### 5.7 Checklists

Em [src/actions/workChecklists.ts](../../src/actions/workChecklists.ts) — **APK consome apenas o subset de execução**, não criação:

```typescript
markChecklistItem(input: MarkChecklistItemInput): Promise<ActionResult>
```
Marca/desmarca item (`isCompleted`); aceita `notes` e `mediaPaths[]`. Idempotente por `clientEventId`. Trigger `on_checklist_item_marked` move o checklist para `awaiting_validation` se todos os itens foram concluídos.

```typescript
setChecklistInProgress(input: { checklistId: string }): Promise<ActionResult>
```
Manager sinaliza início de execução (`pending → in_progress`).

```typescript
getUploadUrlForChecklistItemMedia(input: GetUploadUrlForChecklistItemMediaInput): Promise<ActionResult<ChecklistItemMediaUploadInfo>>
```
Signed upload URL. Path: `{workId}/checklists/{checklistId}/{itemId}/{uuid}.{ext}`.

> Manager **nunca** cria templates ou checklists. As actions `createChecklistTemplate`, `assignChecklistToWork`, `validateChecklist`, `returnChecklist` são exclusivas do engineer (web).
> Detalhes em [docs/apk-contracts/07-checklists.md](../apk-contracts/07-checklists.md).

### 5.8 Alertas

Em [src/actions/workAlerts.ts](../../src/actions/workAlerts.ts):

```typescript
openAlert(input: OpenAlertInput): Promise<ActionResult<{ alertId: string }>>
```
Manager abre alerta. **`clientEventId` obrigatório**. Aceita `severity` (low/medium/high/critical), `category` (accident/material_shortage/safety/equipment/weather/other), `title` (5–200), `description` (10–2000), GPS opcional, `mediaPaths[]`. Idempotente.

```typescript
resolveAlertInField(input: { alertId; resolutionNotes; mediaPaths? }): Promise<ActionResult>
```
Manager resolve em campo (`open|in_progress → resolved_in_field`); cria `work_alert_updates` com `update_type='resolved_in_field'`.

```typescript
addAlertComment(input: { alertId; notes; mediaPaths? }): Promise<ActionResult>
```
Adiciona comentário ao timeline do alerta (engineer ou manager).

```typescript
getUploadUrlForAlertMedia(input: GetUploadUrlForAlertMediaInput): Promise<ActionResult<AlertMediaUploadInfo>>
```
Signed upload URL. Path: `{workId}/alerts/{alertId}/{uuid}.{ext}` ou subpath por update.

> Actions `acknowledgeAlert`, `closeAlert`, `reopenAlert` são chamadas predominantemente pelo engineer no web (APK pode receber notification mas não fecha alertas).
> Detalhes em [docs/apk-contracts/08-alerts.md](../apk-contracts/08-alerts.md).

### 5.9 Equipe (read-only) e Notificações

Equipe da obra: PostgREST direto em `work_team` (com JOIN para `crew_members` filtrando por `is_active`) e `work_team_attendance`. Detalhes em [docs/apk-contracts/09-team-attendance.md](../apk-contracts/09-team-attendance.md).

Notificações: PostgREST em `notifications`, marcação de leitura via action existente em [src/actions/notifications.ts](../../src/actions/notifications.ts):

```typescript
markNotificationAsRead(id: string): Promise<ActionResult>
markAllNotificationsAsRead(): Promise<ActionResult>
getOlderNotifications(cursor: string): Promise<ActionResult<{ items, hasMore }>>
```

### 5.10 Padrão `ensureMember`

Todas as actions de obra começam por `ensureMember(workId)` em [src/lib/auth/ensureMember.ts](../../src/lib/auth/ensureMember.ts), que retorna `{ ok: true, supabase, userId, role } | { ok: false, error }`. O retorno inclui o cliente Supabase autenticado e o role do usuário na obra. Erros aparecem como `{ success: false, error }` no `ActionResult`.

---

## 6. Realtime — canais relevantes para o APK

Tabelas publicadas em `supabase_realtime` (cf. migrations): `work_messages`, `work_daily_logs`, `work_daily_log_revisions`, `work_milestones`, `work_milestone_events`, `work_pole_installations`, `work_checklists`, `work_checklist_items`, `work_alerts`, `work_alert_updates`, `work_team`, `work_team_attendance`, `notifications` (esta última via canal por usuário).

### 6.1 Canais nomeados

| Canal                              | Tabela(s)                                                                                                                                                          | Filtro                  | Uso no APK                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------ |
| `work:{work_id}:chat`              | `work_messages` (INSERT)                                                                                                                                           | `work_id=eq.{workId}`   | Adicionar mensagem nova à lista local                                          |
| `work:{work_id}:events`            | `work_daily_log_revisions` (INSERT), `work_daily_logs` (UPDATE — aprovação/rejeição), `work_milestone_events` (INSERT), `work_pole_installations` (INSERT/UPDATE), `work_checklists` (UPDATE — devolução/validação), `work_alerts` (UPDATE — encerramento) | `work_id=eq.{workId}`   | Reagir a eventos da obra que afetam o manager (diário rejeitado, marco aprovado, checklist devolvido, alerta encerrado) |
| `user:{user_id}:notifications`     | `notifications` (INSERT)                                                                                                                                           | `user_id=eq.{userId}`   | Disparar push local + atualizar feed                                          |

### 6.2 Padrão de retry após Realtime INSERT

Eventos de criação (mídia) entregam o registro pai antes do batch de mídias. APK deve buscar dados completos com **retry 3x intervalo 250ms** se mídia ainda não chegou. Se após 3 tentativas seguir vazio, prosseguir com o que houver e carregar mídia preguiçosamente quando o usuário abrir o detalhe. Detalhes em [docs/apk-contracts/10-realtime.md](../apk-contracts/10-realtime.md).

### 6.3 Detecção de desconexão e reconexão

- Timeout 10s sem heartbeat → exibir banner "sem conexão em tempo real".
- SDK reconecta automaticamente.
- Após reconexão: usar `created_at` do último item local como cursor para resync delta.

---

## 7. Padrões estabelecidos (devem ser respeitados pelo APK)

- **Idempotência forte por `client_event_id`**: UUID v4 gerado no dispositivo **antes** de qualquer side effect (foto + insert). Tabelas com esse campo: `work_messages`, `work_daily_log_revisions`, `work_milestone_events`, `work_pole_installations` (NOT NULL UNIQUE), `work_checklist_items`, `work_alerts` (NOT NULL UNIQUE), `work_alert_updates`. Constraint via UNIQUE INDEX (parcial ou total).
- **Unique violation `23505` = sucesso idempotente**: o servidor já processou; APK marca o item da fila como `synced` sem retornar erro ao usuário.
- **Foto ANTES do registro principal**: signed upload URL → PUT no Storage → action de criação (já com `storage_path` no payload). Garante que registro nunca fica "órfão" sem mídia.
- **Retry 3x com backoff exponencial** para retomada da fila offline: 1s → 5s → 15s. Após 3 falhas, item permanece na fila e tenta no próximo ciclo (detecção de conexão). Cf. [docs/apk-contracts/11-offline-and-sync.md](../apk-contracts/11-offline-and-sync.md).
- **Retry 3x intervalo 250ms** para fechar gap entre Realtime do registro pai e atachments (independe da fila offline).
- **Notificações tolerantes no banco**: triggers de notification são `SECURITY DEFINER` com `BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING ... END` — falha de notification **nunca** aborta a transação principal.
- **`protect_fields` triggers estritos por role** (`RAISE EXCEPTION`): cada tabela com fluxo de aprovação tem matriz explícita de transições permitidas por role. APK respeita transições documentadas; servidor é a fonte de verdade.
- **`last_activity_at` só sobe em mudanças relevantes**: para `work_pole_installations`, INSERT sempre dispara, mas UPDATE só dispara quando `OLD.status IS DISTINCT FROM NEW.status` (correções de notes/numbering/pole_type não afetam a ordenação da Central).
- **Server Actions retornam `ActionResult<T>`**: discriminação por `success: true/false`. APK pode tipar respostas com union; nunca lança exceção em caminho feliz.
- **`SECURITY DEFINER` revogado de `PUBLIC, anon, authenticated`**: triggers internos não podem ser chamados como RPC via PostgREST (lints 0028/0029).
- **Bucket `andamento-obra` é privado**: toda leitura precisa de signed URL (cliente Supabase autenticado faz isso transparentemente para SELECT, mas para download direto via HTTP usa-se signed URL com TTL 30min).
- **`crew_present` é um array de strings (nomes)**, não FKs — manager digita nomes livremente; engineer cruza com `work_team` para sugestões.

---

## 8. Pendências e dívidas técnicas relevantes para o APK

Consolidação de [docs/known-debt.md](../known-debt.md). **Nota:** o ID `DEBT-013` foi pulado na numeração; a lista vai de 001 a 012 e 014 (total 13 entradas).

| ID         | Severidade  | Resumo                                                                                  | Impacto APK                                                                  |
| ---------- | ----------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| DEBT-001   | Média       | Galeria sem cursor real (limit 200) em `getWorkGalleryItems`                            | Indireto: APK reusa cursor por feature; galeria unificada não é tela primária do APK |
| DEBT-002   | Baixa       | Sem sync de badge de notificações entre abas                                            | Nenhum (APK é processo único)                                                |
| DEBT-003   | Baixa       | Listas longas sem virtualização                                                         | Direto: APK deve usar `FlatList` virtualizada nativamente (default no RN)    |
| DEBT-004   | Média       | Upload manual de documentos não implementado                                            | Indireto: APK não faz upload de documentos                                   |
| DEBT-005   | Baixa       | PDF signed URL sem fallback visual                                                      | Direto: APK que renderiza PDF deve tratar falha com retry e empty state      |
| DEBT-006   | Média       | Cleanup de uploads órfãos é manual (sem cron)                                           | Indireto: APK gera órfãos quando offline e nunca sincroniza; precisa de cron job futuro |
| DEBT-007   | Baixa       | Sem auditoria automatizada de acessibilidade                                            | Indireto: APK terá seu próprio plano de a11y                                 |
| DEBT-008   | **Alta**    | Sem testes E2E nem unitários                                                            | Direto: APK deveria nascer com Detox/Jest desde início, ou virar dívida nova |
| DEBT-009   | Baixa       | JSONB em tabelas (materials_planned, meters_planned, template_snapshot)                 | Indireto: APK lê esses JSONB; mudança futura para tabelas normalizadas afeta types |
| DEBT-010   | Baixa       | i18n não implementada (pt-BR hardcoded)                                                 | Direto: APK deve seguir mesmo idioma; manter consistência                    |
| DEBT-011   | Média       | Sem métricas/analytics                                                                  | Direto: APK deveria ter Sentry desde v1 para captura de crashes em campo     |
| DEBT-012   | Média       | Canvas pan/zoom touch em mobile do web pode ser ruim                                    | **Pouco relevante** (APK terá canvas próprio em React Native)                |
| DEBT-014   | Baixa       | Cross-project Storage: orçamentos no dev apontam para Supabase de prod do cliente       | **Não bloqueia APK**: afeta apenas importação de orçamentos no dev. Mitigado via HTTP fetch fallback |

> **DEBT-013 ausente**: a numeração pula de DEBT-012 para DEBT-014 sem nenhuma entrada com ID 013. A spec original menciona "DEBT-013 (services engolem erro silenciosamente)" — esse comportamento existe em alguns services (e.g., `getWorksForEngineer` retorna `[]` em erro), mas **não está catalogado** como dívida formal. Recomenda-se abrir uma DEBT-013 explícita no novo chat caso o APK consuma services HTTP cruzados (não é o caso na arquitetura atual: APK chama PostgREST/Storage direto + Server Actions específicas).

---

## 9. Contratos formais já documentados

Localização: [docs/apk-contracts/](../apk-contracts/) (caminho plano; a versão `v1.0.0-web-complete` é uma tag interna declarada no `README.md` desse diretório, não uma subpasta). Total de 15 arquivos:

| Arquivo                          | Linhas | Conteúdo                                                                       |
| -------------------------------- | -----: | ------------------------------------------------------------------------------ |
| `README.md`                      |    157 | Visão geral, princípios, paginação, retry, padrão `ActionResult`, índice       |
| `CHANGELOG.md`                   |     38 | Histórico de versões dos contratos (atualmente `v1.0.0-web-complete`)          |
| `00-flow-diagrams.md`            |    240 | Diagramas mermaid dos fluxos (login, chat, diário, marco, poste, checklist, alerta) |
| `01-authentication.md`           |    207 | Login, sessão, role manager, recuperação, sign-out                             |
| `02-works.md`                    |    272 | Listagem e detalhe de obras (read-only via PostgREST)                          |
| `03-chat.md`                     |    147 | Mensagens, anexos, upload, paginação, Realtime                                 |
| `04-daily-logs.md`               |    129 | Publicação, revisões, mídia, ciclo de aprovação                                |
| `05-milestones.md`               |    141 | Reportar marco, evidência, transições                                          |
| `06-pole-installations.md`       |    148 | Marcar poste, GPS, foto, idempotência forte                                    |
| `07-checklists.md`               |    199 | Marcar item, foto obrigatória, validação                                       |
| `08-alerts.md`                   |    245 | Abrir alerta, severidade/categoria, GPS, comentários                           |
| `09-team-attendance.md`          |    116 | Equipe (read-only), presença diária via trigger                                |
| `10-realtime.md`                 |    236 | 3 canais, retry após INSERT, desconexão, resync                                |
| `11-offline-and-sync.md`         |    252 | Fila SQLite, ciclo de vida, idempotência via `client_event_id`, ordem upload   |
| `12-push-notifications.md`       |    260 | Registro de token Expo, payloads, deep links, permissões                       |

> Nota factual: o arquivo `CHANGELOG.md` indica em "Pendente (próximas versões)" que contratos 03–12 ainda não estavam documentados, mas eles **já existem** no repositório. O CHANGELOG está desatualizado em relação ao estado real do diretório. Recomenda-se atualizá-lo ao iniciar o chat de coordenação APK.

---

## 10. Decisões arquiteturais travadas

- **APK = React Native + Expo** (managed workflow). Não é Flutter, nem Kotlin nativo, nem PWA.
- **Offline-first** com fila SQLite local; UI sempre reflete estado local imediatamente.
- **Push notifications via Expo** (FCM por trás no Android). Token Expo registrado em `device_tokens.token` com `platform='android'`.
- **Auth: Supabase Auth padrão**, mesmo banco do web. Sessão persistida via storage adapter do Expo.
- **Manager NUNCA cria templates de checklist** (apenas engineer no web). RLS de `checklist_templates` bloqueia: SELECT/INSERT/UPDATE/DELETE só para `engineer_id = auth.uid()`.
- **Manager pode marcar postes em qualquer ponto do PDF** (livre, sem amarração ao planejado). `work_pole_installations` é tabela separada de `work_project_posts`; coordenadas no quadro lógico 6000×6000; sem FK a poste planejado.
- **GPS opcional**: APK envia coordenadas quando disponível, mas a ausência **não bloqueia** a ação. Banco aceita NULL em `gps_lat/gps_lng/gps_accuracy_meters`.
- **Bucket único `andamento-obra`** (privado) com paths por feature; mesma estrutura no web e APK.
- **Idempotência por `client_event_id` UUID v4**: gerado no dispositivo **antes** de qualquer side effect.
- **Foto antes do registro principal** sempre: ordem `[upload mídia → insert linha]`, nunca o inverso.

### 10.1 Decisões pendentes — a confirmar no chat de coordenação APK

- **State management**: TanStack Query (React Query) vs estado manual com `useState`/`useReducer` — não decidido.
- **Global store**: Zustand vs Context API vs Redux Toolkit vs Jotai — não decidido. Consideração: Zustand é leve e funciona bem com fila offline; Context é zero-dep mas verboso para domínio rico.
- **Fila offline / DB local**: `expo-sqlite` (oficial, simples) vs WatermelonDB (lazy-loading + sync engine + observables) — não decidido. WatermelonDB combina melhor com lista grande de instalações de poste e checklists.
- **PDF rendering** (planta da obra no APK): `react-native-pdf` (nativo, requer EAS Build com config plugin) vs `react-native-blob-util` + WebView com `pdfjs-dist` (mais leve, mas perde gestos nativos) — não decidido.
- **Outras dependências em aberto:**
  - Upload com retry/resume: `react-native-background-upload` ou implementação própria com `expo-file-system` + `uploadAsync`.
  - Câmera + compressão: `expo-camera` + `expo-image-manipulator` (managed workflow) **ou** `react-native-vision-camera` (mais performático, requer EAS dev client).
  - GPS: `expo-location` (confirmado).
  - Animações: `react-native-reanimated` (confirmado, recomendado por todos os blocos).
  - Navegação: `expo-router` (file-based, alinha com mental model do Next.js) vs `react-navigation` (mais maduro, controle fino) — não decidido.
  - Crash reporting: Sentry React Native (recomendado pela DEBT-011) — não decidido.

---

## 11. Riscos conhecidos para a fase APK

- **DEBT-014 — cross-project Storage (dev → prod)**: orçamentos no Supabase de dev têm `plan_image_url` apontando para Supabase de prod do cliente. **Não afeta o APK diretamente** (APK não importa orçamentos), mas afeta criação de obras a partir de orçamentos no ambiente de dev. Mitigação aplicada via HTTP fetch fallback; resolução completa pendente.
- **13 dívidas em aberto**: a maioria é Baixa/Média; DEBT-008 (sem testes) é a única **Alta** e merece atenção desde o início do APK (Detox/Jest devem nascer junto com a v1).
- **Bug Turbopack com path Unicode**: o workspace está em `c:\Users\conta\Desktop\dev\Migração\OrcaRede` (note o "ç" em "Migração"). Turbopack/Next.js 16 já operam, mas comandos de build podem reclamar. Para ambiente APK (Metro), atentar para path ASCII em CI/CD.
- **`createSignedUploadUrl` em `supabase-js@2.100` ignora `expiresIn`**: TTL real é o default da plataforma (~2h). A constante `*_UPLOAD_URL_TTL_SECONDS = 60*15` no código é referência conceitual; APK não deve assumir 15min como janela rígida.
- **Realtime gap entre registro pai e mídia**: padrão de retry 3x250ms já documentado, mas precisa ser implementado consistentemente nas 6+ telas relevantes do APK.
- **Cleanup de Storage órfão**: hoje é manual via `/admin`. APK que falha após upload mas antes do insert (cenário comum offline) gera órfãos. DEBT-006 não bloqueia v1, mas é importante priorizar cron Edge Function antes de produção.
- **Servidor de prod do cliente**: APK consome o mesmo Supabase do web. Mudanças de produção exigem coordenação para não quebrar managers em campo (rollouts canário, feature flags).

---

## 12. Como o APK deve operar — princípios

- **Offline-first, sempre**: toda ação de escrita gera `client_event_id` UUID v4 e vai para fila SQLite local antes de qualquer chamada de rede. UI confirma localmente; sincronização é background.
- **Compressão de foto cliente-side**: redimensionar para no máximo **1920×1080**, JPEG **q85** antes de upload. Reduz drasticamente o tempo de upload em 4G/3G e respeita o limite de 10 MB para imagem em todas as features.
- **Câmera + EXIF**: extrair timestamp original e GPS do EXIF (quando disponível) antes da compressão. `installed_at` em `work_pole_installations` é o timestamp do dispositivo no momento da marcação, não o da sincronização.
- **GPS opcional**: solicitar permissão na primeira ação que precisa; se negada ou indisponível, prosseguir sem coordenadas. Banco aceita NULL em todos os campos GPS.
- **Background sync ao detectar conexão**: usar `@react-native-community/netinfo` para reagir a mudanças de conectividade; ao voltar online, processar fila em ordem FIFO com retry exponencial (1s → 5s → 15s).
- **Push notification não dispara ações automáticas**: ela apenas notifica. Tap → deep link para a tela relevante (e.g., `/obra/{workId}/diario` quando notification.kind = `daily_log_rejected`). O APK fetcha dados frescos ao abrir a tela.
- **Status visual de sincronização**: contagem de itens pendentes na fila visível na home; ícone de "syncing" por item enquanto upload acontece; toast de "tudo sincronizado" ao zerar a fila.
- **Sem polling**: Realtime + push cobrem 99% dos casos. Polling manual a cada 60s é fallback opcional quando Realtime cai (banner "sem tempo real").
- **Uma sessão Supabase por dispositivo**: refresh automático pelo SDK; logout limpa fila local com confirmação ("ainda há N itens pendentes; sair vai descartá-los?").
- **GPS accuracy ≤ 50m** desejável para postes; se accuracy > 50m, exibir aviso mas permitir prosseguir (manager pode estar em mata fechada).

---

## 13. Glossário

- **Engineer**: usuário do portal web; cria obras, alocados gerentes, valida diários/marcos, gerencia templates de checklist. `profiles.role = 'engineer'`.
- **Manager / Gerente**: usuário do APK; opera no canteiro. `profiles.role = 'manager'`. Conta criada pelo engineer via Admin API.
- **Crew / Equipe sem login**: membros operacionais (eletricistas, ajudantes) cadastrados em `crew_members` pelo engineer; aparecem em `crew_present[]` dos diários e em `work_team`. Não autenticam.
- **Obra (`works`)**: projeto de execução de rede elétrica de distribuição; possui status, snapshot de projeto, equipe, marcos, diários, postes, checklists e alertas.
- **Snapshot (`work_project_snapshot`)**: cópia imutável do projeto importado do orçamento (PDF + materiais + metragens). 1:1 com `works`. Mutações via service role apenas.
- **Marco / Milestone (`work_milestones`)**: 6 fases padrão da obra (Locação, Postes, BT, MT, Energização, Comissionamento). Fluxo: pending → in_progress → awaiting_approval → approved/rejected.
- **Diário (`work_daily_logs` + `work_daily_log_revisions`)**: registro de atividades de uma data específica. 1 ativo por `(work_id, log_date)`. Manager publica; engineer aprova ou rejeita; se rejeitado, manager republica nova revisão.
- **Instalação de poste (`work_pole_installations`)**: poste **realmente instalado em campo** (distinto do poste planejado em `work_project_posts`). Coordenadas no quadro lógico 6000×6000; foto obrigatória; idempotente.
- **Alerta (`work_alerts`)**: emergência/incidente em campo (acidente, falta de material, segurança, equipamento, clima, outro). Severidade low→critical. Manager abre; engineer fecha.
- **Template de checklist (`checklist_templates` + `_items`)**: modelo reutilizável criado pelo engineer; nunca pelo manager.
- **Checklist da obra (`work_checklists`)**: instância atribuída a uma obra específica; manager executa item a item; engineer valida ou devolve.
- **Item de checklist (`work_checklist_items`)**: estado individual; pode requerer foto (`requires_photo`); idempotente por `client_event_id`.
- **`client_event_id`**: UUID v4 gerado pelo cliente **por ação**, não por sessão. Garante idempotência forte: reenvio detectado pelo banco via UNIQUE constraint, retorna 23505 → APK trata como sucesso.
- **`last_activity_at`**: timestamp em `works` atualizado por triggers em ações relevantes (mensagem nova, diário publicado, marco transição, instalação nova/removida, alerta novo/atualização). Usado para ordenar a Central de Acompanhamento (mais recente primeiro). **Não atualiza** em correções de notes/numbering em postes.
- **`ActionResult<T>`**: tipo discriminado retornado por toda Server Action. `{ success: true; data: T } | { success: false; error: string }`.
- **`ensureMember(workId)`**: helper de auth que valida que o usuário autenticado é membro da obra e retorna `role` + cliente Supabase. Padrão em todas as actions de obra.
- **Cursor pagination**: todas as listagens usam `created_at DESC` como cursor; tamanho de página padrão 20 (50 para chat). Não há "ir para página N".
- **Bucket `andamento-obra`**: bucket Storage privado único do módulo. Paths sempre prefixados por `work_id`.
- **RLS (Row Level Security)**: filtro server-side por `auth.uid()` aplicado em **toda** tabela do módulo. APK depende disso para listagens implícitas (e.g., `select * from works` retorna apenas obras do gerente).
- **`SECURITY DEFINER`**: triggers que executam com privilégios do dono da função, ignorando RLS. Usado para criar `notifications` e atualizar `last_activity_at` sem expor mutação direta. EXECUTE revogado de `PUBLIC, anon, authenticated`.
- **Snapshot de template (`template_snapshot` JSONB)**: cópia do template no momento em que `assignChecklistToWork` é chamada — congela o estado para que mudanças posteriores no template não afetem checklists já atribuídas.
- **`ensureEngineer()`**: helper análogo a `ensureMember`, mas valida que o usuário tem `role='engineer'` em `profiles`. Usado em actions exclusivas do web (criação de templates, alocação de manager, etc.).
- **`SECURITY DEFINER` revogado**: padrão de hardening — `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon, authenticated` impede que triggers internos sejam chamados como RPC.
- **Quadro lógico 6000×6000**: sistema de coordenadas usado pelo canvas do PDF; tanto `work_project_posts` quanto `work_pole_installations` armazenam `(x_coord, y_coord)` nesse referencial. Conversão para pixels acontece no cliente conforme zoom/pan.
- **`is_default` em template**: cada engineer tem **no máximo 1 template default ativo** (índice único parcial garante). É o template sugerido por padrão em `assignChecklistToWork`.
- **Quase-RPC vs Server Action**: o APK não consome RPCs Postgres custom; consome (a) PostgREST para SELECTs e (b) Server Actions Next.js (HTTP) para escritas que envolvem validação composta ou múltiplos INSERTs em transação.

---

## Próximos passos para o chat de coordenação APK

Sugestões para iniciar o novo chat com agilidade:

1. **Resolver decisões pendentes da Seção 10.1** — bloco crítico antes de começar a codar (state, store, fila, PDF).
2. **Definir roadmap por feature em ordem de risco** — sugestão: Login + Listagem de obras → Chat (read) → Marcação de poste (escrita primeira, idempotência forte) → Diário → Marcos → Checklists → Alertas → Push.
3. **Atualizar `docs/apk-contracts/CHANGELOG.md`** — está descrevendo apenas 01-02 como documentados, mas todos os 12 contratos existem; ajustar para refletir o real.
4. **Catalogar formalmente um DEBT-013** se a equipe identificar pontos de "services engolem erro silenciosamente" ao integrar o APK (situação prevista pela spec original mas não atualmente registrada).
5. **Provisionar Sentry React Native** logo na v1 (DEBT-011 ainda em aberto; APK em campo precisa de telemetria de crash desde o início).
6. **Testes E2E (Detox) desde o início** — DEBT-008 é Alta no web; não repetir no APK.

---

**Fim do dossiê.** Para atualizações, manter este documento sincronizado com `docs/apk-contracts/CHANGELOG.md` quando novas versões dos contratos forem publicadas.
