# 04 — Diário de Obra (Daily Logs)

> **Versão do contrato:** `v1.0.0-web-complete`

Sistema de publicação e revisão do diário de obra. O gestor registra as atividades diárias e o engenheiro aprova ou rejeita.

---

## Visão Geral

| Server Action | Quem pode chamar | Descrição |
|---|---|---|
| `publishDailyLog` | Gestor (manager) | Publica o diário de um dia da obra |
| `getUploadUrlForDailyLogMedia` | Gestor (manager) | Gera URL assinada para upload de mídia do diário |

---

## `publishDailyLog`

Publica (ou republica) o registro diário de uma obra.

### Assinatura

```typescript
export async function publishDailyLog(
  input: PublishDailyLogInput
): Promise<ActionResult<PublishDailyLogResult>>
```

### Campos de entrada (`PublishDailyLogInput`)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `workId` | `string` (UUID) | Sim | ID da obra |
| `logDate` | `string` (YYYY-MM-DD) | Sim | Data do registro |
| `activities` | `string` | Sim | Descrição das atividades (10–4000 caracteres) |
| `crewPresent` | `string[]` | Sim | Lista de nomes da equipe presente |
| `postsInstalledCount` | `number` | Sim | Quantidade de postes instalados no dia |
| `metersInstalled` | `object` | Sim | Metros de rede instalados por tipo |
| `metersInstalled.BT` | `number` | Sim | Metros de Baixa Tensão |
| `metersInstalled.MT` | `number` | Sim | Metros de Média Tensão |
| `metersInstalled.rede` | `number` | Sim | Metros de rede geral |
| `materialsConsumed` | `object[]` | Sim | Lista de materiais consumidos |
| `incidents` | `string \| null` | Não | Relato de incidentes/ocorrências |
| `media` | `object[]` | Sim (pode ser `[]`) | Mídias já enviadas via upload |
| `clientEventId` | `string` (UUID) | Sim | Identificador único gerado pelo cliente |

### Validações

| Regra | Detalhe |
|---|---|
| Apenas gestor | Somente o gestor da obra pode publicar diários |
| Data válida | `logDate` deve ser ≤ hoje no fuso `America/Sao_Paulo` |
| Atividades | Mínimo 10, máximo 4000 caracteres |
| Idempotência | `clientEventId` com constraint **UNIQUE** — reenvio retorna resultado existente |

### Retorno de sucesso (`PublishDailyLogResult`)

```json
{
  "success": true,
  "data": {
    "dailyLogId": "uuid-do-diario",
    "revisionNumber": 1
  }
}
```

### Comportamento por estado existente

| Estado atual do diário na mesma data | Comportamento |
|---|---|
| Nenhum registro | Cria novo diário (revisão 1) |
| `rejected` (rejeitado) | Cria **nova revisão** (republication) com `revision_number` incrementado |
| `pending_approval` | **Erro** — já existe diário pendente de aprovação |
| `approved` | **Erro** — diário já aprovado para esta data |

---

## `getUploadUrlForDailyLogMedia`

Gera URL assinada para upload de mídia (fotos/vídeos) do diário de obra.

### Permissão

Apenas o **gestor** (manager) da obra pode gerar URLs de upload.

### Caminho no storage

```
{workId}/daily-logs/{dailyLogId}/{revisionId}/{uuid}.{ext}
```

### Fluxo de upload

1. APK chama `getUploadUrlForDailyLogMedia` com metadata do arquivo
2. Servidor retorna `signedUploadUrl` + `storagePath`
3. APK faz upload do arquivo binário na URL assinada
4. APK inclui `storagePath` no campo `media` de `publishDailyLog`

---

## Fluxo de Rejeição e Republicação

```
┌──────────────┐     publishDailyLog     ┌──────────────────┐
│   Gestor     │ ──────────────────────► │ pending_approval  │
│  (manager)   │                         └────────┬─────────┘
└──────────────┘                                  │
                                                  │ Engenheiro avalia
                                          ┌───────┴────────┐
                                          ▼                ▼
                                   ┌────────────┐  ┌────────────┐
                                   │  approved   │  │  rejected   │
                                   └────────────┘  └──────┬─────┘
                                                          │
                                                          │ Gestor edita
                                                          │ e republica
                                                          ▼
                                                 ┌──────────────────┐
                                                 │ pending_approval  │
                                                 │ (nova revisão)    │
                                                 └──────────────────┘
```

1. Gestor publica diário → status `pending_approval`
2. Engenheiro **aprova** → status `approved` (fluxo encerrado para essa data)
3. Engenheiro **rejeita** → status `rejected`
4. Gestor corrige e chama `publishDailyLog` novamente → nova revisão com `revision_number` incrementado, status volta a `pending_approval`
