# Contratos APK — Módulo Andamento de Obra

> **Versão:** `v1.0.0-web-complete`
> **Última atualização:** 2026-05-05

## Visão Geral

O APK Android é a interface de campo do módulo **Andamento de Obra** do OrcaRede. Ele é utilizado exclusivamente pelo **Gerente de Obra** — profissional que está fisicamente no canteiro e reporta ao engenheiro responsável.

O APK **não** possui acesso ao portal web. Toda interação acontece via chamadas diretas ao Supabase (Auth, PostgREST, Storage, Realtime) usando o token JWT do usuário autenticado.

Esta documentação descreve os contratos (queries, RPCs, uploads, canais Realtime) que o APK deve consumir. A implementação web correspondente já está validada e funcional.

---

## Stack

| Camada        | Tecnologia                               |
| ------------- | ---------------------------------------- |
| Backend / API | Next.js 16 App Router (Server Actions)   |
| Runtime       | React 19, TypeScript                     |
| Estilo        | Tailwind CSS v4                          |
| BaaS          | Supabase (Auth, Database, Storage, Realtime) |
| Banco         | PostgreSQL 15 (via Supabase)             |
| APK           | React Native + Expo (futuro)             |

---

## Princípios

### Offline-first

Todas as ações de escrita do APK devem ser salvas em fila local (SQLite) e sincronizadas quando houver conexão. A UI exibe contagem de itens pendentes.

### Idempotência via `client_event_id`

Toda escrita originada no APK deve incluir um campo `client_event_id` (UUID v4 gerado no dispositivo). O banco possui constraint `UNIQUE(client_event_id)` nas tabelas relevantes. Em caso de reenvio, o servidor retorna a linha existente em vez de duplicar.

### Autenticação

- Método: `supabase.auth.signInWithPassword({ email, password })`
- O engenheiro cria a conta do gerente via Admin API com credenciais pré-definidas
- Após login, verificar `profiles.role = 'manager'`
- Token: JWT emitido pelo Supabase Auth, renovado automaticamente pelo SDK
- O gerente **nunca** tem role `engineer`

### GPS opcional

Geolocalização é capturada em todas as ações de campo quando disponível. O APK deve solicitar permissão e enviar coordenadas, mas a ausência de GPS **não** deve bloquear a ação.

---

## Limites Globais

| Recurso       | Limite                                        |
| ------------- | --------------------------------------------- |
| Foto          | Sem limite individual de tamanho              |
| Vídeo         | 100 MB por arquivo (upload mesmo via 4G)      |
| Áudio         | Sem transcrição automática                    |
| Storage local | Sem limite (fotos armazenadas no dispositivo) |

---

## Paginação

Todas as listagens usam **cursor-based pagination** por `created_at DESC`.

- **Não** existe "ir para página N"
- O APK envia o `created_at` do último item recebido como cursor
- O servidor retorna os próximos N registros anteriores a esse cursor
- Tamanho de página padrão: **20 itens**

Exemplo de query paginada:

```typescript
const { data } = await supabase
  .from('work_messages')
  .select('*')
  .eq('work_id', workId)
  .lt('created_at', cursor)          // cursor = created_at do último item
  .order('created_at', { ascending: false })
  .limit(20);
```

---

## Padrão de Retry

Para operações de escrita (quando a fila offline tenta sincronizar):

| Tentativa | Intervalo |
| --------- | --------- |
| 1ª        | 1 segundo |
| 2ª        | 5 segundos |
| 3ª        | 15 segundos |

Após 3 falhas consecutivas, o item permanece na fila local e é retentado no próximo ciclo de sincronização (quando o dispositivo detecta conexão novamente).

---

## Padrão `ActionResult`

Todas as respostas seguem o tipo discriminado:

```typescript
// Sucesso
{
  success: true,
  data: { /* payload específico da ação */ }
}

// Erro
{
  success: false,
  error: "Mensagem descritiva do erro em pt-BR"
}
```

Tipo TypeScript de referência:

```typescript
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```

---

## Autenticação — Resumo Rápido

1. Chamar `supabase.auth.signInWithPassword({ email, password })`
2. Extrair `session.access_token` (JWT)
3. Consultar `profiles` para confirmar `role = 'manager'`
4. Se `role !== 'manager'`, bloquear acesso e exibir mensagem de erro
5. Armazenar sessão de forma persistente no dispositivo
6. O SDK do Supabase cuida do refresh automático do token

Detalhes completos em [`01-authentication.md`](./01-authentication.md).

---

## Índice de Contratos

| Arquivo | Domínio |
| ------- | ------- |
| [`01-authentication.md`](./01-authentication.md) | Login, sessão, verificação de role |
| [`02-works.md`](./02-works.md) | Listagem e detalhe de obras (read-only) |
| [`07-checklists.md`](./07-checklists.md) | Checklists: marcar itens, iniciar execução |
| [`08-alerts.md`](./08-alerts.md) | Alertas/emergências: abrir, resolver, comentar |
| [`09-team-attendance.md`](./09-team-attendance.md) | Equipe e presença (somente leitura) |
| [`10-realtime.md`](./10-realtime.md) | Canais Realtime, retry e reconexão |

---

## Changelog

Veja [`CHANGELOG.md`](./CHANGELOG.md) para o histórico completo de versões.
