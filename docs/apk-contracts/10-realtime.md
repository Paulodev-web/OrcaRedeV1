# 10 — Realtime

> **Versão:** `v1.0.0-web-complete`

---

## Visão Geral

O APK utiliza o Supabase Realtime para receber atualizações em tempo real sem polling contínuo. São três canais principais que o APK deve assinar.

---

## Canais

### 1. `work:{work_id}:chat`

Canal de mensagens do chat da obra.

```typescript
supabase
  .channel(`work:${workId}:chat`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'work_messages',
      filter: `work_id=eq.${workId}`
    },
    (payload) => {
      // Nova mensagem recebida
    }
  )
  .subscribe();
```

| Evento | Tabela          | Filtro              | Ação no APK                     |
| ------ | --------------- | ------------------- | ------------------------------- |
| INSERT | `work_messages` | `work_id=eq.{workId}` | Adicionar mensagem à lista local |

---

### 2. `work:{work_id}:events`

Canal de eventos gerais da obra. Agrupa múltiplos eventos de diferentes tabelas.

```typescript
const channel = supabase.channel(`work:${workId}:events`);

// Nova revisão do diário publicada
channel.on('postgres_changes', {
  event: 'INSERT',
  schema: 'public',
  table: 'work_daily_log_revisions',
  filter: `work_id=eq.${workId}`
}, handleNewRevision);

// Mudança de status do diário (aprovado/rejeitado)
channel.on('postgres_changes', {
  event: 'UPDATE',
  schema: 'public',
  table: 'work_daily_logs',
  filter: `work_id=eq.${workId}`
}, handleDailyLogStatusChange);

// Nova instalação de poste
channel.on('postgres_changes', {
  event: 'INSERT',
  schema: 'public',
  table: 'work_pole_installations',
  filter: `work_id=eq.${workId}`
}, handleNewInstallation);

// Remoção de poste (update com removed=true)
channel.on('postgres_changes', {
  event: 'UPDATE',
  schema: 'public',
  table: 'work_pole_installations',
  filter: `work_id=eq.${workId}`
}, handleInstallationUpdate);

// Evento de milestone (reportado/aprovado/rejeitado)
channel.on('postgres_changes', {
  event: 'INSERT',
  schema: 'public',
  table: 'work_milestone_events',
  filter: `work_id=eq.${workId}`
}, handleMilestoneEvent);

// Mudança de status de checklist
channel.on('postgres_changes', {
  event: 'UPDATE',
  schema: 'public',
  table: 'work_checklists',
  filter: `work_id=eq.${workId}`
}, handleChecklistStatusChange);

channel.subscribe();
```

| Evento | Tabela                       | Significado                              |
| ------ | ---------------------------- | ---------------------------------------- |
| INSERT | `work_daily_log_revisions`   | Nova revisão do diário publicada         |
| UPDATE | `work_daily_logs`            | Status alterado (approved/rejected)      |
| INSERT | `work_pole_installations`    | Nova instalação de poste registrada      |
| UPDATE | `work_pole_installations`    | Poste removido ou dados atualizados      |
| INSERT | `work_milestone_events`      | Milestone reportado/aprovado/rejeitado   |
| UPDATE | `work_checklists`            | Status da checklist alterado             |

---

### 3. `user:{user_id}:notifications`

Canal pessoal de notificações do usuário.

```typescript
supabase
  .channel(`user:${userId}:notifications`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`
    },
    (payload) => {
      // Nova notificação recebida
    }
  )
  .subscribe();
```

| Evento | Tabela          | Filtro                 | Ação no APK              |
| ------ | --------------- | ---------------------- | ------------------------ |
| INSERT | `notifications` | `user_id=eq.{userId}` | Exibir notificação local |

---

## Fetch sob Demanda com Retry

Quando o Realtime entrega um evento INSERT, o payload pode não conter todos os dados necessários (especialmente URLs assinadas de mídia). O APK deve buscar os dados completos via action correspondente.

### Padrão de Retry (3x com 250ms)

```typescript
async function fetchWithRetry<T>(
  fetchFn: () => Promise<T | null>,
  maxRetries = 3,
  intervalMs = 250
): Promise<T | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await fetchFn();
    if (result && hasMedia(result)) {
      return result;
    }
    if (attempt < maxRetries) {
      await sleep(intervalMs);
    }
  }
  // Após 3 tentativas, retornar o que tiver (mesmo sem mídia)
  return await fetchFn();
}
```

### Motivação

Existe um gap temporal entre o INSERT do registro pai e o INSERT do batch de mídias associadas. O retry de 250ms dá tempo para que as mídias sejam registradas antes do APK buscar os dados completos.

### Regra

- Se após 3 retries a mídia ainda estiver vazia, **prosseguir** com os dados disponíveis
- Não bloquear a UI esperando mídia indefinidamente
- A mídia pode ser carregada lazily quando o usuário abrir o detalhe

---

## Estratégia de Conexão

### Subscribe/Unsubscribe

```typescript
// No mount da tela da obra
useEffect(() => {
  const channels = subscribeToWorkChannels(workId, userId);

  return () => {
    // No unmount
    channels.forEach(ch => supabase.removeChannel(ch));
  };
}, [workId, userId]);
```

- **Subscribe** ao montar a tela/componente
- **Unsubscribe** ao desmontar

### Detecção de Desconexão

| Parâmetro     | Valor    |
| ------------- | -------- |
| Timeout       | 10 segundos |
| Ação visual   | Exibir banner "Sem conexão em tempo real" |
| Polling fallback | A cada 60 segundos (opcional) |

### Fluxo de reconexão

```
Conectado → Timeout 10s sem heartbeat → Desconectado
  ↓
Exibir banner de desconexão
  ↓
Tentar reconectar automaticamente (Supabase SDK)
  ↓
(Opcional) Poll manual a cada 60s para dados críticos
  ↓
Reconectado → Remover banner, resync dados perdidos
```

### Resync após reconexão

Ao reconectar, o APK deve:
1. Remover o banner de desconexão
2. Buscar eventos/mensagens que possam ter sido perdidos durante o período offline
3. Usar `created_at` do último item local como cursor para buscar apenas o delta

---

## Resumo de Canais por Tela

| Tela do APK        | Canais necessários                              |
| ------------------- | ----------------------------------------------- |
| Lista de obras      | `user:{userId}:notifications`                   |
| Detalhe da obra     | `work:{workId}:events` + `user:{userId}:notifications` |
| Chat da obra        | `work:{workId}:chat`                            |
| Checklists          | `work:{workId}:events` (filtrar UPDATE checklists) |
| Alertas             | `work:{workId}:events` + `user:{userId}:notifications` |
