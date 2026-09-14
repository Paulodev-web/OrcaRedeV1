# 02 — Obras (Works)

> **Persona:** Gerente de Obra (role `manager`)
> **Acesso:** Somente leitura (read-only)

---

## Contexto

O gerente de obra **não cria, edita nem exclui obras**. Ele apenas visualiza as obras nas quais está alocado como `manager` na tabela `work_members`.

A alocação é feita pelo engenheiro no portal web. Quando o engenheiro define o `manager_id` de uma obra, um trigger automático insere o registro correspondente em `work_members`.

---

## Restrições do Gerente

| Operação | Permitido? |
| -------- | ---------- |
| Listar obras alocadas | Sim |
| Ver detalhe de uma obra | Sim |
| Criar obra | Não |
| Editar obra | Não |
| Excluir obra | Não |
| Ver documentos da obra | Não |
| Ver orçamento/preços | Não |

---

## 1. Listar obras do gerente

Retorna todas as obras onde o gerente autenticado é membro com role `manager`.

### Query

```typescript
const userId = (await supabase.auth.getUser()).data.user?.id;

const { data: works, error } = await supabase
  .from('works')
  .select(`
    id,
    name,
    client_name,
    utility_company,
    address,
    status,
    started_at,
    expected_end_at,
    last_activity_at,
    notes,
    created_at,
    updated_at
  `)
  .order('last_activity_at', { ascending: false });
```

> **Nota sobre RLS:** A tabela `works` possui RLS ativa. A policy `works_select` já filtra automaticamente — o gerente só vê obras onde existe registro `work_members(work_id, user_id=auth.uid())`. Não é necessário fazer JOIN explícito com `work_members`.

### Resposta — Exemplo JSON

```json
{
  "success": true,
  "data": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "name": "Rede BT Vila Nova",
      "client_name": "Prefeitura Municipal",
      "utility_company": "CEMIG",
      "address": "Rua das Flores, 123 - Vila Nova",
      "status": "in_progress",
      "started_at": "2026-04-15",
      "expected_end_at": "2026-07-30",
      "last_activity_at": "2026-05-05T10:32:00.000Z",
      "notes": "Atenção ao trecho próximo à escola.",
      "created_at": "2026-04-10T14:00:00.000Z",
      "updated_at": "2026-05-05T10:32:00.000Z"
    },
    {
      "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "name": "Extensão MT Bairro Industrial",
      "client_name": null,
      "utility_company": "CPFL",
      "address": "Av. Brasil, s/n - Distrito Industrial",
      "status": "planned",
      "started_at": null,
      "expected_end_at": "2026-09-15",
      "last_activity_at": "2026-05-01T08:00:00.000Z",
      "notes": null,
      "created_at": "2026-05-01T08:00:00.000Z",
      "updated_at": "2026-05-01T08:00:00.000Z"
    }
  ]
}
```

### Erro — Exemplo JSON

```json
{
  "success": false,
  "error": "Não foi possível carregar as obras. Tente novamente."
}
```

---

## 2. Detalhe de uma obra

Retorna os dados completos de uma obra específica.

### Query

```typescript
const { data: work, error } = await supabase
  .from('works')
  .select(`
    id,
    name,
    client_name,
    utility_company,
    address,
    status,
    started_at,
    expected_end_at,
    completed_at,
    last_activity_at,
    notes,
    created_at,
    updated_at
  `)
  .eq('id', workId)
  .single();
```

> **Nota:** Se o gerente não for membro da obra, a RLS retorna `null` (sem erro explícito de permissão). Tratar como "obra não encontrada".

### Resposta — Exemplo JSON

```json
{
  "success": true,
  "data": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "name": "Rede BT Vila Nova",
    "client_name": "Prefeitura Municipal",
    "utility_company": "CEMIG",
    "address": "Rua das Flores, 123 - Vila Nova",
    "status": "in_progress",
    "started_at": "2026-04-15",
    "expected_end_at": "2026-07-30",
    "completed_at": null,
    "last_activity_at": "2026-05-05T10:32:00.000Z",
    "notes": "Atenção ao trecho próximo à escola.",
    "created_at": "2026-04-10T14:00:00.000Z",
    "updated_at": "2026-05-05T10:32:00.000Z"
  }
}
```

---

## Campos da tabela `works`

| Coluna              | Tipo           | Nullable | Descrição |
| ------------------- | -------------- | -------- | --------- |
| `id`                | `UUID` (PK)    | Não      | Identificador único da obra |
| `engineer_id`       | `UUID` (FK)    | Não      | Engenheiro responsável (não exposto ao APK) |
| `manager_id`        | `UUID?` (FK)   | Sim      | Gerente alocado (não exposto ao APK) |
| `budget_id`         | `UUID?`        | Sim      | Orçamento importado (não exposto ao APK) |
| `name`              | `TEXT`         | Não      | Nome da obra |
| `client_name`       | `TEXT?`        | Sim      | Nome do cliente |
| `utility_company`   | `TEXT?`        | Sim      | Concessionária de energia |
| `address`           | `TEXT?`        | Sim      | Endereço da obra |
| `status`            | `TEXT`         | Não      | Status atual (ver valores abaixo) |
| `started_at`        | `DATE?`        | Sim      | Data de início real |
| `expected_end_at`   | `DATE?`        | Sim      | Previsão de término |
| `completed_at`      | `TIMESTAMPTZ?` | Sim      | Data/hora de conclusão |
| `last_activity_at`  | `TIMESTAMPTZ`  | Não      | Última atividade (usado para ordenação) |
| `notes`             | `TEXT?`        | Sim      | Observações gerais |
| `created_at`        | `TIMESTAMPTZ`  | Não      | Data de criação |
| `updated_at`        | `TIMESTAMPTZ`  | Não      | Última atualização |

> **Campos omitidos na resposta ao APK:** `engineer_id`, `manager_id`, `budget_id` — o gerente não precisa dessas referências internas.

---

## Valores de `status`

| Valor          | Label (pt-BR)     | Descrição |
| -------------- | ----------------- | --------- |
| `planned`      | Planejada         | Obra criada, ainda não iniciada |
| `in_progress`  | Em andamento      | Obra em execução ativa |
| `paused`       | Pausada           | Obra temporariamente suspensa |
| `completed`    | Concluída         | Obra finalizada com sucesso |
| `cancelled`    | Cancelada         | Obra cancelada (soft delete) |

---

## RLS aplicável

A policy `works_select` garante que o gerente só visualiza obras onde é membro:

```sql
CREATE POLICY "works_select" ON public.works
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = works.id
        AND wm.user_id = auth.uid()
    )
  );
```

Não existem policies de `INSERT`, `UPDATE` ou `DELETE` para o role `manager` na tabela `works`. Qualquer tentativa de escrita retorna erro de permissão.

---

## Tabela auxiliar: `work_members`

Tabela de associação que vincula usuários a obras.

| Coluna      | Tipo           | Descrição |
| ----------- | -------------- | --------- |
| `work_id`   | `UUID` (PK, FK)| Referência à obra |
| `user_id`   | `UUID` (PK, FK)| Referência ao usuário (`auth.users`) |
| `role`      | `TEXT`         | `'engineer'` ou `'manager'` |
| `created_at`| `TIMESTAMPTZ`  | Data de criação do vínculo |

> **PK composta:** `(work_id, user_id)` — um usuário aparece no máximo uma vez por obra.

O gerente **não** manipula essa tabela diretamente. A associação é gerenciada por triggers automáticos disparados quando o engenheiro define `works.manager_id`.

---

## Paginação

Para a listagem de obras, a paginação por cursor **não é necessária** na prática — um gerente está alocado em poucas obras simultaneamente (tipicamente 1-5). A query retorna todas de uma vez, ordenadas por `last_activity_at DESC`.

Se no futuro o volume justificar paginação:

```typescript
const { data } = await supabase
  .from('works')
  .select('...')
  .lt('last_activity_at', cursor)
  .order('last_activity_at', { ascending: false })
  .limit(20);
```

---

## Diagrama de Sequência

```
APK                           Supabase (PostgREST + RLS)
 │                                     │
 │─── GET works (select + order) ─────►│
 │                                     │
 │    [RLS filtra por work_members     │
 │     onde user_id = auth.uid()]      │
 │                                     │
 │◄── [ obra1, obra2, ... ] ──────────│
 │                                     │
 │─── GET works?id=eq.{workId} ──────►│
 │                                     │
 │    [RLS: só retorna se for membro]  │
 │                                     │
 │◄── { obra detalhada } ─────────────│
```
