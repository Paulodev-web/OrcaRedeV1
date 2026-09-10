# 00 — Diagramas de Fluxo do APK

> **Versão do contrato:** `v1.0.0-web-complete`

Diagramas dos 5 fluxos principais do APK Android usando sintaxe Mermaid.

---

## 1. Login + Listagem de Obras

```mermaid
sequenceDiagram
    participant APK as APK Android
    participant Auth as Supabase Auth
    participant DB as Supabase DB

    APK->>Auth: signInWithPassword(email, password)
    Auth-->>APK: session (JWT + user)

    APK->>DB: SELECT * FROM profiles WHERE id = user.id
    DB-->>APK: profile { role }

    alt role = manager
        APK->>DB: "SELECT w.* FROM works w JOIN work_members wm ON wm.work_id = w.id WHERE wm.user_id = user.id"
        DB-->>APK: lista de obras
        APK->>APK: Exibir lista de obras
    else role != manager
        APK->>APK: "Bloquear acesso: exibir erro"
    end
```

---

## 2. Marcação de Poste (Pole Installation)

```mermaid
sequenceDiagram
    participant Gestor as Gestor (APK)
    participant Camera as Câmera
    participant GPS as GPS
    participant SQLite as SQLite Local
    participant Storage as Supabase Storage
    participant DB as Supabase DB

    Gestor->>Gestor: Abrir PDF do canvas
    Gestor->>Gestor: "Tocar no local desejado (coordenadas do PDF)"

    Gestor->>Camera: Capturar foto do poste
    Camera-->>Gestor: arquivo de imagem

    Gestor->>GPS: Solicitar coordenadas
    GPS-->>Gestor: "latitude, longitude (opcional)"

    Gestor->>Gestor: "Preencher campos opcionais (observações, tipo)"

    Gestor->>SQLite: "Salvar ação na sync_queue (status: pending)"
    SQLite-->>Gestor: Confirmado localmente

    Note over Gestor,DB: Sync Worker (quando há conexão)

    SQLite->>Storage: "1. Upload da foto (PRIMEIRO)"
    Storage-->>SQLite: storagePath

    SQLite->>DB: "2. recordPoleInstallation({ ..., storagePath, clientEventId })"
    DB-->>SQLite: "sucesso ou 23505 (idempotente)"

    SQLite->>SQLite: "Marcar como synced"
    DB-->>Gestor: Poste aparece no canvas
```

---

## 3. Diário de Obra (Daily Log)

```mermaid
sequenceDiagram
    participant Gestor as Gestor (APK)
    participant SQLite as SQLite Local
    participant Storage as Supabase Storage
    participant DB as Supabase DB
    participant Eng as Engenheiro (Portal)

    Gestor->>Gestor: Abrir formulário de diário

    Gestor->>Gestor: Selecionar equipe presente
    Gestor->>Gestor: Preencher atividades realizadas
    Gestor->>Gestor: Adicionar fotos

    Gestor->>SQLite: "Salvar na sync_queue (status: pending)"
    SQLite-->>Gestor: "Confirmado localmente (indicador pendente)"

    Note over Gestor,DB: Sync Worker

    SQLite->>Storage: Upload das fotos
    Storage-->>SQLite: storagePaths

    SQLite->>DB: "publishDailyLog({ ..., clientEventId })"
    DB-->>SQLite: "sucesso (status: pending_approval)"

    DB-->>Eng: "Realtime: novo diário para revisão"

    alt Engenheiro aprova
        Eng->>DB: "approveDailyLog(logId)"
        DB-->>Gestor: "Realtime: diário aprovado"
        Gestor->>Gestor: "Atualizar status: approved"
    else Engenheiro rejeita
        Eng->>DB: "rejectDailyLog(logId, motivo)"
        DB-->>Gestor: "Push: daily_log_rejected"
        Gestor->>Gestor: "Exibir motivo da rejeição"
        Gestor->>Gestor: Editar e corrigir diário
        Gestor->>DB: "publishDailyLog({ ..., novo clientEventId, revision + 1 })"
        Note over Gestor,DB: Nova revisão entra no mesmo ciclo de aprovação
    end
```

---

## 4. Alerta de Emergência

```mermaid
sequenceDiagram
    participant Gestor as Gestor (APK)
    participant Camera as Câmera
    participant GPS as GPS
    participant SQLite as SQLite Local
    participant Storage as Supabase Storage
    participant DB as Supabase DB

    Gestor->>Gestor: "Tocar botão de emergência"
    Gestor->>Gestor: "Selecionar categoria + severidade"

    Gestor->>Camera: Capturar foto
    Camera-->>Gestor: arquivo de imagem

    Gestor->>Gestor: Adicionar descrição

    Gestor->>GPS: "Captura automática de coordenadas"
    GPS-->>Gestor: "latitude, longitude"

    Gestor->>SQLite: "Salvar na sync_queue (status: pending)"
    SQLite-->>Gestor: "Confirmado localmente"

    Note over Gestor,DB: Sync Worker

    SQLite->>Storage: "1. Upload da foto (PRIMEIRO)"
    Storage-->>SQLite: storagePath

    SQLite->>DB: "2. openAlert({ categoria, severidade, foto, GPS, clientEventId })"
    DB-->>SQLite: "sucesso (status: open)"
    SQLite->>SQLite: "Marcar como synced"

    DB-->>DB: "Realtime: alerta aberto para engenheiro"
```

---

## 5. Checklist

```mermaid
sequenceDiagram
    participant Gestor as Gestor (APK)
    participant Camera as Câmera
    participant SQLite as SQLite Local
    participant Storage as Supabase Storage
    participant DB as Supabase DB
    participant Eng as Engenheiro (Portal)

    Gestor->>DB: Consultar checklists atribuídos
    DB-->>Gestor: Lista de checklists

    Gestor->>Gestor: Abrir checklist selecionado
    Gestor->>DB: "setChecklistInProgress(checklistId)"
    DB-->>Gestor: "status: in_progress"

    loop Para cada item do checklist
        Gestor->>Gestor: Marcar item como concluído

        opt Foto necessária ou opcional
            Gestor->>Camera: Capturar foto do item
            Camera-->>Gestor: arquivo de imagem
            Gestor->>SQLite: "Salvar foto na media_queue"
        end

        Gestor->>SQLite: "Salvar markChecklistItem na sync_queue"

        Note over SQLite,DB: Sync Worker
        SQLite->>Storage: "Upload da foto (se houver)"
        Storage-->>SQLite: storagePath
        SQLite->>DB: "markChecklistItem({ itemId, foto, clientEventId })"
        DB-->>SQLite: sucesso
    end

    Note over Gestor,DB: "Todos os itens marcados"
    DB->>DB: "status automático: awaiting_validation"

    Eng->>DB: Revisar checklist

    alt Engenheiro valida
        Eng->>DB: "validateChecklist(checklistId)"
        DB-->>Gestor: "Realtime: checklist validado"
        Gestor->>Gestor: "Atualizar status: validated"
    else Engenheiro devolve
        Eng->>DB: "returnChecklist(checklistId, comentários)"
        DB-->>Gestor: "Push: checklist_returned"
        Gestor->>Gestor: "Exibir comentários, corrigir itens"
        Note over Gestor,DB: Gestor corrige e reenvia itens
    end
```

---

## Fluxo Geral — Visão Macro

```mermaid
flowchart TD
    LoginNode["Login (signInWithPassword)"] --> VerifyRole{"role = manager?"}
    VerifyRole -->|Sim| ListaObras["Listar obras atribuídas"]
    VerifyRole -->|"Não"| BloqueioAccess["Bloquear acesso"]

    ListaObras --> SelecionarObra["Selecionar obra"]

    SelecionarObra --> MenuObra["Menu da Obra"]

    MenuObra --> Poste["Marcação de Poste"]
    MenuObra --> Diario["Diário de Obra"]
    MenuObra --> Alerta["Alerta de Emergência"]
    MenuObra --> ChecklistNode["Checklist"]
    MenuObra --> ChatNode["Chat"]

    Poste --> FilaLocal["Fila Local (SQLite)"]
    Diario --> FilaLocal
    Alerta --> FilaLocal
    ChecklistNode --> FilaLocal
    ChatNode --> FilaLocal

    FilaLocal --> SyncWorker["Sync Worker"]
    SyncWorker --> UploadMidia["Upload Mídia (Storage)"]
    UploadMidia --> EnvioRegistro["Envio do Registro (DB)"]
    EnvioRegistro --> Sincronizado["Sincronizado"]
```
