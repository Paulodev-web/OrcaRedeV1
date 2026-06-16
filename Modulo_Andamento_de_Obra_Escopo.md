ESCOPO — MÓDULO ANDAMENTO DE OBRA
1. Visão Geral
Módulo do sistema OrcaRede destinado ao engenheiro responsável técnico acompanhar a execução de obras de redes de distribuição elétrica em campo. As informações são alimentadas em tempo real por um APK Android usado pelo gerente de obra que está fisicamente no canteiro. O módulo centraliza comunicação, evidências de execução, controle de progresso e fluxos de aprovação formais entre engenheiro e campo.
2. Personas
Engenheiro responsável (usuário do sistema web)

Acompanha até 5 obras simultâneas
Opera do escritório/deslocamento via portal web
Responsabilidade: consultar, aprovar, comunicar, registrar documentos
Único papel administrativo do módulo (sem hierarquia)

Gerente de obra (usuário do APK)

Está em campo durante a execução da obra
Reporta ao engenheiro pelo APK
Pode estar alocado em mais de uma obra ao mesmo tempo
Cada obra tem um único gerente responsável
Não tem acesso ao portal web

Membro da equipe / crew (sem login)

Apenas ficha cadastral mantida pelo engenheiro
Aparece em registros de presença diária e alocação
Não interage com o sistema

3. Princípios de Design

Web 100% funcional antes do APK — toda lógica e UX validada no portal primeiro
Mobile-first no APK: offline-first com fila persistente, botões grandes, telas curtas, GPS e câmera sempre à mão
Idempotência em toda escrita do APK via client_event_id
Realtime em comunicação e eventos críticos (Supabase Realtime)
RLS rigorosa: engenheiro vê apenas suas obras, gerente vê apenas as obras onde está alocado
Aprovações formais com versionamento e histórico em todos os pontos de validação
Geolocalização capturada em todas as ações de campo

4. Escopo Funcional — Portal Web (Engenheiro)
4.1. Cadastro de Pessoas (aba transversal)

Gerentes de Obra: CRUD com criação de conta via Supabase Auth Admin API (e-mail + senha temporária definida pelo engenheiro)
Equipe (crew): CRUD de fichas sem login (nome, função, telefone, documento, observações)
Reaproveitamento entre obras

4.2. Tela inicial do módulo (split view)
Central de Acompanhamento (esquerda)
Lista de obras agrupada por prioridade:

🔴 Precisa de você agora (emergências abertas, obras paradas >24h)
🟡 Aguardando revisão (diários, checklists, marcos pendentes, alertas a confirmar)
🟢 Em andamento normal (ordenadas por última atividade)
⚪ Pausadas/Concluídas (colapsadas)

Central de Notificações (direita)

Feed cronológico de eventos de todas as obras
Agrupado por dia
Cada notificação clicável leva ao contexto exato

Botão "+ Nova Obra" com duas opções:

Importar do OrçaRede (PDF do projeto + snapshot de postes/conexões/materiais/metragem/marcos — fixo, sem ressincronização)
Criar do zero (sem canvas)

4.3. Detalhe da obra
Cabeçalho fixo com nome, status, KPIs (% progresso, postes instalados/planejados, dias decorridos, alertas ativos).
Abas:
AbaFunçãoVisão GeralWidget principal evolutivo. Em obra sem execução: PDF do projeto cinza + resumo planejado. Em execução: canvas com PDF de fundo + pins de execução coloridos por status (verde instalado, amarelo pendência, vermelho alerta). Read-only.ChatConversa 1:1 engenheiro ↔ gerente. Texto, foto, vídeo (até 100 MB), áudio. Realtime, indicador de lido, paginação reversa.DiárioTimeline de registros diários publicados pelo gerente. Fluxo de aprovação (pendente → aprovado/rejeitado com comentário, versionamento).ProgressoPlanejado vs realizado. Postes, metragem por categoria (BT/MT), curva S, status por marco.EquipeMembros alocados (puxados do cadastro de Pessoas), presença diária consolidada.ChecklistsModelos reutilizáveis criados pelo engenheiro (com flag "padrão"); atribuição a obras; fluxo de validação.AlertasEmergências do APK. Severidade, fluxo aberto → em tratativa → resolvido em campo → encerrado.GaleriaMídias agregadas de todas as origens (chat + diário + checklists + canvas). Filtros por data/origem/tipo.DocumentosExclusivo do engenheiro: PDF do projeto importado + ART, licenças, contratos. Gerente não tem acesso.
4.4. Marcos da obra
Conjunto padrão importado/criado: Locação → Postes instalados → Cabeamento BT → Cabeamento MT → Energização → Comissionamento. Cada marco passa por aprovação formal do engenheiro.
4.5. Fluxos de aprovação
ItemEstado pendente quandoAções do engenheiroDiárioGerente publicaAprovar / Rejeitar com comentário (volta com nova versão)ChecklistTodos os itens marcadosValidar / DevolverMarcoGerente sinaliza concluídoAprovar / ReprovarAlertaGerente marca "resolvido em campo"Confirmar encerramento
4.6. Canvas no Andamento

Componente novo (WorkCanvas) reutilizando partes do CanvasVisual.tsx existente (TransformWrapper, render PDF V1/V2, PostIcon)
Modo read-only com camadas: projeto (cinza) + execução (pins coloridos sobre o PDF)
Toolbar simplificada: zoom, pan, recentrar, alternar PDF, alternar camada de projeto
Clique em pin abre painel lateral com foto, GPS real, data, observações, histórico

5. Escopo Funcional — APK Android (Gerente)
5.1. Stack
React Native + Expo, fila offline em SQLite, push notifications, sync em background.
5.2. Telas
TelaFunçãoLoginCredencial criada pelo engenheiroMinhas ObrasLista de obras alocadas, badges de não lidas e pendênciasHub da ObraGrid com 6 botões grandes: Marcar Poste, Diário de Hoje, Chat, Checklist, Emergência (vermelho destacado), EquipeMarcar PosteAbre PDF do projeto. Gerente clica livremente em qualquer ponto. Modal: foto obrigatória + GPS automático + numeração livre opcional + observações. Pin verde aparece imediatamente.Diário de HojeFormulário: equipe presente, atividades, postes instalados (auto), metragem por categoria, materiais, intercorrências, fotos. Publicar → estado pendente_aprovação.ChatTexto, foto, vídeo, áudio. Mensagens enfileiradas se sem rede.ChecklistLista de checklists atribuídos. Marca itens, anexa foto opcional. Concluir → aguardando_validação.Emergência3 perguntas rápidas (tipo, foto, descrição). GPS automático. Prioridade no envio.EquipeMarca presença do dia. Não cria nem edita pessoas.
5.3. Restrições do APK
Gerente não vê documentos, não aprova nada, não vê preços/orçamentos, não edita projeto, não cria obras, não cadastra pessoas.
5.4. Comportamento offline

Todas as ações salvas em SQLite local
Worker em background tenta sincronizar quando há rede
Funciona com app fechado/segundo plano
UI mostra contagem de itens pendentes
Fotos sem limite de armazenamento local
Vídeos até 100 MB sobem mesmo via 4G

5.5. Push notifications

Mensagem nova do engenheiro
Diário rejeitado
Checklist devolvido
Marco reprovado
Alerta encerrado pelo engenheiro
Convite de obra (alocação)

6. Pontos de Contato (Web ↔ APK)
EventoOrigemDestinoRealtimeMensagem de chatBidirecionalBidirecional✅Marcação de posteAPKPortal (canvas + galeria)✅Diário publicadoAPKPortal✅Diário aprovado/rejeitadoPortalAPK (push)✅Checklist concluídoAPKPortal✅Checklist devolvidoPortalAPK (push)✅Marco concluído sinalizadoAPKPortal✅Marco aprovado/reprovadoPortalAPK (push)✅Alerta de emergênciaAPKPortal (urgente)✅Alerta encerradoPortalAPK (push)✅Convite/alocação de obraPortalAPK (push)✅Modelo de checklist atribuídoPortalAPK✅Presença do diaAPKPortal✅
7. Modelo de Dados Conceitual
Pessoas e contas

profiles, crew_members, device_tokens

Obras

works, work_members, work_team, work_team_attendance

Snapshot do projeto (importado do OrçaRede)

work_project_snapshot, work_project_posts, work_project_connections

Execução em campo

work_pole_installations, work_messages, work_message_attachments
work_daily_logs, work_daily_log_revisions, work_daily_log_media
work_milestones, work_milestone_events

Checklists

checklist_templates, checklist_template_items
work_checklists, work_checklist_items, work_checklist_runs

Alertas

work_alerts, work_alert_updates

Documentos

work_documents

Notificações

notifications

8. Storage (Supabase)
Bucket único andamento-obra estruturado por obra:
andamento-obra/{work_id}/
  project/        — PDF do projeto importado
  chat/{message_id}/
  daily-logs/{log_id}/
  pole-installations/{install_id}/
  checklists/{run_id}/{item_id}/
  alerts/{alert_id}/
  documents/{doc_id}/
Policies espelham a RLS do banco (path-based por work_id).
9. Realtime (canais Supabase)

work:{work_id}:chat — mensagens
work:{work_id}:events — instalações, diários, checklists, alertas, marcos
user:{user_id}:notifications — feed da Central de Notificações

10. RLS — Princípios

Engenheiro vê e edita obras onde figura como engineer em work_members
Gerente vê e escreve apenas em obras onde figura como manager em work_members
Gerente nunca vê work_documents
Gerente não vê templates de checklist nem pessoas não alocadas em sua obra
Idempotência por UNIQUE(client_event_id) nas tabelas que recebem escrita do APK

11. Roadmap de Desenvolvimento (11 blocos)
Fase Web (Blocos 1–11)

Fundação: schema base + RLS + cadastro de Pessoas
Esqueleto do módulo + entidade works + tela inicial (split view)
Importação do OrçaRede + snapshot do projeto
Canvas read-only no Andamento (Visão Geral evolutiva)
Chat com Realtime + Storage de mídia
Diário de Obra + fluxo de aprovação (estabelece padrão)
Marcação de postes (pins de execução, simulada via SQL antes do APK)
Checklists (templates + atribuição + aprovação)
Marcos + Progresso + KPIs avançados
Alertas/Emergências + Equipe da obra
Polimento web + Galeria avançada + documentação de contratos para o APK

Fase APK (após web 100%)

Bases (login, hub, marcar poste, chat, diário, fila offline, push)
Completo (checklists, emergências, equipe, polimento)

12. Não-Objetivos (fora do módulo)

Construção do APK Android nesta fase (separado)
Push notifications nativas no portal web (apenas in-app)
Integração com ERPs externos
Edição de orçamentos a partir do módulo (Documentos é read-only do PDF importado)
Hierarquia de engenheiros / multi-tenant complexo
Reset de senha do gerente pelo engenheiro (gerente troca pelo APK)
Cadastro de gerente sem login

13. Premissas Travadas

Stack: Next.js 16 App Router + React 19 + TS + Tailwind v4 + Supabase
Convenções obrigatórias do projeto: Server Components por padrão, navegação Next.js, lógica em src/services/
Timezone padrão: America/Sao_Paulo
Limites de mídia: foto sem limite individual, vídeo 100 MB no chat, áudio sem transcrição
Snapshot do OrçaRede é fixo (sem ressincronização)
Canvas do Andamento é read-only e não interfere no orçamento original
Documentos só pro engenheiro (gerente nem sabe que existe)
Marcação de postes é livre no PDF (sem validação contra o snapshot)
Geolocalização capturada em todas as ações de campo
Idempotência por client_event_id em toda escrita vinda do APK