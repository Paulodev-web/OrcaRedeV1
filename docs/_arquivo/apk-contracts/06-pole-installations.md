# 06 — Instalação de Postes (Pole Installations)

> **Versão do contrato:** `v1.0.0-web-complete`

Sistema de registro de postes instalados em campo, com coordenadas no canvas lógico e geolocalização GPS opcional.

---

## Visão Geral

| Server Action | Quem pode chamar | Descrição |
|---|---|---|
| `recordPoleInstallation` | Gestor (manager) | Registra a instalação de um poste |
| `removePoleInstallation` | Gestor (manager) — criador | Remove (soft delete) uma instalação |
| `getUploadUrlForPoleInstallationMedia` | Gestor (manager) | Gera URL assinada para upload de mídia |

---

## `recordPoleInstallation`

Registra a instalação de um poste na obra.

### Assinatura

```typescript
export async function recordPoleInstallation(
  input: RecordPoleInstallationInput
): Promise<ActionResult<RecordPoleInstallationResult>>
```

### Campos de entrada (`RecordPoleInstallationInput`)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `workId` | `string` (UUID) | Sim | ID da obra |
| `xCoord` | `number` (0–6000) | Sim | Coordenada X no canvas lógico |
| `yCoord` | `number` (0–6000) | Sim | Coordenada Y no canvas lógico |
| `gpsLat` | `number` | Não | Latitude GPS |
| `gpsLng` | `number` | Não | Longitude GPS |
| `gpsAccuracyMeters` | `number` | Não | Precisão do GPS em metros |
| `numbering` | `string` | Não | Numeração do poste |
| `poleType` | `string` | Não | Tipo do poste |
| `notes` | `string` | Não | Observações |
| `installedAt` | `string` (ISO 8601) | Sim | Data/hora da instalação |
| `media` | `object[]` | Sim (pode ser `[]`) | Mídias já enviadas via upload |
| `clientEventId` | `string` (UUID) | Sim | Identificador único gerado pelo cliente |
| `installationId` | `string` (UUID) | Não | ID gerado pelo cliente (UUID v4) — necessário se houver upload prévio de mídia |

### Coordenadas

As coordenadas `xCoord` e `yCoord` representam posições em um **canvas lógico** com espaço de `0..6000` em ambos os eixos. Não são coordenadas geográficas — a geolocalização é fornecida opcionalmente pelos campos `gpsLat`/`gpsLng`.

### Validações

| Regra | Detalhe |
|---|---|
| Apenas gestor | Somente o gestor da obra pode registrar instalações |
| Obra ativa | Bloqueado se a obra estiver cancelada |
| Coordenadas | `xCoord` e `yCoord` devem estar no intervalo `0..6000` |

### Retorno de sucesso

```json
{
  "success": true,
  "data": {
    "installationId": "uuid-da-instalacao"
  }
}
```

---

## Idempotência Forte

O campo `clientEventId` possui constraint **UNIQUE NOT NULL** na tabela. O servidor implementa idempotência forte com o seguinte fluxo:

```
┌─────────────────────────────────────────────────────┐
│ 1. Recebe requisição com clientEventId              │
│                     ▼                               │
│ 2. SELECT por clientEventId                         │
│    ├─ Encontrou? → Retorna installationId existente │
│    └─ Não encontrou? → Continua para INSERT         │
│                     ▼                               │
│ 3. INSERT na tabela                                 │
│    ├─ Sucesso → Retorna novo installationId         │
│    └─ Violação de UNIQUE (race condition)?          │
│       → Busca registro existente e retorna sucesso  │
└─────────────────────────────────────────────────────┘
```

Isso garante que, mesmo com reenvios simultâneos ou falhas de rede, o APK **nunca** criará registros duplicados. Toda chamada com o mesmo `clientEventId` retorna o mesmo resultado.

---

## `removePoleInstallation`

Remove uma instalação de poste (soft delete). Apenas o criador original pode remover.

### Campos de entrada

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `installationId` | `string` (UUID) | Sim | ID da instalação a ser removida |
| `reason` | `string` | Não | Motivo da remoção |

### Validações

- Apenas o **criador** da instalação pode removê-la
- O usuário deve ser gestor (manager) da obra

### Retorno de sucesso

```json
{
  "success": true,
  "data": null
}
```

---

## `getUploadUrlForPoleInstallationMedia`

Gera URL assinada para upload de mídia (fotos) da instalação de poste.

### Permissão

Apenas o **gestor** (manager) da obra.

### Geração do `installationId` no cliente

> **Importante:** O `installationId` deve ser gerado **no APK** (UUID v4) **antes** de iniciar o upload, pois o caminho no storage depende dele. O mesmo UUID é então enviado no campo `installationId` de `recordPoleInstallation`.

### Caminho no storage

```
{workId}/pole-installations/{installationId}/{uuid}.{ext}
```

### Fluxo de upload

1. APK gera `installationId` (UUID v4) localmente
2. APK chama `getUploadUrlForPoleInstallationMedia` com o `installationId` e metadata do arquivo
3. Servidor retorna `signedUploadUrl` + `storagePath`
4. APK faz upload do arquivo binário na URL assinada
5. APK chama `recordPoleInstallation` incluindo `installationId` e `storagePath` no campo `media`
