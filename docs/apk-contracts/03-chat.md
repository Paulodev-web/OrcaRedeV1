# 03 — Chat da Obra

> **Versão do contrato:** `v1.0.0-web-complete`

Sistema de mensagens entre gestor (manager) e engenheiro dentro do contexto de uma obra.

---

## Visão Geral

| Server Action | Quem pode chamar | Descrição |
|---|---|---|
| `sendWorkMessage` | Gestor ou Engenheiro (membro da obra) | Envia mensagem com texto e/ou anexos |
| `getUploadUrlForChatAttachment` | Gestor ou Engenheiro (membro da obra) | Gera URL assinada para upload de anexo |

---

## `sendWorkMessage`

Envia uma mensagem de chat dentro da obra. O remetente é identificado pela sessão autenticada.

### Assinatura

```typescript
export async function sendWorkMessage(input: {
  workId: string;
  body: string;
  attachments: SendWorkMessageAttachmentInput[];
  clientEventId: string;
}): Promise<ActionResult<{ messageId: string }>>
```

### Campos de entrada

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `workId` | `string` (UUID) | Sim | ID da obra |
| `body` | `string` | Sim | Corpo da mensagem |
| `attachments` | `SendWorkMessageAttachmentInput[]` | Sim (pode ser `[]`) | Anexos já enviados via upload |
| `clientEventId` | `string` (UUID) | Sim | Identificador único gerado pelo cliente |

#### `SendWorkMessageAttachmentInput`

| Campo | Tipo | Descrição |
|---|---|---|
| `storagePath` | `string` | Caminho retornado pelo fluxo de upload |
| `mimeType` | `string` | Tipo MIME do arquivo (ex.: `image/jpeg`) |
| `fileName` | `string` | Nome original do arquivo |

### Retorno de sucesso

```json
{
  "success": true,
  "data": {
    "messageId": "uuid-da-mensagem-criada"
  }
}
```

### Idempotência

O campo `clientEventId` possui constraint **UNIQUE** na tabela. Se o APK reenviar a mesma requisição (ex.: falha de rede), o servidor retorna o `messageId` já existente sem criar duplicatas.

### Erros possíveis

| Código / Motivo | Descrição |
|---|---|
| Sessão expirada | Token de autenticação inválido ou expirado |
| Não é membro da obra | Usuário autenticado não pertence à obra informada |
| Obra cancelada | A obra foi cancelada; não é possível enviar mensagens |

---

## `getUploadUrlForChatAttachment`

Gera uma URL assinada (signed URL) para o APK enviar o arquivo diretamente ao storage.

### Fluxo de upload (5 etapas)

```
┌─────────────────────────────────────────────────────────┐
│ 1. APK chama getUploadUrlForChatAttachment com metadata │
│    (workId, fileName, mimeType, fileSize)               │
│                          ▼                              │
│ 2. Servidor retorna signedUploadUrl + token +           │
│    storagePath                                          │
│                          ▼                              │
│ 3. APK faz PUT/POST do arquivo binário na               │
│    signedUploadUrl                                      │
│                          ▼                              │
│ 4. APK inclui storagePath no campo attachments de       │
│    sendWorkMessage                                      │
│                          ▼                              │
│ 5. Servidor valida que o arquivo existe no storage      │
│    antes de persistir a mensagem                        │
└─────────────────────────────────────────────────────────┘
```

### Limites de tamanho

| Tipo de arquivo | Limite |
|---|---|
| Imagem | Sem limite definido |
| Vídeo | 100 MB |
| Áudio | Sem limite definido |

### Caminho no storage

```
{workId}/chat/{messageId}/{uuid}.{ext}
```

---

## Realtime — Canal de Chat

O APK deve se inscrever no canal Realtime do Supabase para receber mensagens novas em tempo real.

### Canal

```
work:{work_id}:chat
```

### Evento escutado

| Evento | Tabela | Descrição |
|---|---|---|
| `INSERT` | `work_messages` | Nova mensagem enviada na obra |

### Exemplo de inscrição (referência)

```typescript
supabase
  .channel(`work:${workId}:chat`)
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'work_messages', filter: `work_id=eq.${workId}` },
    (payload) => {
      // payload.new contém a mensagem inserida
    }
  )
  .subscribe()
```

> **Nota:** O APK deve manter a inscrição ativa enquanto o usuário estiver na tela de chat e cancelá-la ao sair.
