# ESCOPO APK — OrçaRede / Módulo Andamento de Obra (Campo)

**Versão:** 1.0.0
**Data:** 2026-05-08
**Audiência:** Cursor (agente de código) + coordenador (Claude) + desenvolvedor humano
**Referências cruzadas:** `SYSTEM_DOSSIER.md` (contexto web completo), `docs/apk-contracts/01..12` (contratos formais)

> Este documento é a **fonte de verdade** para todo código do APK. Antes de implementar qualquer feature, consulte a seção correspondente. Quando houver conflito entre este documento e o dossiê web, **este documento prevalece** para decisões de APK.

---

## Sumário

| Seção | Conteúdo |
| ----: | -------- |
| 1 | Produto e persona |
| 2 | Stack travada |
| 3 | Arquitetura de comunicação (PostgREST + RPC + Storage SDK) |
| 4 | Inventário completo: o que o APK consome e como |
| 5 | Offline-first: fila outbox e sync engine |
| 6 | Realtime: canais, retry, reconexão |
| 7 | Push notifications |
| 8 | Padrões obrigatórios (idempotência, foto-antes-registro, compressão) |
| 9 | Convenções de RPC SQL |
| 10 | Roadmap de blocos |
| 11 | Estrutura de pastas do APK |
| 12 | Decisões arquiteturais travadas |
| 13 | Dívidas técnicas herdadas e novas |
| 14 | Testes |
| 15 | Build, distribuição e ambiente |
| 16 | UX e constraints de dispositivo |
| 17 | Glossário rápido |

---

## 1. Produto e persona

### O que é o APK

Contraparte de campo do módulo **Andamento de Obra** do OrçaRede. O gerente segue como ator principal do APK, e o engenheiro também pode acessar o app quando precisar operar pelo fluxo móvel. O APK **complementa** o web — não substitui.

### Persona principal: Manager (Gerente de obra)

- Opera no canteiro, frequentemente em zona rural com 4G/3G fraco
- Usa celular Android barato a médio (target: Android 8+, 2GB RAM)
- O manager normalmente recebe credenciais do engenheiro (email + senha temporária)
- O engineer também pode entrar com a própria conta do OrçaRede para usar o fluxo móvel
- No APK, `manager` e `engineer` são aceitos no login; o comportamento móvel continua o mesmo para ambos
- Pode estar alocado em N obras simultaneamente

### O que o APK faz

1. **Login** com email/senha via Supabase Auth, validando acesso do papel ao APK (`manager` ou `engineer`)
2. **Listar obras visíveis** ao usuário logado (RLS filtra implicitamente)
3. **Por obra**:
   - Chat 1:1 com engineer (texto + foto + áudio + vídeo curto)
   - Marcar postes instalados (tap no PDF + foto + GPS + numeração)
   - Publicar diário de obra (atividades, metragem, materiais, presença, fotos)
   - Reportar marcos atingidos (evidência foto)
   - Marcar itens de checklists (texto + foto se exigido)
   - Abrir alertas de emergência (severidade + foto + GPS + descrição)
   - Consultar equipe alocada
4. **Receber notificações** (push + Realtime) de ações do engenheiro
5. **Funcionar 100% offline** — fila local SQLite sincroniza quando voltar conexão

### O que o APK NÃO faz

- Não visualiza canvas com camadas elaboradas (web)
- Não tem dashboards, gráficos S-curve, KPIs
- Não gerencia pessoas (crew, managers, engineers — tudo vem do web)
- Não importa orçamentos
- Não tem galeria unificada (cada feature mostra suas mídias)
- Não cria templates de checklist (engineer no web)
- Não valida diários, marcos ou checklists (engineer no web)
- Não fecha alertas (engineer no web)

---

## 2. Stack travada

### Core

| Camada | Tecnologia | Notas |
| ------ | ---------- | ----- |
| Framework | React Native + Expo (EAS Build + Dev Client) | Managed workflow com Dev Client desde Bloco 1 |
| Linguagem | TypeScript estrito (`strict: true`, sem `any`) | |
| BaaS | Supabase (Auth, PostgREST, Storage, Realtime) | Mesmo projeto do web: `ubqyjbtjkzxlexbuxoum` (dev) |
| State (server) | TanStack Query (React Query) | Cache, revalidação, invalidação via Realtime |
| State (UI) | Zustand | Sessão, conectividade, contagem de fila, sync status |
| Fila offline | expo-sqlite (API async/next) | Tabela `outbox` local; sync engine custom |
| Navegação | Expo Router (file-based) | Deep linking nativo pra push notifications |
| Forms | react-hook-form + zod | Schemas declarados no APK (não compartilha com web) |

### Mídia e device

| Lib | Uso |
| --- | --- |
| `expo-image-picker` + `expo-camera` | Captura de foto/vídeo |
| `expo-image-manipulator` | Compressão de imagem (1920x1080, JPEG q85) |
| `expo-location` | GPS (opcional, nunca bloqueante) |
| `expo-file-system` | Gerenciar uploads/downloads locais |
| `expo-notifications` | Push (Expo → FCM no Android) |
| `expo-secure-store` | Armazenar **apenas** refresh_token |
| `react-native-pdf` | Renderizar PDF da planta (tap detection pra postes) |
| `@react-native-community/netinfo` | Detectar mudanças de conectividade |
| `react-native-reanimated` | Animações (requisito de várias libs) |

### Observabilidade

| Lib | Uso |
| --- | --- |
| Sentry React Native | Crash reporting + breadcrumbs desde Bloco 1 |

### Decisões explícitas de NÃO usar

| Tecnologia | Razão |
| ---------- | ----- |
| WatermelonDB | Sync engine não casa com 8+ Server Actions distintas; conflita com React Query |
| Redux Toolkit | Overkill pro escopo; Zustand cobre |
| AsyncStorage pra tokens | Inseguro; usar SecureStore pra refresh_token |
| Server Actions Next.js | APK não é browser; consome Supabase SDK direto |
| Edge Functions pra upload URLs | Storage policies já validam; APK gera signed URL direto |

---

## 3. Arquitetura de comunicação

### Diagrama mental

```
APK (React Native)
  │
  ├── Supabase Auth SDK ─────────── Login, sessão, refresh
  │
  ├── PostgREST (via supabase.from) ── Reads + writes simples (RLS gateia)
  │
  ├── RPC SQL (via supabase.rpc) ──── 8 composite writes (transação atômica)
  │
  ├── Storage SDK ───────────────── Upload/download de mídia (signed URLs)
  │
  └── Realtime SDK ──────────────── 3 canais (chat, events, notifications)
```

### Por que NÃO Server Actions

Server Actions do Next.js 16:
- URL gerada pelo bundler (não estável)
- Auth via cookie httpOnly (não Bearer)
- Serialização proprietária

APK precisa de Bearer auth padrão Supabase. Solução: **consumir Supabase diretamente**.

### Consequência: divergência web ↔ APK

Web usa Server Actions TypeScript. APK usa RPCs SQL. Mesma regra de negócio, duas implementações. Catalogado como **DEBT-015**.

**Estratégia escolhida: 3c** — duplicar agora com testes de contrato que comparam input/output das duas implementações. Refactor pra fonte única (Caminho 3a: Server Actions viram thin wrappers de RPCs) planejado pós-v1.

---

## 4. Inventário completo: o que o APK consome e como

### Categoria A1 — PostgREST direto (reads + writes simples)

Nenhum destes precisa de RPC. RLS + triggers já gateiam.

| Operação | Query PostgREST | Notas |
| -------- | --------------- | ----- |
| Listar obras | `from('works').select('*').order('last_activity_at', {ascending: false})` | RLS filtra por `work_members` |
| Detalhe obra | `from('works').select('*').eq('id', workId).single()` | |
| Mensagens (paginação) | `from('work_messages').select('*, work_message_attachments(*)').eq('work_id', workId).order('created_at', {ascending: false}).lt('created_at', cursor).limit(50)` | Cursor-based |
| Marcar mensagens lidas | `from('work_messages').update({read_by_manager_at: new Date().toISOString()}).eq('work_id', workId).is('read_by_manager_at', null)` | Trigger valida campos |
| Milestone → in_progress | `from('work_milestones').update({status: 'in_progress'}).eq('id', milestoneId)` | Trigger `protect_fields` valida transição |
| Checklist → in_progress | `from('work_checklists').update({status: 'in_progress'}).eq('id', checklistId)` | Idem |
| Remover poste (soft) | `from('work_pole_installations').update({status: 'removed', removed_at: now, removed_by: userId}).eq('id', installationId)` | Trigger valida que é o criador |
| Marcar notificação lida | `from('notifications').update({is_read: true}).eq('id', notifId)` | RLS: `user_id = auth.uid()` |
| Marcar todas lidas | `from('notifications').update({is_read: true}).eq('user_id', userId).eq('is_read', false)` | |
| Listar equipe da obra | `from('work_team').select('*, crew_members(*)').eq('work_id', workId)` | Manager lê; crew_members vem via JOIN |
| Presença diária | `from('work_team_attendance').select('*').eq('work_id', workId)` | Read-only |
| Notificações (paginação) | `from('notifications').select('*').eq('user_id', userId).order('created_at', {ascending: false}).lt('created_at', cursor).limit(20)` | |
| Diário + revisões | `from('work_daily_logs').select('*, work_daily_log_revisions(*, work_daily_log_media(*))').eq('id', dailyLogId).single()` | + batch `createSignedUrls` pra mídias |
| Milestone + eventos | `from('work_milestones').select('*, work_milestone_events(*, work_milestone_event_media(*))').eq('id', milestoneId).single()` | + batch signed URLs |
| Instalação + mídias | `from('work_pole_installations').select('*, work_pole_installation_media(*)').eq('id', installationId).single()` | + batch signed URLs |
| Checklist + itens | `from('work_checklists').select('*, work_checklist_items(*, work_checklist_item_media(*))').eq('id', checklistId).single()` | + batch signed URLs |
| Alerta + updates | `from('work_alerts').select('*, work_alert_updates(*, work_alert_media(*))').eq('id', alertId).single()` | + batch signed URLs |
| Listar marcos da obra | `from('work_milestones').select('*').eq('work_id', workId).order('order_index')` | 6 marcos fixos |
| Listar checklists da obra | `from('work_checklists').select('*').eq('work_id', workId).order('created_at', {ascending: false})` | |
| Listar alertas da obra | `from('work_alerts').select('*').eq('work_id', workId).order('created_at', {ascending: false})` | |
| Listar instalações da obra | `from('work_pole_installations').select('*').eq('work_id', workId).eq('status', 'installed').order('created_at', {ascending: false})` | Exclui `removed` |
| Listar diários da obra | `from('work_daily_logs').select('*, work_daily_log_revisions(id, revision_number, created_at)').eq('work_id', workId).order('log_date', {ascending: false})` | |
| Snapshot do projeto | `from('work_project_snapshot').select('*').eq('work_id', workId).single()` | PDF path + materiais + metragens |
| Postes planejados | `from('work_project_posts').select('*').eq('work_id', workId)` | Referência visual no PDF |
| Conexões planejadas | `from('work_project_connections').select('*').eq('work_id', workId)` | Referência visual no PDF |
| Perfil do usuário | `from('profiles').select('*').eq('id', userId).single()` | Pós-login, validar acesso ao APK para `manager`/`engineer` |

### Categoria A2 — RPCs SQL (8 composite writes)

Cada RPC recebe JSONB e opera em transação atômica. Todas seguem as convenções da Seção 9.

| RPC | Tabelas envolvidas | Idempotência | Bloco |
| --- | ------------------ | ------------ | ----- |
| `rpc_send_work_message` | `work_messages` + `work_message_attachments` | `client_event_id` UNIQUE WHERE NOT NULL | 2 |
| `rpc_publish_daily_log` | `work_daily_logs` + `work_daily_log_revisions` + `work_daily_log_media` | `client_event_id` UNIQUE WHERE NOT NULL na revision | 4 |
| `rpc_report_milestone` | `work_milestones` (UPDATE status) + `work_milestone_events` + `work_milestone_event_media` | `client_event_id` UNIQUE WHERE NOT NULL no event | 5 |
| `rpc_record_pole_installation` | `work_pole_installations` + `work_pole_installation_media` | `client_event_id` NOT NULL UNIQUE | 3 |
| `rpc_open_alert` | `work_alerts` + `work_alert_updates` + `work_alert_media` | `client_event_id` NOT NULL UNIQUE | 7 |
| `rpc_resolve_alert_in_field` | `work_alerts` (UPDATE) + `work_alert_updates` + `work_alert_media` | `client_event_id` UNIQUE WHERE NOT NULL no update | 7 |
| `rpc_add_alert_comment` | `work_alert_updates` + `work_alert_media` | `client_event_id` UNIQUE WHERE NOT NULL | 7 |
| `rpc_mark_checklist_item` | `work_checklist_items` (UPDATE) + `work_checklist_item_media` | `client_event_id` UNIQUE WHERE NOT NULL | 6 |

### Categoria B — Storage SDK direto

Upload e download de mídia. APK chama `supabase.storage.from('andamento-obra')` diretamente. Storage policies validam membership + role.

| Operação | Método SDK | Notas |
| -------- | ---------- | ----- |
| Gerar URL de upload | `createSignedUploadUrl(path)` | APK gera UUID + monta path canônico |
| Upload de arquivo | `uploadToSignedUrl(path, token, file)` | Ou `upload(path, file)` se preferir |
| Gerar URL de download | `createSignedUrl(path, ttl)` | TTL 1800s (30min) |
| Batch download URLs | `createSignedUrls(paths, ttl)` | Pra listar mídias de um registro |
| Download direto | `download(path)` | Pra cache local se necessário |

**Paths canônicos** (sempre prefixados por `work_id`):

```
{work_id}/chat/{message_id}/{file_uuid}.{ext}
{work_id}/daily-logs/{daily_log_id}/{revision_id}/{uuid}.{ext}
{work_id}/milestones/{milestone_id}/{event_id}/{uuid}.{ext}
{work_id}/pole-installations/{installation_id}/{uuid}.{ext}
{work_id}/checklists/{checklist_id}/{item_id}/{uuid}.{ext}
{work_id}/alerts/{alert_id}/{uuid}.{ext}
{work_id}/project/projeto.pdf
```

---

## 5. Offline-first: fila outbox e sync engine

### Princípio fundamental

**Toda ação de escrita do manager** é gravada numa fila SQLite local **antes** de qualquer chamada de rede. UI confirma localmente. Sincronização é background.

### Tabela `outbox` (SQLite local)

```sql
CREATE TABLE IF NOT EXISTS outbox (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_event_id TEXT    NOT NULL UNIQUE,
  action_type     TEXT    NOT NULL,  -- 'send_message', 'publish_daily_log', etc.
  payload         TEXT    NOT NULL,  -- JSON stringified
  media_paths     TEXT,              -- JSON array de paths locais de mídia pendente
  status          TEXT    NOT NULL DEFAULT 'pending',
                                     -- 'pending' | 'uploading_media' | 'calling_rpc' | 'synced' | 'failed'
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  last_error      TEXT,
  created_at      TEXT    NOT NULL,  -- ISO timestamp
  synced_at       TEXT,
  next_retry_at   TEXT               -- calculado por backoff exponencial
);
```

### Ciclo de vida de um item na fila

```
1. Manager executa ação (ex.: tirar foto de poste)
2. APK gera client_event_id (UUID v4)
3. APK insere na outbox com status='pending'
4. UI atualiza imediatamente (optimistic update via React Query)
5. Se há conexão:
   a. status → 'uploading_media'
   b. Pra cada mídia: comprimir → signed URL → PUT no Storage
   c. status → 'calling_rpc'
   d. Chamar RPC com payload + storage_paths das mídias
   e. Se sucesso: status → 'synced', synced_at = now
   f. Se erro 23505 (unique violation): status → 'synced' (idempotência)
   g. Se erro de rede/timeout: attempts++, calcular next_retry_at, status → 'pending'
   h. Se attempts >= max_attempts: status → 'failed' (requer review manual)
6. Se NÃO há conexão:
   a. Item permanece 'pending'
   b. NetInfo detecta reconexão → processar fila FIFO
```

### Backoff exponencial

```
Tentativa 1: 1s
Tentativa 2: 5s
Tentativa 3: 15s
Tentativa 4: 60s
Tentativa 5: desiste → status='failed'
```

### Ordem de processamento

FIFO estrita por `created_at`. Não paralelizar — uma ação por vez evita race conditions (ex.: mensagem que referencia obra que ainda não foi synced).

Exceção: uploads de mídia de um mesmo item podem ser paralelos (até 3 simultâneos).

### Indicadores visuais

- Home: badge "N ações pendentes" quando fila > 0
- Por item: ícone de sync girando enquanto `status='uploading_media'` ou `'calling_rpc'`
- Toast "Tudo sincronizado" quando fila zera
- Banner persistente "Sem conexão — ações serão enviadas quando voltar" quando offline

### Logout com fila pendente

Se fila > 0 ao tentar logout: modal de confirmação "Ainda há N ações pendentes. Sair vai descartá-las. Continuar?". Se confirmar: limpar outbox + limpar cache React Query + signOut.

---

## 6. Realtime: canais, retry, reconexão

### 3 canais

| Canal | Tabela(s) | Filtro | Uso |
| ----- | --------- | ------ | --- |
| `work:{work_id}:chat` | `work_messages` (INSERT) | `work_id=eq.{workId}` | Nova mensagem → adicionar à lista local |
| `work:{work_id}:events` | `work_daily_logs` (UPDATE), `work_daily_log_revisions` (INSERT), `work_milestone_events` (INSERT), `work_pole_installations` (INSERT/UPDATE), `work_checklists` (UPDATE), `work_alerts` (UPDATE) | `work_id=eq.{workId}` | Reagir a eventos relevantes (diário rejeitado, marco aprovado, etc.) |
| `user:{user_id}:notifications` | `notifications` (INSERT) | `user_id=eq.{userId}` | Badge + push local |

### Assinatura

- Assinar `user:{user_id}:notifications` logo após login (global)
- Assinar `work:{work_id}:chat` e `work:{work_id}:events` ao entrar na tela de uma obra
- Desassinar canais de obra ao sair da tela (cleanup no `useEffect` return)

### Retry de mídia após Realtime INSERT

Quando Realtime entrega um registro pai (ex.: nova mensagem), a mídia pode não ter chegado ainda. Padrão:

```
1. Receber evento INSERT de work_messages
2. Se mensagem tem attachments esperados (count > 0):
   a. Tentar fetch de work_message_attachments
   b. Se vazio: retry após 250ms
   c. Se vazio: retry após 500ms
   d. Se vazio: retry após 750ms
   e. Se vazio após 3 tentativas: renderizar mensagem sem mídia; carregar lazy quando usuário abrir
```

### Desconexão e reconexão

- Timeout 10s sem heartbeat → banner "Sem conexão em tempo real"
- SDK reconecta automaticamente
- Após reconexão: usar `created_at` do último item local como cursor pra resync delta (fetch registros mais recentes que o cursor)

### Sem polling

Realtime + push cobrem 99% dos casos. Polling manual a cada 60s é fallback **opcional** quando Realtime cai (exibir banner "sem tempo real"). Não implementar polling por padrão.

---

## 7. Push notifications

### Registro de token

```typescript
// Após login e permissão concedida
const token = (await Notifications.getExpoPushTokenAsync()).data;
await supabase.from('device_tokens').upsert({
  user_id: session.user.id,
  token: token,
  platform: 'android',
  last_seen_at: new Date().toISOString()
}, { onConflict: 'token' });
```

### Multidevice

- Manager pode ter N devices → N tokens
- Push vai pra TODOS os tokens do `user_id`
- Logout em device A NÃO invalida device B
- Token órfão (>30 dias sem `last_seen_at` update): limpeza futura (DEBT)

### Payloads esperados

Baseado nos `kind` da tabela `notifications`:

| `kind` | Deep link | Tela |
| ------ | --------- | ---- |
| `message_received` | `/obra/{workId}/chat` | Chat da obra |
| `daily_log_approved` | `/obra/{workId}/diario/{dailyLogId}` | Detalhe do diário |
| `daily_log_rejected` | `/obra/{workId}/diario/{dailyLogId}` | Detalhe do diário (com motivo) |
| `milestone_approved` | `/obra/{workId}/marcos` | Lista de marcos |
| `milestone_rejected` | `/obra/{workId}/marcos` | Lista de marcos |
| `checklist_validated` | `/obra/{workId}/checklists/{checklistId}` | Detalhe do checklist |
| `checklist_returned` | `/obra/{workId}/checklists/{checklistId}` | Detalhe do checklist (com motivo) |
| `alert_closed` | `/obra/{workId}/alertas/{alertId}` | Detalhe do alerta |

### Princípio: push AVISA, nunca ACIONA

Push não executa ação automática. Tap → deep link → tela → fetch dados frescos. Se push duplicado, app não duplica ação. Se push falha, Realtime + revalidação cobrem.

### Backend (Bloco 8b)

Edge Function que escuta INSERT em `notifications` e dispara via Expo Push API:
1. Trigger `AFTER INSERT ON notifications` chama Edge Function (ou pg_net)
2. Edge Function busca tokens em `device_tokens` WHERE `user_id` = notification.user_id
3. Envia batch via `https://exp.host/--/api/v2/push/send`

---

## 8. Padrões obrigatórios

### 8.1 Idempotência por `client_event_id`

- **Geração**: UUID v4 no dispositivo **ANTES** de qualquer side effect
- **Momento**: antes de comprimir foto, antes de upload, antes de qualquer chamada de rede
- **Persistência**: salvo na `outbox` local; enviado no payload da RPC
- **Servidor**: UNIQUE constraint no banco. Se duplicado → 23505 → APK trata como sucesso
- **Tabelas com `client_event_id`**: `work_messages`, `work_daily_log_revisions`, `work_milestone_events`, `work_pole_installations` (NOT NULL UNIQUE), `work_checklist_items`, `work_alerts` (NOT NULL UNIQUE), `work_alert_updates`

### 8.2 Foto ANTES do registro principal

Ordem canônica para toda ação com mídia:

```
1. Gerar client_event_id (UUID v4)
2. Gerar IDs dos registros (installationId, messageId, etc.) — UUID v4 client-side
3. Comprimir foto/vídeo/áudio (ver 8.3)
4. Montar path canônico: {work_id}/{feature}/{record_id}/{uuid}.{ext}
5. Obter signed upload URL: supabase.storage.createSignedUploadUrl(path)
6. PUT no Storage via signed URL
7. SÓ DEPOIS: chamar RPC com payload + storage_paths das mídias já uploadadas
```

Se app crashar entre passos 6 e 7: foto fica órfã no Storage. Cleanup via batch job futuro (DEBT-006).

### 8.3 Compressão de mídia

| Tipo | Spec | Limite por feature |
| ---- | ---- | ------------------ |
| Imagem | Max 1920×1080, JPEG qualidade 85 | 10MB (todas) |
| Vídeo | Max 720p, H.264, 30s (limite de captura, sem recompressão) | 100MB (chat), 50MB (demais) |
| Áudio | AAC/M4A, mono, 64kbps | 25MB (chat only) |

Compressão via `expo-image-manipulator` para imagens. Vídeo: travar na câmera (720p, 30s max), não recomprimir.

### 8.4 GPS opcional

- Solicitar permissão na primeira ação que precisa
- Se negada ou indisponível: prosseguir SEM coordenadas
- Banco aceita NULL em `gps_lat`, `gps_lng`, `gps_accuracy_meters`
- Se `gps_accuracy_meters > 50`: exibir aviso "Precisão baixa" mas permitir prosseguir
- Nunca bloquear ação por falta de GPS

### 8.5 Timestamp do dispositivo

`installed_at` em `work_pole_installations` é o timestamp do **dispositivo** no momento da ação, não o da sincronização. Preserva timeline real quando offline.

Extrair timestamp original do EXIF da foto (quando disponível) antes da compressão.

---

## 9. Convenções de RPC SQL

Documento de referência para todas as 8 RPCs. Padrão definido **antes** da primeira RPC (Bloco 2).

### Assinatura padrão

```sql
CREATE OR REPLACE FUNCTION rpc_nome_da_funcao(input JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER  -- opera com permissão do owner, não do caller
SET search_path = public
AS $$ ... $$;

-- Revogar acesso direto; apenas PostgREST autenticado pode chamar
REVOKE EXECUTE ON FUNCTION rpc_nome_da_funcao FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpc_nome_da_funcao TO authenticated;
```

### Validação de membership

Toda RPC começa validando que `auth.uid()` é membro da obra:

```sql
-- Dentro da RPC:
PERFORM 1 FROM work_members
  WHERE work_id = (input->>'work_id')::uuid
    AND user_id = auth.uid();
IF NOT FOUND THEN
  RAISE EXCEPTION 'Acesso negado' USING errcode = 'P0403';
END IF;
```

### Retorno de sucesso

RPC retorna JSONB com os campos relevantes:

```sql
RETURN jsonb_build_object(
  'installationId', new_id,
  'isNew', is_new
);
```

APK SDK recebe `{ data: { installationId, isNew }, error: null }`.

### Erros

| Cenário | Comportamento SQL | Código | APK trata como |
| ------- | ----------------- | ------ | -------------- |
| Validação falhou | `RAISE EXCEPTION 'Motivo' USING errcode = 'P0001'` | P0001 | `{ success: false, error: 'Motivo' }` |
| Sem acesso (RLS/membership) | `RAISE EXCEPTION 'Acesso negado' USING errcode = 'P0403'` | P0403 | `{ success: false, error: 'Acesso negado' }` |
| Idempotência (duplicate) | `INSERT ... ON CONFLICT (client_event_id) DO NOTHING` + `SELECT` existente | — (sem erro) | `{ success: true, data: existingRecord }` |
| CHECK constraint violado | Postgres nativo | 23514 | `{ success: false, error: mensagem mapeada }` |
| UNIQUE violation (não-idempotência) | Postgres nativo | 23505 | `{ success: false, error: 'Registro duplicado' }` |

### Wrapper no APK

```typescript
// lib/supabase/rpc.ts
async function callRpc<T>(name: string, input: Record<string, unknown>): Promise<ActionResult<T>> {
  const { data, error } = await supabase.rpc(name, { input: JSON.stringify(input) });
  if (error) {
    if (error.code === '23505') {
      // Idempotência: já existe, tratar como sucesso
      // Buscar registro existente se necessário
      return { success: true, data: data as T };
    }
    return { success: false, error: error.message };
  }
  return { success: true, data: data as T };
}
```

---

## 10. Roadmap de blocos

### Bloco 1 — Fundação + Auth + Obras

**Escopo**:
- Setup Expo + EAS Build + Dev Client
- Sentry React Native (crash reporting desde dia 1)
- Jest configurado (unit tests pra helpers)
- Supabase client configurado (Auth + PostgREST + Storage + Realtime)
- Auth flow: login → validar acesso ao APK (`manager`/`engineer`) → redirecionar → logout
- Troca de senha no primeiro login
- Listagem de obras alocadas (PostgREST + RLS)
- Tela de detalhe da obra (dados básicos)
- Zustand store: sessão, conectividade
- Infra mínima da fila offline (tabela `outbox` + API `enqueue/processNext/markSynced/markFailed`)
- NetInfo listener (detectar online/offline)
- Documento `13-rpc-conventions.md`
- Inventário de RPCs necessárias (este documento, Seção 4)
- DEBT-015 catalogada em `known-debt.md`

**Não inclui**: nenhuma feature de obra (chat, postes, diário, etc.)

### Bloco 2 — Chat + Realtime + Upload de mídia

**Escopo**:
- RPC `rpc_send_work_message` (primeira RPC real)
- Chat 1:1 engineer ↔ manager por obra
- Realtime: canal `work:{work_id}:chat` (INSERT → nova mensagem)
- Upload de foto/áudio/vídeo com signed URL direto
- Compressão de imagem via `expo-image-manipulator`
- Fila offline: mensagem entra na outbox, sincroniza quando há conexão
- Paginação cursor-based pra mensagens antigas
- Marcar mensagens como lidas (PostgREST direto)
- Retry 3x250ms pra gap de mídias pós-Realtime

**Saída**: primeiro uso real da fila offline + Realtime + upload de mídia

### Bloco 3 — Marcação de postes no PDF

**Escopo**:
- RPC `rpc_record_pole_installation`
- PDF rendering via `react-native-pdf` (EAS Dev Client)
- Tap detection no PDF → converter coordenada de toque pra quadro lógico 6000×6000
- Foto obrigatória (câmera) + GPS opcional
- `installed_at` = timestamp do dispositivo
- Idempotência forte (`client_event_id` NOT NULL UNIQUE)
- Listar postes instalados da obra (PostgREST)
- Remover poste (soft delete, PostgREST direto)
- Fila offline: marcar poste offline, sincronizar depois

**Feature mais complexa do APK.** Riscos: PDF gestures, conversão de coordenadas, performance com PDFs grandes.

### Bloco 4 — Diário de obra

**Escopo**:
- RPC `rpc_publish_daily_log`
- Form denso: atividades (10-4000 chars), `crew_present[]`, postes instalados count, metragem (BT/MT/rede), materiais consumidos, incidentes, fotos
- Publicação → status `pending_approval`
- Receber rejeição via Realtime (`work:{work_id}:events`)
- Republicar com nova revisão (diário rejeitado → nova revision → `pending_approval`)
- Listar diários da obra
- Detalhe do diário com histórico de revisões

### Bloco 5 — Marcos (Milestones)

**Escopo**:
- RPC `rpc_report_milestone`
- Listar 6 marcos da obra (PostgREST)
- Reportar marco: `pending/in_progress → awaiting_approval` com notes + fotos
- Mover pra `in_progress` (PostgREST direto)
- Receber aprovação/rejeição via Realtime
- Detalhe do marco com histórico de eventos

### Bloco 6 — Checklists

**Escopo**:
- RPC `rpc_mark_checklist_item`
- Listar checklists atribuídos à obra (PostgREST)
- Mover pra `in_progress` (PostgREST direto)
- Marcar/desmarcar item + foto se `requires_photo = true`
- Auto-complete: trigger move checklist pra `awaiting_validation` quando todos os itens estão done
- Receber validação/devolução via Realtime (com `return_reason`)

### Bloco 7 — Alertas

**Escopo**:
- RPCs: `rpc_open_alert`, `rpc_resolve_alert_in_field`, `rpc_add_alert_comment`
- Abrir alerta: severidade + categoria + título + descrição + GPS + fotos
- Resolver em campo (`open/in_progress → resolved_in_field`)
- Comentar (timeline de tratativas)
- Receber encerramento pelo engineer via Realtime
- Listar alertas da obra

### Bloco 8 — Push notifications

**8a (APK)**:
- Registrar device token Expo em `device_tokens`
- Receber push → exibir notificação nativa
- Tap → deep link → tela relevante via Expo Router
- Atualizar `last_seen_at` do token periodicamente
- Permissões de notificação (request + handle denial gracefully)

**8b (Backend)**:
- Edge Function (ou pg_net + cron) escutando INSERT em `notifications`
- Buscar tokens do `user_id` em `device_tokens`
- Enviar batch via Expo Push API
- Tratar receipts (tokens inválidos → marcar pra cleanup)

### Bloco 9 — Offline-first consolidado

**Natureza**: endurecimento, não implementação. Cada bloco anterior já usa a fila.

**Escopo**:
- Sync engine unificada (refatorar se cada bloco divergiu)
- Tratamento robusto: token expirado mid-sync, retry storm, quota exceeded
- Foto órfã: detectar uploads sem registro principal correspondente
- Indicador visual global detalhado (tela de detalhe da fila)
- Telemetria: Sentry breadcrumbs por item da fila
- Cleanup de itens "stuck" (>N tentativas → review manual, não loop infinito)
- Backoff exponencial refinado (1s → 5s → 15s → 60s → failed)
- Teste E2E de cenário offline completo (Detox)

### Bloco 10 — Polimento, build, distribuição

**Escopo**:
- Ícone, splash screen, app.json completo
- Testes em dispositivo real (Pixel 7 do dev + celulares do cliente)
- Build APK assinado via EAS
- Distribuição interna via EAS Internal Distribution
- Play Store testing track (private)
- Performance profiling (Android 8, 2GB RAM)
- Revisão final de a11y
- Update do dossiê e contratos com estado final

---

## 11. Estrutura de pastas do APK

```
orcarede-apk/
  app/                          # Expo Router (file-based routing)
    (auth)/
      login.tsx
      change-password.tsx
    (main)/
      _layout.tsx               # Tab navigator ou drawer
      index.tsx                 # Home: lista de obras
      obra/
        [workId]/
          _layout.tsx           # Tabs por feature dentro da obra
          index.tsx             # Detalhe da obra
          chat.tsx
          postes.tsx
          diario/
            index.tsx
            [dailyLogId].tsx
          marcos.tsx
          checklists/
            index.tsx
            [checklistId].tsx
          alertas/
            index.tsx
            [alertId].tsx
          equipe.tsx
      notificacoes.tsx
  src/
    lib/
      supabase/
        client.ts               # Singleton Supabase client (com SecureStore adapter)
        rpc.ts                  # Wrapper callRpc<T> genérico
        storage.ts              # Helpers de signed URL + upload
      offline/
        outbox.ts               # API da fila: enqueue, processNext, markSynced, markFailed
        db.ts                   # expo-sqlite init + migrations
        sync-worker.ts          # Background sync loop (NetInfo-driven)
      auth/
        session.ts              # Zustand slice de sessão
        guard.ts                # Redirect se não autenticado / role errado
      media/
        compress.ts             # Compressão de imagem (1920x1080, q85)
        capture.ts              # Wrappers de camera/image-picker
      location/
        gps.ts                  # Request permission + get coords (optional, never blocking)
    hooks/
      useRealtimeChannel.ts     # Subscribe/unsubscribe com cleanup
      useOutboxCount.ts         # Quantidade de itens pendentes
      useNetworkStatus.ts       # Online/offline state
      useSignedUrl.ts           # Fetch signed URL com cache
    stores/
      session.store.ts          # Zustand: user, isAuthenticated, role
      connectivity.store.ts     # Zustand: isOnline, isRealtimeConnected
      sync.store.ts             # Zustand: pendingCount, isSyncing
    types/
      index.ts                  # Types do APK (espelham DB schema)
      rpc.ts                    # Types de input/output das RPCs
    constants/
      limits.ts                 # Limites de mídia, tamanhos, etc.
      paths.ts                  # Constructors de storage paths canônicos
    utils/
      uuid.ts                   # UUID v4 generation
      date.ts                   # Formatação pt-BR
  __tests__/                    # Jest unit tests
  e2e/                          # Detox E2E tests (a partir do Bloco 3)
  app.config.ts                 # Expo config (env vars, plugins)
  eas.json                      # EAS Build config (dev, preview, production)
  tsconfig.json
  babel.config.js
  package.json
```

---

## 12. Decisões arquiteturais travadas

| # | Decisão | Razão |
| - | ------- | ----- |
| 1 | React Native + Expo com EAS Build + Dev Client desde Bloco 1 | Libs nativas (react-native-pdf, Sentry) exigem Dev Client; evita refactor |
| 2 | APK consome Supabase SDK direto, NUNCA Server Actions Next.js | Server Actions usam cookie auth + URL instável; APK usa Bearer |
| 3 | 8 RPCs SQL para composite writes; PostgREST direto para o resto | Minimiza superfície de RPCs; aproveita RLS + triggers existentes |
| 4 | Storage signed URLs geradas client-side (não via Edge Function) | Storage policies já validam membership + role |
| 5 | TanStack Query para server state + Zustand para UI state | React Query: cache/revalidação; Zustand: sessão/sync status |
| 6 | expo-sqlite para fila offline (não WatermelonDB) | Sync engine do WatermelonDB não casa com 8+ actions distintas |
| 7 | Expo Router para navegação (file-based) | Deep linking nativo pra push; alinha com mental model do Next.js |
| 8 | react-native-pdf para PDF rendering | Tap detection nativa; gestos nativos; performance em Android low-end |
| 9 | Sentry desde Bloco 1 | APK em campo sem crash reporting = cegueira |
| 10 | Jest desde Bloco 1, Detox a partir do Bloco 3 | Não repetir DEBT-008 (web sem testes) |
| 11 | SecureStore APENAS pra refresh_token | Limite de ~2KB; metadados vão em SQLite ou MMKV |
| 12 | GPS NUNCA bloqueia ação | Manager pode estar sem sinal GPS; banco aceita NULL |
| 13 | Foto ANTES do registro principal | Garante que registro nunca fica sem mídia |
| 14 | Vídeo travado em 720p/30s na captura (sem recompressão) | Recompressão em RN é dolorosa e frágil |
| 15 | Manager NUNCA cria templates de checklist | RLS bloqueia; é função exclusiva do engineer no web |
| 16 | Push AVISA, nunca ACIONA | Tolerância a duplicatas; ação sempre do usuário |
| 17 | Multidevice por manager permitido | Gerente pode ter celular + tablet; push vai pra todos os tokens |
| 18 | FIFO estrita na fila de sync | Evita race conditions entre ações dependentes |
| 19 | DEBT-015 (divergência web ↔ APK) mitigada com testes de contrato | Caminho 3c; refactor pra fonte única planejado pós-v1 |
| 20 | minSdkVersion 26 (Android 8+) | Bate com todas as libs; atende target de celular barato |

---

## 13. Dívidas técnicas

### Herdadas do web (relevantes pro APK)

| ID | Severidade | Resumo | Impacto APK |
| -- | ---------- | ------ | ----------- |
| DEBT-005 | Baixa | PDF signed URL sem fallback | APK deve tratar falha com retry + empty state |
| DEBT-006 | Média | Cleanup de uploads órfãos manual | APK gera órfãos quando offline; cron job futuro |
| DEBT-008 | **Alta** | Sem testes E2E/unitários no web | APK nasce com Jest + Detox (não repetir) |
| DEBT-010 | Baixa | i18n não implementada (pt-BR hardcoded) | APK segue mesmo idioma |
| DEBT-011 | Média | Sem métricas/analytics | APK tem Sentry desde v1 |
| DEBT-014 | Baixa | Cross-project Storage (dev → prod) | Não bloqueia APK |

### Novas do APK

| ID | Severidade | Resumo | Quando resolver |
| -- | ---------- | ------ | --------------- |
| DEBT-015 | Média | Divergência Server Action (web) ↔ RPC SQL (APK) | Pós-v1: refactor 3a (Server Actions viram thin wrappers) |
| DEBT-016 | Baixa | Token órfão em `device_tokens` (>30 dias sem uso) | Bloco 8/9 |
| DEBT-017 | Baixa | Recompressão de vídeo não implementada | Se necessidade surgir |

---

## 14. Testes

### Unit tests (Jest) — desde Bloco 1

- Helpers de compressão de imagem
- Construção de paths canônicos de Storage
- Conversão de coordenadas (toque → quadro lógico 6000×6000)
- Reducer da fila outbox
- Parsing de erros de RPC → ActionResult
- Cálculo de backoff exponencial

### Testes de contrato (Jest) — desde Bloco 2

Comparam input/output entre Server Action (web) e RPC SQL (APK) para cada par. Garantem que as duas implementações são equivalentes. São a salvaguarda da DEBT-015.

### E2E (Detox) — a partir do Bloco 3

- Login → listar obras → entrar em obra → feature completa → logout
- Cenário offline: desligar rede → executar ação → religar → verificar sync
- Cenário de idempotência: simular retry → verificar que não duplicou

---

## 15. Build, distribuição e ambiente

### Ambiente

| Variável | Valor (dev) | Onde configurar |
| -------- | ----------- | --------------- |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://ubqyjbtjkzxlexbuxoum.supabase.co` | `app.config.ts` via `process.env` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | (valor do projeto dev) | `app.config.ts` via `process.env` |
| `SENTRY_DSN` | (a criar) | `app.config.ts` |

**Service role key NUNCA no APK.** Apenas servidor.

### Build

- **EAS Build** com Dev Client para desenvolvimento
- **EAS Internal Distribution** para testes em dispositivo real (link QR/URL)
- **EAS Production Build** para Play Store

### Distribuição

| Fase | Canal |
| ---- | ----- |
| Blocos 1-9 | EAS Internal Distribution (link de install) |
| Bloco 10 | Play Store testing track privada (convite via Google Group) |
| Produção | Play Store (a definir timing) |

### Dispositivos de teste

- Dev: Pixel 7, Android 14
- Cliente: celulares variados, a partir do Bloco 5+
- Target mínimo: Android 8 (API 26), 2GB RAM

### Path do workspace

Workspace web está em path com "ç" (`Migração`). **APK deve ter workspace em path ASCII** pra evitar problemas com Metro/EAS. Sugestão: `c:\Users\conta\Desktop\dev\orcarede-apk\`.

---

## 16. UX e constraints de dispositivo

### Princípios

- **Botões grandes**: 44px+ touch target (mínimo recomendado por Material Design)
- **Alto contraste**: texto legível sob luz solar forte
- **Fluxos curtos**: max 3 toques pra ação completa
- **Sem animações desnecessárias**: performance em Android low-end
- **Feedback imediato**: UI atualiza localmente antes de sync
- **Status de sync visível**: sempre claro se há ações pendentes

### Cores e tema

- Definir no Bloco 1 (tokens de design)
- Alto contraste obrigatório (ratio WCAG AA mínimo: 4.5:1)
- Dark mode: não priorizar na v1 (dívida aceitável)

### Fontes

- System font (Roboto no Android) — sem custom fonts na v1
- Tamanho mínimo: 14sp para body, 12sp para captions

### Offline indicators

- Banner top: "Sem conexão — ações serão enviadas quando voltar"
- Badge na home: "N ações pendentes"
- Por item: ícone de sync (pending/uploading/synced/failed)
- Toast: "Tudo sincronizado" ao zerar fila

---

## 17. Glossário rápido

| Termo | Definição |
| ----- | --------- |
| Engineer | Usuário do portal web. Cria obras, valida diários/marcos, gerencia templates. Também pode acessar o APK com `role='engineer'` |
| Manager | Usuário principal do APK. Opera no canteiro. `role='manager'`. Conta criada pelo engineer |
| Crew | Membros operacionais sem login. Cadastrados em `crew_members` pelo engineer |
| Obra (`works`) | Projeto de execução de rede elétrica. Entidade central |
| Snapshot | Cópia imutável do projeto importado do orçamento (PDF + materiais + metragens) |
| Marco | 6 fases padrão da obra. Fluxo: pending → in_progress → awaiting_approval → approved/rejected |
| Diário | Registro de atividades de uma data. 1 ativo por (work_id, log_date) |
| Instalação de poste | Poste realmente instalado em campo (distinto do planejado) |
| Alerta | Emergência/incidente em campo. Manager abre; engineer fecha |
| Checklist | Instância atribuída à obra. Manager executa; engineer valida/devolve |
| `client_event_id` | UUID v4 gerado no dispositivo por ação. Garante idempotência forte |
| `ActionResult<T>` | `{ success: true; data: T } \| { success: false; error: string }` |
| `outbox` | Tabela SQLite local com fila de ações pendentes de sync |
| Quadro lógico 6000×6000 | Sistema de coordenadas do canvas PDF |
| RLS | Row Level Security do Postgres. Filtra dados por `auth.uid()` |
| PostgREST | API REST automática do Supabase sobre o banco |
| RPC | Remote Procedure Call via `supabase.rpc()` — função SQL exposta via PostgREST |

---

**Fim do escopo.** Este documento deve ser atualizado ao final de cada bloco com decisões tomadas e mudanças de rumo.
