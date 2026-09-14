# Andamento de Obra & APK Manager — Decisões e Diagnóstico

> Documento vivo. Registra o que foi levantado e decidido na retomada do módulo em ago/2026.
> Não substitui `Modulo_Andamento_de_Obra_Escopo.md`, `ApkOrcaRede/APK_SCOPE.md` nem os
> `docs/apk-contracts/*` — complementa: aqueles descrevem o desenho original (maio/2026), este
> registra o que mudou desde então e as decisões tomadas para reconciliar.

**Data:** 14 ago 2026
**Status:** Fase de diagnóstico concluída. Fases de execução aguardando início.
**Participantes:** Paulo (engenheiro responsável / dono do produto), Claude (levantamento + implementação).

---

## 1. Mandato

O módulo Andamento de Obra (web) e o APK Manager (campo) foram avaliados como "mal feitos" —
não no sentido de arquitetura ausente, mas de **nunca terem sido validados contra uso real**.
Decisão de escopo, explícita do dono do produto:

- **Não** é um descarte e reconstrução do que existe.
- É replanejamento de fluxos e processos, com foco em 4 frentes:
  1. Fazer o APK funcionar de verdade (não só existir em código).
  2. Adaptar o acesso ao cadastro real de pessoas (quem loga, o que pode fazer).
  3. Revisar o acesso que o sistema tem ao banco (RLS).
  4. Documentar tudo, e manter documentado.

## 2. Metodologia — decisão tomada

Antes de qualquer alteração em código ou banco, foi feito um diagnóstico completo:
leitura ao vivo do schema, das políticas de RLS e dos dados de produção no Supabase, cruzada
com leitura de código nos dois repositórios (`OrcaRede` web e `ApkOrcaRede`).

**Por quê:** havia risco real de re-planejar em cima de uma descrição do sistema (a
documentação de maio/2026) que já não é a realidade — como o diagnóstico confirmou (seção 4.2).

Nenhuma alteração foi aplicada ao código ou ao banco durante o diagnóstico.

## 3. Achado central

> **Nenhum gerente de obra jamais foi cadastrado em produção.** Zero diários, postes, alertas
> ou membros de equipe existem. O caminho completo do APK — login do gerente → ação em campo →
> dado aparecendo no portal do engenheiro — nunca rodou contra dado real, apesar de as 8 telas
> por obra, as 8 RPCs e os 16 documentos de contrato web↔APK existirem.

| Métrica (produção, ao vivo) | Valor |
| --- | --- |
| Obras (`works`) | 5 |
| Gerentes cadastrados (`profiles.role='manager'`) | **0** |
| Vínculos de gerente em obra (`work_members.role='manager'`) | **0** |
| Membros de equipe (`crew_members`) | **0** |
| Diários publicados (`work_daily_logs`) | **0** |
| Postes marcados (`work_pole_installations`) | **0** |
| Alertas abertos (`work_alerts`) | **0** |
| Tokens de push registrados (`device_tokens`) | **0** |

Isso muda a natureza do trabalho: não é "consertar bugs relatados de campo" — é **validar, pela
primeira vez, se o caminho funciona**, com um gerente real.

## 4. Diagnóstico por pilar

### 4.1. Pessoas e acesso

- Único role real em produção é `engineer` (4 perfis: paulodev.website, teste, luan, Carlos
  Tauchert). `teste@gmail.com` não pertence a nenhuma organização (`org_members`) — não usar
  como referência em testes.
- Fluxo `createManager` (`src/actions/people.ts:49-139`) existe, parece correto na leitura, mas
  **nunca foi executado em produção**.
- **DEBT-018 confirmado ainda aberto:** `createManager` não seta
  `user_metadata.must_change_password = true` ao criar a conta do gerente. Risco: gerente fica
  indefinidamente com a senha temporária definida pelo engenheiro.
- **Achado novo, severidade alta:** `createManager` nunca vincula o gerente a uma organização
  (`org_members`). Isso é coerente com o resto do desenho de RLS (gerente é reconhecido via
  `work_members`, não via organização) — **exceto** para `crew_members`, cuja política de leitura
  hoje é *só* `org_id = current_org_id()`, sem alternativa via `work_members`. Um gerente
  cadastrado hoje veria a tela "Equipe" sempre vazia, mesmo com pessoas alocadas na obra dele.
  → **Decisão de arquitetura pendente**, ver seção 5.1.

### 4.2. Acesso ao banco (RLS)

Linha do tempo que explica a maior parte da defasagem:

| Quando | O quê |
| --- | --- |
| Maio/2026 | Módulo declarado "v1.0.0-web-complete". `security-audit.md` e os 16 `apk-contracts/*` escritos e congelados neste modelo (acesso só via `profiles.role` + `work_members`). |
| 12 mai 2026 | APK para no Bloco 7 do roadmap de 11 blocos. `known-debt.md` do APK não é atualizado desde então. |
| 6–12 ago 2026 | Reforma de acesso do sistema inteiro: `org_foundation`, `org_id_backfill`, `org_rls_flip`, `module_permission_enforcement` (4 migrations, ~1.545 linhas). Introduz organizações, `current_org_id()`, `org_members` e permissão por módulo. |
| 14 ago 2026 (hoje) | Nenhum documento do módulo Andamento de Obra/APK menciona a reforma. `known-debt.md` (web) segue falando só de Blocos 1-9. |

Estado real da RLS, tabela por tabela (verificado via `pg_policies`, não só migration):

| Tabela | Modelo de acesso hoje | Fallback via `work_members` |
| --- | --- | --- |
| `works` | `org_id = current_org_id()` OU `is_work_member()` | sim |
| `crew_members` | só `org_id = current_org_id()` | **não** ⚠️ |
| `profiles` | próprio perfil / `created_by` / `shares_org_with()` | n/a |
| `work_members` (select) | `org_id = current_org_id()` OU `is_work_member()` | sim |
| `work_daily_logs` | só `work_members` (modelo antigo, intocado) | sim (é o único) |
| `work_alerts` | só `work_members` (modelo antigo, intocado) | sim (é o único) |
| `work_team` | só `work_members` (modelo antigo, intocado) | sim (é o único) |

O módulo está **com metade das tabelas no modelo novo (por organização) e metade no antigo (por
`work_members`)**. Isso por si só não quebra nada além do caso de `crew_members` acima, mas é
uma inconsistência que qualquer mudança futura em RLS precisa levar em conta.

- **Achado, severidade baixa, esclarecido:** `works_select` agora também libera visão para
  qualquer membro da organização (`org_id = current_org_id()`), não só para quem está em
  `work_members` da obra. Na prática, hoje, Carlos Tauchert (setor comercial) passa a enxergar
  todas as obras de execução da ON Engenharia Elétrica, não só as suas. Pode ser intencional
  (visibilidade de empresa) ou drift silencioso do princípio original ("engenheiro vê apenas
  suas obras"). → **Decisão de produto pendente**, ver seção 5.2.
- **Esclarecido, não é problema:** `module_permissions` (permissão por módulo, ex.: esconder
  "Andamento de Obra" do menu de um engenheiro) é **exclusiva do portal web** — a própria
  migration documenta "o APK não lê esta tabela". As duas camadas de acesso (RLS por
  organização / permissão por módulo) são independentes. O APK segue dependendo só de
  `profiles.role` + `profiles.is_active` + `work_members`.
- `security-audit.md` §5 (matriz de teste de RLS cross-obra) nunca foi executada — ficou marcada
  como "documentada, executar manualmente" desde maio. Hoje também está desatualizada: foi
  escrita antes de existir `org_id` nas políticas.

### 4.3. Fluxos de campo funcionando de verdade

- As 8 RPCs que o APK chama (`rpc_open_alert`, `rpc_publish_daily_log`,
  `rpc_record_pole_installation`, `rpc_report_milestone`, `rpc_mark_checklist_item`,
  `rpc_send_work_message`, `rpc_resolve_alert_in_field`, `rpc_add_alert_comment`) existem no
  banco, como `SECURITY DEFINER`, batendo com o que está em `ApkOrcaRede/migrations/`. Sem
  função ausente.
- `ApkOrcaRede` está com só 2 commits desde o início e, agora, 13 arquivos modificados sem
  commit — incluindo as 8 migrations de RPC, o cliente Supabase e o Sentry — mais 3 arquivos
  não rastreados (`app/RootLayoutApp.tsx`, `src/lib/env.ts`, `scripts/`). O que roda no
  dispositivo de desenvolvimento pode não ser o que está no último commit.
- 13 dívidas técnicas já mapeadas em `ApkOrcaRede/docs/known-debt.md` (DEBT-019 a DEBT-027) —
  áudio no chat, preview de vídeo, rascunho de diário, edição de poste, acumulado de metragem,
  filtros de alerta. Nenhuma impede o fluxo principal; são polimento já priorizado.

### 4.4. Documentação

Não falta documento — sobra, e é isso que torna a defasagem perigosa: `Modulo_Andamento_de_Obra_Escopo.md`,
`APK_SCOPE.md` (41 KB), 16 arquivos em `apk-contracts/` (~3.000 linhas), dois `known-debt.md` e
uma auditoria de segurança, todos descrevendo o modelo de acesso de antes de agosto. Quem ler os
contratos hoje não sabe que a camada de organizações existe.

## 5. Decisões de arquitetura em aberto

Estas ainda **não foram decididas** — são o primeiro trabalho da Fase 1 (seção 6).

### 5.1. Como o gerente ganha acesso a `crew_members`

Opções identificadas, a avaliar:

- **A. Vincular o gerente a `org_members`** no momento do `createManager`, com um `sector`
  próprio (ex.: `execucao`, que já existe como valor documentado em `org_foundation.sql`).
  Mais simples, reaproveita o modelo novo — mas dá ao gerente enxergar tudo que `org_id`
  libera hoje (inclusive `works` de outras obras, ver 5.2), o que pode ser mais acesso do que
  o desenhado ("gerente só vê a obra onde está alocado").
- **B. Adicionar uma policy alternativa em `crew_members`** que aceite também
  `is_work_member()` via `work_team` (a tabela que já associa crew a uma obra específica),
  igual ao que `works` e `work_members` já fazem. Mantém o gerente fora de `org_members` e
  restrito à(s) obra(s) dele. Mais consistente com o princípio original, mais trabalho de
  migration.
- **C.** Alguma combinação — ex.: opção B para o gerente, sem mexer em `org_members`.

### 5.2. Visibilidade de `works` por organização inteira

Confirmar se é intencional que qualquer engenheiro da organização veja todas as obras da
organização (comportamento atual) ou se deveria voltar a ser "cada engenheiro vê só as suas".
Afeta diretamente a opção certa em 5.1.

## 6. Roteiro proposto

Proposto nesta sessão de diagnóstico — **aguardando confirmação explícita antes de iniciar a
Fase 1**. Cada fase depende da anterior estar validada.

1. **Fechar o modelo de pessoas e acesso** — resolver 5.1 e 5.2, corrigir DEBT-018, cadastrar o
   primeiro gerente real (mesmo que de teste controlado).
2. **Rodar a matriz de RLS de verdade, no modelo atual** — reescrever `security-audit.md` §5
   incluindo `org_id`, executar contra um par engenheiro/gerente real, não só documentar.
3. **Primeiro ciclo de campo ponta a ponta** — com gerente cadastrado e acesso validado, rodar
   os 5 fluxos (poste, diário, chat, checklist, alerta) uma vez cada contra uma obra real e
   confirmar que o dado chega ao portal do engenheiro.
4. **Atualizar a documentação para o estado real** — reconciliar `apk-contracts/` e os dois
   `known-debt.md` com o que as fases 1-3 revelarem; registrar a camada de organizações como
   parte do contrato do módulo, não como sistema paralelo não documentado.

## 7. Como manter este documento

- Atualizar a seção 5 assim que cada decisão em aberto for tomada — mover de "em aberto" para
  um registro datado da escolha e do porquê.
- Ao fechar cada fase da seção 6, marcar aqui a data de conclusão e linkar o commit/PR relevante.
- Dívidas técnicas específicas que este diagnóstico revelou (ex.: 4.1 achado novo) devem virar
  entradas formais em `known-debt.md` (web ou APK, conforme o caso) na Fase 4 — este documento é
  o registro da decisão, `known-debt.md` é o rastreador operacional.

## 8. Referências

- `Modulo_Andamento_de_Obra_Escopo.md` — escopo original (maio/2026)
- `ApkOrcaRede/APK_SCOPE.md` — escopo detalhado do APK
- `docs/apk-contracts/` — contratos web↔APK (16 arquivos)
- `docs/known-debt.md` (web) e `ApkOrcaRede/docs/known-debt.md` — dívidas técnicas rastreadas
- `docs/security-audit.md` — auditoria de segurança de maio/2026 (RLS matrix pendente de execução)
- `supabase/migrations/20260806120000_org_foundation.sql` até `20260812163607_tarefas_module_permissions_seed.sql` — reforma de acesso de agosto/2026
- Diagnóstico visual (Artifact, mesma data): https://claude.ai/code/artifact/8234f652-975e-4d5e-a4e6-15e6a213424d
