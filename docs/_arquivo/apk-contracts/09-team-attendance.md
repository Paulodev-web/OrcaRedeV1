# 09 — Equipe e Presença

> **Versão:** `v1.0.0-web-complete`

---

## Visão Geral

O gerenciamento de equipe e controle de presença no APK é **somente leitura**. O gerente **não** envia registros de presença diretamente — a presença é registrada como parte do diário de obra (`publishDailyLog`), através do campo `crew_present[]`.

---

## Modelo de Dados

### Tabela `crew_members`

Cadastro de membros de equipe (gerenciado pelo engenheiro via portal web).

| Coluna         | Tipo     | Descrição                              |
| -------------- | -------- | -------------------------------------- |
| `id`           | UUID     | Identificador único                    |
| `name`         | string   | Nome completo                          |
| `role_function`| string   | Função/cargo (ex: eletricista, pedreiro) |
| `phone`        | string   | Telefone de contato                    |
| `document`     | string   | Documento (CPF ou RG)                  |
| `observations` | string   | Observações gerais                     |

### Tabela `work_team`

Vinculação de membros a uma obra específica.

| Coluna           | Tipo     | Descrição                         |
| ---------------- | -------- | --------------------------------- |
| `id`             | UUID     | Identificador do vínculo          |
| `work_id`        | UUID     | Obra vinculada                    |
| `crew_member_id` | UUID     | Membro da equipe                  |
| `active`         | boolean  | Se o membro está ativo na obra    |
| `created_at`     | timestamp| Data de inclusão                  |

---

## Leitura — Listar Equipe da Obra

O APK consulta a equipe disponível para seleção no diário:

```typescript
const { data } = await supabase
  .from('work_team')
  .select(`
    id,
    active,
    crew_member:crew_members (
      id,
      name,
      role_function,
      phone,
      document,
      observations
    )
  `)
  .eq('work_id', workId)
  .eq('active', true)
  .order('crew_member(name)', { ascending: true });
```

---

## Presença — Via Diário de Obra

A presença **não** é uma action separada. O gerente seleciona os membros presentes ao publicar o diário:

```typescript
// Dentro do publishDailyLog
{
  workId: string;
  date: string;
  crew_present: string[];  // Array de crew_member_id's presentes no dia
  // ... outros campos do diário
}
```

O APK deve:
1. Carregar a lista de `work_team` (membros ativos da obra)
2. Apresentar interface de seleção (checkboxes ou similar)
3. Incluir os IDs selecionados no campo `crew_present` do `publishDailyLog`

---

## Actions de Escrita

**Não existem actions de escrita para equipe/presença no APK.**

| Operação                        | Responsável | Interface |
| ------------------------------- | ----------- | --------- |
| Cadastrar membro de equipe      | Engenheiro  | Portal web |
| Vincular membro a uma obra      | Engenheiro  | Portal web |
| Remover membro de uma obra      | Engenheiro  | Portal web |
| Registrar presença              | Gerente     | Via `publishDailyLog` |

---

## Fluxo no APK

1. Na tela de criação do diário, carregar equipe ativa via query `work_team`
2. Exibir lista de membros com nome e função
3. Gerente marca quem está presente no dia
4. IDs marcados são enviados como `crew_present[]` no `publishDailyLog`
5. Histórico de presença pode ser consultado nos diários já publicados

---

## Offline

- A lista de equipe deve ser cacheada localmente após o primeiro carregamento
- Atualizar cache quando houver conexão (pull on reconnect)
- A seleção de presença é salva junto com o diário na fila offline
