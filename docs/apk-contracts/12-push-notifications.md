# 12 — Push Notifications

> **Versão do contrato:** `v1.0.0-web-complete`

Contrato de notificações push para o APK Android. A implementação do disparo é responsabilidade do backend (fora do escopo web), mas a estrutura de dados e os tipos de eventos são documentados aqui como contrato entre as partes.

---

## Visão Geral

| Aspecto | Detalhe |
|---|---|
| Quem recebe push | APK (gerente de obra) |
| Quem envia push | Backend via Expo Push / FCM |
| Portal web recebe push? | **Não** — o portal usa Supabase Realtime |
| Tabela de tokens | `device_tokens` |
| Registro do token | No login do APK |
| Remoção do token | No logout do APK |

---

## Tabela `device_tokens`

Criada vazia no Block 1 da migração. Armazena os tokens de push de cada dispositivo.

### Schema

```sql
CREATE TABLE device_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'expo')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, token)
);
```

### Campos

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `UUID` | Identificador único do registro |
| `user_id` | `UUID` | FK para `auth.users` — usuário dono do dispositivo |
| `token` | `TEXT` | Token de push (Expo Push Token ou FCM Registration Token) |
| `platform` | `TEXT` | Plataforma do dispositivo: `android`, `ios` ou `expo` |
| `created_at` | `TIMESTAMPTZ` | Data/hora de criação do registro |
| `updated_at` | `TIMESTAMPTZ` | Data/hora da última atualização (refresh do token) |

### RLS

```sql
-- Usuário só vê/gerencia seus próprios tokens
CREATE POLICY "Users manage own tokens"
  ON device_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

## Registro do Token

O APK registra o token de push no login e o atualiza no início de cada sessão.

### Fluxo

```
1. Login com signInWithPassword
2. Solicitar permissão de notificação ao SO
3. Obter token de push (Expo ou FCM)
4. UPSERT na tabela device_tokens
```

### Operação de UPSERT

```typescript
const { error } = await supabase
  .from('device_tokens')
  .upsert(
    {
      user_id: session.user.id,
      token: expoPushToken,
      platform: 'expo', // ou 'android' se FCM direto
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' }
  );
```

### Refresh do Token

No início de cada abertura do app (não apenas no login), o APK deve:

1. Obter o token de push atual
2. Fazer UPSERT para garantir que está atualizado
3. Atualizar o campo `updated_at`

Isso cobre cenários onde o SO pode renovar o token entre sessões.

---

## Remoção do Token

No logout, o APK deve remover o token do servidor para cessar o recebimento de notificações.

```typescript
await supabase
  .from('device_tokens')
  .delete()
  .eq('user_id', session.user.id)
  .eq('token', currentToken);
```

> **Nota:** Remove apenas o token do dispositivo atual, não todos os tokens do usuário (o mesmo usuário pode ter múltiplos dispositivos).

---

## Tipos de Eventos

Eventos que disparam push notifications para o gerente de obra:

| Tipo | Evento | Descrição |
|---|---|---|
| `daily_log_rejected` | Diário rejeitado | Engenheiro rejeitou um diário de obra enviado pelo gerente |
| `checklist_returned` | Checklist devolvido | Engenheiro devolveu um checklist para correção |
| `milestone_rejected` | Marco rejeitado | Engenheiro rejeitou um marco de medição |
| `alert_closed` | Alerta encerrado | Engenheiro encerrou um alerta aberto pelo gerente |
| `message_received` | Mensagem recebida | Engenheiro enviou uma mensagem no chat da obra |
| `work_assigned` | Obra atribuída | Engenheiro atribuiu o gerente a uma nova obra |

---

## Payload do Push

Formato sugerido para o payload enviado ao dispositivo:

```typescript
interface PushPayload {
  type: PushEventType;
  workId: string;
  title: string;
  body: string;
  linkPath: string;
}
```

### Campos

| Campo | Tipo | Descrição |
|---|---|---|
| `type` | `string` | Tipo do evento (ver tabela acima) |
| `workId` | `string (UUID)` | ID da obra relacionada |
| `title` | `string` | Título da notificação (exibido na barra do SO) |
| `body` | `string` | Corpo da notificação (resumo do evento) |
| `linkPath` | `string` | Deep link para navegação interna no APK |

### Exemplos de payload por tipo

#### `daily_log_rejected`

```json
{
  "type": "daily_log_rejected",
  "workId": "uuid-da-obra",
  "title": "Diário rejeitado",
  "body": "O engenheiro rejeitou o diário do dia 05/05/2026. Revise e reenvie.",
  "linkPath": "/obra/uuid-da-obra/diario"
}
```

#### `checklist_returned`

```json
{
  "type": "checklist_returned",
  "workId": "uuid-da-obra",
  "title": "Checklist devolvido",
  "body": "O checklist 'Fundações - Etapa 2' foi devolvido para correção.",
  "linkPath": "/obra/uuid-da-obra/checklists"
}
```

#### `milestone_rejected`

```json
{
  "type": "milestone_rejected",
  "workId": "uuid-da-obra",
  "title": "Marco rejeitado",
  "body": "O marco 'Concretagem Bloco A' foi rejeitado. Verifique os comentários.",
  "linkPath": "/obra/uuid-da-obra/marcos"
}
```

#### `alert_closed`

```json
{
  "type": "alert_closed",
  "workId": "uuid-da-obra",
  "title": "Alerta encerrado",
  "body": "O alerta 'Infiltração no subsolo' foi encerrado pelo engenheiro.",
  "linkPath": "/obra/uuid-da-obra/alertas"
}
```

#### `message_received`

```json
{
  "type": "message_received",
  "workId": "uuid-da-obra",
  "title": "Nova mensagem",
  "body": "Eng. Silva enviou uma mensagem no chat da obra.",
  "linkPath": "/obra/uuid-da-obra/chat"
}
```

#### `work_assigned`

```json
{
  "type": "work_assigned",
  "workId": "uuid-da-obra",
  "title": "Nova obra atribuída",
  "body": "Você foi adicionado à obra 'Residencial Aurora - Bloco C'.",
  "linkPath": "/obra/uuid-da-obra"
}
```

---

## Deep Links

O campo `linkPath` segue o padrão de rotas internas do APK. Ao tocar na notificação, o APK deve:

1. Verificar se há sessão ativa
2. Se não houver, redirecionar para login e guardar o `linkPath` como destino pós-login
3. Se houver, navegar diretamente para a tela indicada pelo `linkPath`

---

## Portal Web — Sem Push

O portal web (utilizado pelo engenheiro) **não** recebe push notifications. O portal utiliza **Supabase Realtime** para receber atualizações em tempo real enquanto a tela está aberta.

A tabela `device_tokens` é utilizada **exclusivamente** pelo APK e pelo backend de disparo de push.

---

## Limpeza de Tokens Obsoletos

Para manter a tabela limpa, recomenda-se:

- Remover tokens com `updated_at` mais antigo que 90 dias (dispositivo possivelmente inativo)
- Remover tokens que retornam erro `DeviceNotRegistered` do Expo/FCM
- Executar limpeza via cron job periódico (fora do escopo do APK)
