# 08 — Alertas / Emergências

> **Versão:** `v1.0.0-web-complete`

---

## Visão Geral

Alertas são registros de ocorrências de campo (acidentes, falta de material, problemas de segurança, etc.) criados pelo gerente de obra. O engenheiro acompanha, reconhece e fecha os alertas pelo portal web.

---

## Ciclo de Vida

```
open → in_progress → resolved_in_field → closed
```

| Estado             | Responsável  | Descrição                                          |
| ------------------ | ------------ | -------------------------------------------------- |
| `open`             | Gerente cria | Alerta aberto pelo gerente no campo                |
| `in_progress`      | Engenheiro   | Engenheiro reconhece e assume o tratamento         |
| `resolved_in_field`| Gerente      | Gerente marca como resolvido no campo              |
| `closed`           | Engenheiro   | Engenheiro fecha definitivamente o alerta          |

---

## Actions

### `openAlert`

Cria um novo alerta/emergência.

**Permissão:** somente `manager`
**Idempotência:** via `clientEventId` — se já existir um alerta com o mesmo `client_event_id`, retorna o registro existente.

#### Input

```typescript
{
  workId: string;              // UUID da obra
  title: string;               // Título do alerta (5-100 caracteres)
  description: string;         // Descrição detalhada (10-2000 caracteres)
  severity: "low" | "medium" | "high" | "critical";
  category: "accident" | "material_shortage" | "safety" | "equipment" | "weather" | "other";
  gpsLat?: number;             // Latitude (opcional)
  gpsLng?: number;             // Longitude (opcional)
  gpsAccuracyMeters?: number;  // Precisão GPS em metros (opcional)
  mediaPaths: string[];        // Paths de mídia já enviadas via getUploadUrlForAlertMedia
  clientEventId: string;       // UUID v4 gerado no dispositivo (idempotência)
}
```

#### Validações

| Campo         | Regra                          |
| ------------- | ------------------------------ |
| `title`       | Mínimo 5, máximo 100 caracteres |
| `description` | Mínimo 10, máximo 2000 caracteres |
| `severity`    | Enum: low, medium, high, critical |
| `category`    | Enum: accident, material_shortage, safety, equipment, weather, other |

#### Output (sucesso)

```typescript
{
  success: true,
  data: {
    alertId: string;         // UUID do alerta criado
    status: "open";
    createdAt: string;       // ISO timestamp
    isIdempotentHit: boolean; // true se retornou registro existente
  }
}
```

#### Comportamento interno

- Cria registro na tabela `work_alerts` com `status = 'open'`
- Cria registro inicial na tabela `work_alert_updates` (histórico)
- Associa mídias referenciadas em `mediaPaths`

#### Erros possíveis

| Erro | Causa |
| ---- | ----- |
| `"Título deve ter entre 5 e 100 caracteres"` | Validação de tamanho |
| `"Descrição deve ter entre 10 e 2000 caracteres"` | Validação de tamanho |
| `"Severidade inválida"` | Valor fora do enum |
| `"Categoria inválida"` | Valor fora do enum |
| `"Obra não encontrada ou sem permissão"` | workId inválido ou usuário sem acesso |

---

### `resolveAlertInField`

Gerente marca o alerta como resolvido no campo.

**Permissão:** somente `manager`
**Pré-condições:**
- O alerta deve estar em `in_progress` (engenheiro já reconheceu)

#### Input

```typescript
{
  alertId: string;           // UUID do alerta
  resolutionNotes: string;   // Notas de resolução (mínimo 5 caracteres)
  mediaPaths?: string[];     // Paths de mídia de evidência (opcional)
}
```

#### Output (sucesso)

```typescript
{
  success: true,
  data: {
    alertId: string;
    status: "resolved_in_field";
    resolvedAt: string;      // ISO timestamp
  }
}
```

#### Erros possíveis

| Erro | Causa |
| ---- | ----- |
| `"Alerta não está em andamento"` | Status diferente de `in_progress` |
| `"Notas de resolução devem ter no mínimo 5 caracteres"` | Validação |
| `"Permissão negada"` | Usuário não é manager da obra |

---

### `addAlertComment`

Adiciona um comentário/atualização ao alerta. Tanto engenheiro quanto gerente podem comentar.

**Permissão:** `manager` ou `engineer` (ambos com acesso à obra)

#### Input

```typescript
{
  alertId: string;       // UUID do alerta
  notes: string;         // Texto do comentário
  mediaPaths?: string[]; // Paths de mídia anexa (opcional)
}
```

#### Output (sucesso)

```typescript
{
  success: true,
  data: {
    commentId: string;   // UUID do comentário criado
    createdAt: string;   // ISO timestamp
  }
}
```

#### Erros possíveis

| Erro | Causa |
| ---- | ----- |
| `"Alerta não encontrado"` | alertId inválido |
| `"Comentário não pode ser vazio"` | notes em branco |
| `"Permissão negada"` | Usuário sem acesso à obra |

---

## Upload de Mídia

### `getUploadUrlForAlertMedia`

Gera URL assinada para upload de foto/vídeo associado a um alerta.

#### Input

```typescript
{
  workId: string;
  alertId: string;
  subPath: string;       // Sub-categorização (ex: "opening", "resolution", "comment")
  fileName: string;      // Nome original do arquivo
}
```

#### Path no Storage

```
{workId}/alerts/{alertId}/{subPath}/{uuid}.{ext}
```

- `uuid` = gerado pelo servidor
- `ext` = extraída do `fileName`

#### Output (sucesso)

```typescript
{
  success: true,
  data: {
    signedUrl: string;     // URL para PUT do arquivo
    storagePath: string;   // Path para referenciar nas actions
    expiresAt: string;     // ISO timestamp (5 minutos)
  }
}
```

---

## Fluxo Típico no APK

### Abrir um alerta

1. Capturar fotos/vídeos da ocorrência
2. Para cada mídia, chamar `getUploadUrlForAlertMedia` com `subPath = "opening"`
3. Fazer PUT na `signedUrl` retornada
4. Chamar `openAlert` com os `storagePath` de todas as mídias
5. Alerta aparece como `open` na lista

### Resolver no campo

1. Engenheiro reconhece o alerta (muda para `in_progress`) — notificação via Realtime
2. Gerente executa a resolução no campo
3. (Opcional) Capturar fotos de evidência e upload com `subPath = "resolution"`
4. Chamar `resolveAlertInField` com notas e paths
5. Aguardar engenheiro fechar (`closed`) via Realtime

### Comentar

1. Chamar `getUploadUrlForAlertMedia` com `subPath = "comment"` se houver mídia
2. Chamar `addAlertComment` com texto e paths

---

## Offline

- `openAlert` e `resolveAlertInField` são enfileirados localmente
- Uploads de mídia ficam em fila separada, processados antes da action correspondente
- Idempotência de `openAlert` via `clientEventId`
- `addAlertComment` também é enfileirado, mas sem garantia de ordem entre múltiplos comentários offline
