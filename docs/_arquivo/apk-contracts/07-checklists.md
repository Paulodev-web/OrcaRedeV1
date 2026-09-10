# 07 — Checklists

> **Versão:** `v1.0.0-web-complete`

---

## Visão Geral

Checklists são listas de verificação atribuídas ao gerente de obra. O engenheiro cria e atribui checklists via portal web; o gerente visualiza, executa e marca itens como concluídos pelo APK.

---

## Ciclo de Vida

```
assigned → in_progress → awaiting_validation → validated | returned
```

| Estado               | Descrição                                              |
| -------------------- | ------------------------------------------------------ |
| `assigned`           | Checklist atribuída ao gerente, aguardando início      |
| `in_progress`        | Gerente iniciou a execução                             |
| `awaiting_validation`| Todos os itens marcados, aguardando validação do engenheiro |
| `validated`          | Engenheiro aprovou a checklist                         |
| `returned`           | Engenheiro devolveu para correções                     |

O gerente pode apenas **marcar itens** e **iniciar execução**. Transições de validação são feitas pelo engenheiro.

---

## Leitura — Listar Checklists

O APK consulta diretamente via PostgREST:

```typescript
const { data } = await supabase
  .from('work_checklists')
  .select('*, items:work_checklist_items(*)')
  .eq('work_id', workId)
  .eq('assigned_to', userId)  // auth.uid()
  .order('created_at', { ascending: false });
```

Filtro obrigatório: `assigned_to = auth.uid()` — garante que o gerente vê apenas checklists atribuídas a ele.

---

## Actions

### `markChecklistItem`

Marca (ou desmarca) um item individual da checklist como concluído.

**Permissão:** somente `manager`
**Pré-condições:**
- A obra não pode estar cancelada (`status != 'cancelled'`)
- A checklist deve estar em `in_progress`

#### Input

```typescript
{
  workId: string;          // UUID da obra
  checklistId: string;     // UUID da checklist
  itemId: string;          // UUID do item
  completed: boolean;      // true = concluído, false = desfazer
  media?: {                // Mídias opcionais (fotos/vídeos de evidência)
    storagePath: string;   // Caminho retornado por getUploadUrlForChecklistItemMedia
    mimeType: string;
  }[];
  clientEventId: string;   // UUID v4 gerado no dispositivo (idempotência)
}
```

#### Output (sucesso)

```typescript
{
  success: true,
  data: {
    itemId: string;
    completed: boolean;
    completedAt: string | null;  // ISO timestamp ou null se desmarcado
  }
}
```

#### Erros possíveis

| Erro | Causa |
| ---- | ----- |
| `"Obra cancelada"` | Obra com status `cancelled` |
| `"Checklist não está em andamento"` | Status diferente de `in_progress` |
| `"Item não encontrado"` | `itemId` inválido para esta checklist |
| `"Permissão negada"` | Usuário não é manager ou não é o assigned_to |

---

### `setChecklistInProgress`

Inicia a execução de uma checklist, mudando o status de `assigned` para `in_progress`.

**Permissão:** somente `manager`
**Pré-condições:**
- A checklist deve estar em `assigned` ou `returned`
- A obra não pode estar cancelada

#### Input

```typescript
{
  workId: string;        // UUID da obra
  checklistId: string;   // UUID da checklist
}
```

#### Output (sucesso)

```typescript
{
  success: true,
  data: {
    checklistId: string;
    status: "in_progress";
    startedAt: string;   // ISO timestamp
  }
}
```

#### Erros possíveis

| Erro | Causa |
| ---- | ----- |
| `"Checklist já está em andamento"` | Status já é `in_progress` |
| `"Checklist não pode ser iniciada"` | Status é `awaiting_validation` ou `validated` |
| `"Obra cancelada"` | Obra com status `cancelled` |

---

## Upload de Mídia

### `getUploadUrlForChecklistItemMedia`

Gera URL assinada para upload de evidência fotográfica/vídeo de um item da checklist.

#### Input

```typescript
{
  workId: string;
  checklistId: string;   // Usado como `runId` no path
  itemId: string;
  fileName: string;      // Nome original do arquivo (ex: "foto.jpg")
}
```

#### Path no Storage

```
{workId}/checklists/{runId}/{itemId}/{uuid}.{ext}
```

- `runId` = `checklistId`
- `uuid` = gerado pelo servidor para evitar colisão
- `ext` = extraída do `fileName`

#### Output (sucesso)

```typescript
{
  success: true,
  data: {
    signedUrl: string;     // URL para PUT do arquivo
    storagePath: string;   // Path completo para referenciar em markChecklistItem
    expiresAt: string;     // ISO timestamp de expiração (5 minutos)
  }
}
```

---

## Fluxo Típico no APK

1. Listar checklists com `assigned_to = auth.uid()`
2. Selecionar uma checklist em `assigned` ou `returned`
3. Chamar `setChecklistInProgress` para iniciar
4. Para cada item:
   a. (Opcional) Fazer upload de mídia via `getUploadUrlForChecklistItemMedia`
   b. Chamar `markChecklistItem` com `completed: true` e paths de mídia
5. Quando todos os itens estiverem marcados, o sistema muda automaticamente para `awaiting_validation`
6. Aguardar notificação do engenheiro (validação ou devolução via Realtime)

---

## Offline

- `markChecklistItem` e `setChecklistInProgress` devem ser enfileirados localmente
- Uploads de mídia ficam na fila de upload separada
- Idempotência garantida via `clientEventId` em `markChecklistItem`
