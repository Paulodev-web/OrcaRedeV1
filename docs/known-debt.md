# Dívidas Técnicas Conhecidas

Consolidação de dívidas técnicas registradas ao longo dos Blocos 1-8 do módulo Andamento de Obra. Cada entrada inclui localização, descrição, bloco de origem e sugestão de solução.

---

## [DEBT-001] Galeria sem paginação real completa

**Arquivo**: `src/services/works/getWorkGalleryItems.ts`
**Linha**: ~90
**Bloco onde registrado**: 7
**Prioridade**: Média
**Descrição**: A galeria agrega mídias de 6 fontes e aplica um limite alto (GALLERY_ITEMS_LIMIT = 200). Cursor-based pagination foi adicionada na Fase 9.1 para alertas, diário e notificações, mas a galeria ainda carrega por limite sem cursor real no service.
**Sugestão de solução**: Implementar cursor por `created_at` DESC na query agregada, respeitando filtros ativos. Requer refatoração do service para aceitar parâmetro `cursor`.

---

## [DEBT-002] Sincronização de contagem de notificações entre abas

**Arquivo**: `src/lib/hooks/useNotificationsRealtime.ts`
**Bloco onde registrado**: 9
**Prioridade**: Baixa
**Descrição**: Cada aba do navegador mantém sua própria subscription Realtime para notificações. Não há sincronização de contagem do badge entre abas via `localStorage` ou `BroadcastChannel`.
**Sugestão de solução**: Usar `BroadcastChannel` API para sincronizar `unreadCount` entre abas. Complexidade moderada, benefício marginal.

---

## [DEBT-003] Virtualização de listas longas

**Arquivo**: N/A (arquitetural)
**Bloco onde registrado**: 9
**Prioridade**: Baixa
**Descrição**: Listas com centenas de itens (galeria, chat) renderizam todos os itens DOM. Para obras com milhares de registros, virtualização (`react-window` ou similar) melhoraria performance de scroll.
**Sugestão de solução**: Avaliar `@tanstack/react-virtual` para listas com >500 itens visíveis.

---

## [DEBT-004] Upload manual de documentos

**Arquivo**: `src/app/tools/andamento-obra/obras/[workId]/documentos/page.tsx`
**Linha**: ~40
**Bloco onde registrado**: 3
**Prioridade**: Média
**Descrição**: A aba Documentos mostra apenas o PDF importado do orçamento. Upload manual de outros documentos (plantas, contratos) não está implementado.
**Sugestão de solução**: Adicionar componente de upload com drag-and-drop, armazenando em `andamento-obra/{workId}/documents/`.

---

## [DEBT-005] Signed URL do PDF sem fallback visual

**Arquivo**: `src/services/works/getWorkPdfSignedUrl.ts`
**Linha**: ~12
**Bloco onde registrado**: 3
**Prioridade**: Baixa
**Descrição**: Se o PDF não existir no Storage, o serviço retorna null mas sem retry nem log. O componente Canvas trata isso com empty state, mas sem feedback sobre o motivo.
**Sugestão de solução**: Adicionar tratamento de erro explícito e exibir mensagem mais informativa ao usuário.

---

## [DEBT-006] Cron job para limpeza automática de uploads órfãos

**Arquivo**: `src/actions/cleanupOrphanStorage.ts`
**Bloco onde registrado**: 5, 6, 7
**Prioridade**: Média
**Descrição**: A limpeza de uploads órfãos é manual (via página /admin). Em produção com uso constante, deveria ser agendada periodicamente.
**Sugestão de solução**: Configurar Supabase Edge Function com cron (pg_cron) ou Vercel Cron Job para executar a ação semanalmente.

---

## [DEBT-007] Auditoria automatizada de acessibilidade

**Arquivo**: N/A
**Bloco onde registrado**: 9
**Prioridade**: Baixa
**Descrição**: Auditoria de acessibilidade é feita manualmente. Ferramentas como Lighthouse, axe-core ou pa11y não estão integradas no pipeline de CI.
**Sugestão de solução**: Adicionar `@axe-core/react` em desenvolvimento e/ou Lighthouse CI no pipeline de build.

---

## [DEBT-008] Testes automatizados (E2E e unitários)

**Arquivo**: N/A
**Bloco onde registrado**: 1-9
**Prioridade**: Alta
**Descrição**: Todo o módulo foi validado com testes manuais. Não há suíte de testes automatizados (Jest, Vitest, Playwright, Cypress).
**Sugestão de solução**: Priorizar testes E2E para fluxos críticos (login, publicação de diário, criação de obra) com Playwright.

---

## [DEBT-009] Migração JSONB para tabelas dedicadas

**Arquivo**: Diversas tabelas (materials_planned, meters_planned, template_snapshot)
**Bloco onde registrado**: 4
**Prioridade**: Baixa
**Descrição**: Alguns dados são armazenados como JSONB em vez de tabelas normalizadas. Funciona bem para o volume atual, mas pode dificultar consultas complexas no futuro.
**Sugestão de solução**: Decisão de produto; avaliar quando volume justificar migração.

---

## [DEBT-010] i18n / Internacionalização

**Arquivo**: N/A
**Bloco onde registrado**: 9
**Prioridade**: Baixa
**Descrição**: Todo o módulo é em pt-BR hardcoded. Não há infraestrutura de i18n.
**Sugestão de solução**: Se necessário no futuro, adotar `next-intl` ou similar.

---

## [DEBT-011] Métricas e analytics

**Arquivo**: N/A
**Bloco onde registrado**: 9
**Prioridade**: Média
**Descrição**: Não há instrumentação de métricas de uso (quais funcionalidades são mais usadas, tempo de carregamento real, erros em produção).
**Sugestão de solução**: Integrar Vercel Analytics e/ou Sentry para monitoramento.

---

## [DEBT-012] Canvas com pan/zoom touch em mobile

**Arquivo**: `src/components/andamento-obra/works/canvas/WorkCanvas.tsx`
**Bloco onde registrado**: 7
**Prioridade**: Média
**Descrição**: O canvas usa `react-zoom-pan-pinch` que funciona em touch, mas a experiência em telas pequenas (<768px) pode ser melhorada com controles de zoom dedicados para mobile.
**Sugestão de solução**: Adicionar botões de zoom flutuantes (+/-) visíveis apenas em mobile, e verificar que gestos de pinch não conflitam com scroll da página.
