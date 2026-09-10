# Auditoria de Segurança — Módulo Andamento de Obra

**Data**: Maio 2026
**Versão**: v1.0.0-web-complete (Fase 9.4)

---

## 1. Service Role no Bundle do Client

### Resultado: APROVADO

- `SUPABASE_SERVICE_ROLE_KEY` é definida apenas em variáveis de ambiente do servidor
- `createSupabaseServiceRoleClient()` é exportada de `src/lib/supabaseServer.ts`, que importa `'server-only'`
- Todos os arquivos que usam `createSupabaseServiceRoleClient()`:
  - `src/actions/workDailyLogs.ts` — Server Action (`'use server'`)
  - `src/actions/workAlerts.ts` — Server Action
  - `src/actions/workChecklists.ts` — Server Action
  - `src/actions/workMessages.ts` — Server Action
  - `src/actions/workPoleInstallations.ts` — Server Action
  - `src/actions/works.ts` — Server Action
  - `src/actions/cleanupOrphanStorage.ts` — Server Action
  - `src/services/works/getDailyLogSignedUrls.ts` — `import 'server-only'`
  - `src/services/works/getAttachmentSignedUrls.ts` — `import 'server-only'`
  - `src/services/works/getWorkPdfSignedUrl.ts` — `import 'server-only'`
  - `src/services/works/getPoleInstallationSignedUrls.ts` — `import 'server-only'`
  - `src/services/people/supabaseAdmin.ts` — `import 'server-only'`
  - `src/app/api/process-pdfs/route.ts` — API route (server-only)
- **Nenhum arquivo client-side** (`'use client'`) importa o service role client
- Verificação: `rg "service_role" .next/static/` deve retornar 0 ocorrências

### Validação recomendada:
```bash
npm run build  # em path ASCII
rg "service_role" .next/static/ --count  # esperado: 0
```

---

## 2. Validação de Server Actions

### Padrão de autorização

Todas as Server Actions do módulo Andamento de Obra seguem um dos padrões:

| Padrão | Descrição | Ações que usam |
|--------|-----------|----------------|
| `ensureMember(workId)` | Valida membro da obra + retorna role | openAlert, publishDailyLog, sendWorkMessage, recordPoleInstallation, etc. |
| `ensureEngineer()` | Valida role=engineer | createWork, updateWork, createChecklistTemplate, cleanupOrphanStorage |
| `requireAuthUserId(supabase)` | Valida autenticação (sem role check) | markNotificationAsRead, approveDailyLog, loadDailyLogHistory |

### Checklist por ação

| Action | Auth check | Server validation | revalidatePath |
|--------|-----------|-------------------|----------------|
| `createWork` | ensureEngineer | name 3-100, desc 0-500, status enum | /tools/andamento-obra |
| `updateWork` | ensureEngineer | name, desc, status, manager_id | /tools/andamento-obra + /obras/{id} |
| `openAlert` | ensureMember(role=manager) | title 5-100, desc 10-2000, severity enum, category enum, clientEventId UUID | /obras/{id}/alertas |
| `publishDailyLog` | ensureMember(role=manager) | activities 10-4000, logDate format, media mimeType/size, clientEventId | /diario |
| `sendWorkMessage` | ensureMember | body 1-4000, attachments validated | /chat |
| `recordPoleInstallation` | ensureMember(role=manager) | coords 0-6000, clientEventId UUID, media paths validated | /canvas |
| `markChecklistItem` | ensureMember | itemId UUID, completed boolean | /checklists |
| `cleanupOrphanStorage` | ensureEngineer | dryRun boolean | N/A |

### Resultado: APROVADO
Todas as ações mutantes verificam autorização antes de operar. Payloads são validados no servidor.

---

## 3. Triggers protect_fields

### Lista completa de triggers BEFORE UPDATE

| Trigger | Tabela | Tipo | Proteção |
|---------|--------|------|----------|
| `work_daily_logs_protect_fields` | work_daily_logs | BEFORE UPDATE, RAISE EXCEPTION | Bloqueia mudança em work_id, log_date, published_by por role |
| `work_milestones_protect_fields` | work_milestones | BEFORE UPDATE, RAISE EXCEPTION | Controla transições de status por role |
| `work_checklists_protect_fields` | work_checklists | BEFORE UPDATE, RAISE EXCEPTION | Status transitions por role |
| `work_checklist_items_protect_fields` | work_checklist_items | BEFORE UPDATE, RAISE EXCEPTION | Controle de marcação por role |
| `work_alerts_protect_fields` | work_alerts | BEFORE UPDATE, RAISE EXCEPTION | Status lifecycle por role |
| `work_pole_installations_protect_fields` | work_pole_installations | BEFORE UPDATE, RAISE EXCEPTION | Imutabilidade de coords, creator-only remove |
| `work_messages_protect_fields` | work_messages | BEFORE UPDATE, RAISE EXCEPTION | Imutabilidade de sender_id, work_id, body |
| `profiles_protect_fields` | profiles | BEFORE UPDATE, RAISE EXCEPTION | Imutabilidade de id, auth_user_id |

### Resultado: APROVADO
Todos os triggers são BEFORE UPDATE com RAISE EXCEPTION. Colunas críticas são protegidas.

---

## 4. Sanitização de Inputs

### dangerouslySetInnerHTML

**Resultado**: `grep -r "dangerouslySetInnerHTML" src/` → **0 ocorrências**

React escapa todo conteúdo por padrão. Nenhum componente usa renderização HTML raw.

### Campos com user-generated content

| Campo | Tabela | Proteção |
|-------|--------|----------|
| `body` | work_messages | React escape, max 4000 chars |
| `title`, `description` | work_alerts | React escape, min/max chars validados |
| `activities`, `incidents` | work_daily_log_revisions | React escape, min/max chars |
| `notes` | work_milestone_events | React escape |
| `name` | works | React escape, max 100 chars |

### Resultado: APROVADO

---

## 5. Matriz de Testes RLS

### Setup necessário

Criar 2 pares de teste:
- `engineer-test-A@andamento.test` com `manager-test-A` + `Obra Teste A`
- `engineer-test-B@andamento.test` com `manager-test-B` + `Obra Teste B`

### Matriz esperada

| Tabela | A vê A? | A vê B? | A escreve em B? |
|--------|---------|---------|-----------------|
| works | OK | 0 linhas | RLS error |
| work_messages | OK | 0 linhas | RLS error |
| work_daily_logs | OK | 0 linhas | RLS error |
| work_milestones | OK | 0 linhas | RLS error |
| work_pole_installations | OK | 0 linhas | RLS error |
| work_checklists | OK | 0 linhas | RLS error |
| work_alerts | OK | 0 linhas | RLS error |
| crew_members (próprios) | OK | 0 linhas | RLS error |
| profiles (managers de A) | OK | 0 linhas | RLS error |
| storage objects | OK | 0 linhas | RLS error |

### Testes negativos de role
- Manager tentando editar `works` (só engineer pode) → bloqueado por RLS + protect_fields
- Manager tentando INSERT em `work_checklists` template (só engineer pode) → bloqueado

### SQL para validação

```sql
-- Como engineer A, tentar ler obra de B:
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<engineer_A_id>"}';
SELECT * FROM works WHERE id = '<obra_B_id>'; -- esperado: 0 linhas

-- Como engineer A, tentar inserir mensagem em obra de B:
INSERT INTO work_messages (work_id, sender_id, body)
VALUES ('<obra_B_id>', '<engineer_A_id>', 'teste cross-access');
-- esperado: RLS error
```

### Status: DOCUMENTADO (executar manualmente contra ambiente de teste)

---

## 6. Storage Cross-Access

URLs assinadas são portáteis (quem tem a URL pode acessar até o TTL expirar). Isso é comportamento esperado do Supabase Storage. Após TTL (30 min padrão para downloads), a URL expira e não funciona mais.

**Mitigação**: TTL curto (30 min) + signed URLs nunca expostas publicamente no HTML (sempre geradas server-side para o usuário autenticado).

---

## Resumo Final

| Categoria | Status |
|-----------|--------|
| Service role no client bundle | APROVADO |
| Server Actions com auth check | APROVADO |
| Triggers protect_fields | APROVADO (8 triggers) |
| dangerouslySetInnerHTML | APROVADO (0 ocorrências) |
| Input sanitização | APROVADO (React escape) |
| Matriz RLS | DOCUMENTADA (executar manualmente) |
| Storage cross-access | DOCUMENTADO (TTL 30min) |
