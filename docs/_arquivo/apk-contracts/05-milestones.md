# 05 — Marcos da Obra (Milestones)

> **Versão do contrato:** `v1.0.0-web-complete`

Sistema de acompanhamento de marcos (milestones) da obra. O gestor sinaliza progresso e reporta conclusão; o engenheiro aprova ou rejeita.

---

## Visão Geral

| Server Action | Quem pode chamar | Descrição |
|---|---|---|
| `setMilestoneInProgress` | Gestor (manager) | Sinaliza que o trabalho no marco foi iniciado |
| `reportMilestone` | Gestor (manager) | Reporta a conclusão de um marco com evidências |
| `getUploadUrlForMilestoneEvidence` | Gestor (manager) | Gera URL assinada para upload de evidência |

---

## Transições de Estado

```
┌──────────────┐  setMilestoneInProgress  ┌──────────────┐
│  not_started │ ───────────────────────► │ in_progress  │
└──────────────┘                          └──────┬───────┘
                                                 │
                                                 │ reportMilestone
                                                 ▼
                                          ┌──────────────┐
                                          │   reported    │
                                          └──────┬───────┘
                                                 │
                                         ┌───────┴────────┐
                                         ▼                ▼
                                  ┌────────────┐  ┌────────────┐
                                  │  approved   │  │  rejected   │
                                  └────────────┘  └──────┬─────┘
                                                         │
                                                         │ Gestor corrige
                                                         │ e reporta novamente
                                                         ▼
                                                  ┌──────────────┐
                                                  │   reported    │
                                                  └──────────────┘
```

### Ações permitidas ao Gestor

O gestor (manager) possui **apenas** duas ações sobre marcos:

- `setMilestoneInProgress` — iniciar trabalho
- `reportMilestone` — reportar conclusão

A aprovação e rejeição são realizadas pelo **engenheiro** via painel web.

---

## `setMilestoneInProgress`

Sinaliza que o gestor iniciou o trabalho em um marco específico.

### Campos de entrada

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `workId` | `string` (UUID) | Sim | ID da obra |
| `milestoneId` | `string` (UUID) | Sim | ID do marco |

### Validações

- O marco deve estar no estado `not_started`
- O usuário deve ser o gestor da obra

### Retorno de sucesso

```json
{
  "success": true,
  "data": null
}
```

---

## `reportMilestone`

Reporta um marco como concluído, incluindo notas e mídias de evidência.

### Campos de entrada

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `workId` | `string` (UUID) | Sim | ID da obra |
| `milestoneId` | `string` (UUID) | Sim | ID do marco |
| `notes` | `string` | Não | Observações sobre a conclusão |
| `evidenceMedia` | `object[]` | Sim (pode ser `[]`) | Mídias de evidência já enviadas via upload |
| `clientEventId` | `string` (UUID) | Sim | Identificador único gerado pelo cliente |

### Comportamento

- Cria um registro `milestone_event` com `type = 'reported'`
- O marco muda para o estado `reported`
- Idempotente via `clientEventId` — reenvio retorna resultado existente

### Validações

- O marco deve estar no estado `in_progress` (ou `rejected` para re-report)
- O usuário deve ser o gestor da obra

### Retorno de sucesso

```json
{
  "success": true,
  "data": {
    "milestoneEventId": "uuid-do-evento-criado"
  }
}
```

---

## `getUploadUrlForMilestoneEvidence`

Gera URL assinada para upload de mídia de evidência de um marco.

### Permissão

Apenas o **gestor** (manager) da obra.

### Caminho no storage

```
{workId}/milestones/{milestoneId}/{eventId}/{uuid}.{ext}
```

### Fluxo de upload

1. APK chama `getUploadUrlForMilestoneEvidence` com metadata do arquivo
2. Servidor retorna `signedUploadUrl` + `storagePath`
3. APK faz upload do arquivo binário na URL assinada
4. APK inclui `storagePath` no campo `evidenceMedia` de `reportMilestone`
