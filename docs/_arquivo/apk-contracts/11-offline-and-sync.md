# 11 — Offline e Sincronização

> **Versão do contrato:** `v1.0.0-web-complete`

Princípios e estrutura de operação offline-first para o APK Android.

---

## Visão Geral

O APK opera em ambientes de campo (canteiros de obras) onde a conectividade é instável ou inexistente. Toda ação de escrita é salva localmente em SQLite antes de qualquer tentativa de sincronização com o servidor.

O usuário **nunca** deve ser bloqueado por falta de conexão. A UI deve refletir o estado local imediatamente e sincronizar em background quando a rede estiver disponível.

---

## Fila Local (SQLite)

Todas as ações de escrita (envio de diário, marcação de poste, abertura de alerta, etc.) são persistidas em uma tabela de fila local no SQLite do dispositivo.

### Estrutura sugerida da tabela `sync_queue`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | `INTEGER PRIMARY KEY` | ID local auto-incrementado |
| `action_type` | `TEXT` | Tipo da ação (ex.: `recordPoleInstallation`, `publishDailyLog`, `openAlert`) |
| `payload_json` | `TEXT` | Payload completo serializado em JSON |
| `client_event_id` | `TEXT (UUID v4)` | Identificador único do evento (ver seção abaixo) |
| `status` | `TEXT` | Estado atual: `pending` \| `syncing` \| `synced` \| `failed` |
| `created_at` | `TEXT (ISO 8601)` | Data/hora de criação local |
| `synced_at` | `TEXT (ISO 8601)` | Data/hora em que foi sincronizado com sucesso (nullable) |
| `retry_count` | `INTEGER DEFAULT 0` | Número de tentativas de envio |
| `last_error` | `TEXT` | Última mensagem de erro recebida (nullable) |

### Ciclo de vida de um item da fila

```
pending → syncing → synced
                  ↘ failed (retry_count < 10 → volta para pending)
                  ↘ failed (retry_count >= 10 → permanece failed, requer ação manual)
```

---

## `client_event_id`

Toda ação de escrita originada no APK recebe um `client_event_id` único — um UUID v4 gerado **por evento**, não por sessão.

### Regras

- Um novo UUID v4 é gerado para **cada ação individual** (cada poste marcado, cada diário enviado, cada alerta aberto)
- O UUID é gerado **no momento da criação da ação**, antes de salvar na fila local
- O mesmo `client_event_id` é mantido em todas as tentativas de reenvio do mesmo evento
- **Nunca** reutilize um `client_event_id` para ações diferentes

### Exemplo de geração

```typescript
import { v4 as uuidv4 } from 'uuid';

const clientEventId = uuidv4(); // ex.: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

---

## Idempotência

O servidor protege contra duplicatas via constraint `UNIQUE(client_event_id)` nas tabelas de escrita.

### Comportamento esperado

| Cenário | Código PostgreSQL | Ação do APK |
|---|---|---|
| Primeira escrita bem-sucedida | — | Marcar como `synced` |
| Reenvio detectado (duplicata) | `23505` (unique_violation) | Tratar como **sucesso** — marcar como `synced` |
| Erro de validação | `400` / `422` | Marcar como `failed`, **não** retentar automaticamente |
| Erro de rede / timeout | — | Manter como `pending`, agendar retry |
| Erro de servidor | `500` | Manter como `pending`, agendar retry com backoff |

### Tratamento do código 23505

```typescript
try {
  const result = await executeAction(item);
  markAsSynced(item.id);
} catch (error) {
  if (error.code === '23505') {
    // Servidor já processou este evento — tratar como sucesso
    markAsSynced(item.id);
  } else {
    markAsFailed(item.id, error.message);
  }
}
```

---

## Ordem de Upload

Para ações que incluem mídia (fotos, vídeos), o upload segue uma ordem obrigatória:

```
1. Upload da foto/mídia para o Storage  →  receber storagePath
2. Enviar o registro (RPC/insert) incluindo o storagePath no payload
```

> **Regra:** A foto é **sempre** enviada primeiro. O registro só é criado após a confirmação do upload da mídia. Esse é o mesmo padrão utilizado na marcação de postes (canvas pole installation).

### Motivo

Se o registro fosse criado antes do upload da mídia, uma falha no upload deixaria um registro órfão (sem foto). Enviando a mídia primeiro, garantimos integridade referencial.

---

## Fila de Mídia

A fila de mídia é **separada** da fila de ações. Arquivos de mídia (fotos, vídeos) são gerenciados e enviados independentemente.

### Estrutura sugerida da tabela `media_queue`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | `INTEGER PRIMARY KEY` | ID local auto-incrementado |
| `local_path` | `TEXT` | Caminho do arquivo no dispositivo |
| `storage_path` | `TEXT` | Caminho destino no Supabase Storage (nullable, preenchido após upload) |
| `mime_type` | `TEXT` | Tipo MIME do arquivo (ex.: `image/jpeg`) |
| `file_size` | `INTEGER` | Tamanho do arquivo em bytes |
| `related_action_id` | `INTEGER` | FK para `sync_queue.id` — ação que depende desta mídia |
| `status` | `TEXT` | `pending` \| `uploading` \| `uploaded` \| `failed` |
| `created_at` | `TEXT (ISO 8601)` | Data/hora de criação local |
| `uploaded_at` | `TEXT (ISO 8601)` | Data/hora do upload bem-sucedido (nullable) |
| `retry_count` | `INTEGER DEFAULT 0` | Número de tentativas de upload |

### Fluxo de sincronização com mídia

```
1. Ação criada localmente → salva em sync_queue (status: pending)
2. Mídia associada salva em media_queue (status: pending)
3. Sync worker detecta itens pendentes
4. Upload de todas as mídias da ação (media_queue)
5. Quando todas as mídias estão uploaded → envia a ação (sync_queue)
6. Se a ação é aceita → sync_queue.status = synced
```

---

## Sync Worker

O sync worker é um serviço em background que monitora a fila local e tenta sincronizar quando há conexão disponível.

### Comportamento

- Executa automaticamente quando o dispositivo detecta conectividade (listener de rede)
- Processa itens na ordem de `created_at ASC` (FIFO)
- Processa **um item por vez** para evitar conflitos de concorrência
- Pausa automaticamente quando a conexão é perdida
- Pode ser disparado manualmente pelo usuário (botão "Sincronizar agora")

### Estratégia de Retry

Backoff exponencial com teto:

| Tentativa | Intervalo |
|---|---|
| 1ª | 1 segundo |
| 2ª | 2 segundos |
| 3ª | 4 segundos |
| 4ª | 8 segundos |
| 5ª | 16 segundos |
| 6ª–10ª | 30 segundos (teto) |
| > 10 | Marcado como `failed` — requer ação manual |

Fórmula: `min(2^(retry_count - 1) * 1000, 30000)` ms

### Máximo de tentativas

Após **10 tentativas** sem sucesso, o item é marcado como `failed` e **não** é mais retentado automaticamente. O usuário pode retentá-lo manualmente via UI.

---

## Resolução de Conflitos

A estratégia de resolução é **server wins** (last-write-wins) para a maioria dos campos.

### Regras

- Em caso de conflito entre dados locais e dados do servidor, **o servidor prevalece**
- Ao sincronizar, o APK envia seus dados e aceita a resposta do servidor como verdade
- O `client_event_id` previne duplicatas, mas não resolve conflitos de conteúdo
- Dados do servidor recebidos via Realtime substituem dados locais

### Exceções

- Dados que existem **apenas** localmente (fotos ainda não enviadas, rascunhos) nunca são sobrescritos
- O APK nunca deleta dados locais até confirmação de sincronização bem-sucedida

---

## Interface do Usuário

### Indicadores de estado de sincronização

O APK deve exibir informações claras sobre o estado da sincronização:

| Elemento | Descrição |
|---|---|
| Badge de pendentes | Contador visível mostrando quantos itens aguardam sincronização |
| Ícone por item | Cada registro exibe seu estado: `✓` sincronizado, `⏳` pendente, `↻` sincronizando, `✗` falhou |
| Botão "Sincronizar agora" | Dispara manualmente o sync worker |
| Lista de falhas | Tela dedicada para itens com `status = failed`, com opção de retry individual |

### Comportamento visual

- Ações criadas offline aparecem **imediatamente** na UI local com indicador de "pendente"
- Quando sincronizadas, o indicador muda para "sincronizado"
- Itens com falha exibem botão de retry e a mensagem do último erro
- O usuário pode tocar em um item com falha para ver detalhes e tentar novamente

### Exemplo de badge

```
📋 Pendentes: 3  |  ✗ Falhas: 1
```

---

## Resumo do Fluxo Offline

```
┌──────────────────────────────────────────────────────┐
│ 1. Usuário executa ação no APK                       │
│                    ▼                                 │
│ 2. Ação salva em sync_queue (SQLite) com             │
│    client_event_id único                             │
│                    ▼                                 │
│ 3. Mídia associada salva em media_queue              │
│                    ▼                                 │
│ 4. UI atualiza imediatamente (estado local)          │
│                    ▼                                 │
│ 5. Sync worker detecta conexão                       │
│                    ▼                                 │
│ 6. Upload da mídia (foto primeiro)                   │
│                    ▼                                 │
│ 7. Envio do registro com storagePath                 │
│                    ▼                                 │
│ 8. Se 23505 → sucesso (idempotência)                 │
│    Se sucesso → marcar synced                        │
│    Se erro → retry com backoff                       │
│                    ▼                                 │
│ 9. UI atualiza estado do item                        │
└──────────────────────────────────────────────────────┘
```
