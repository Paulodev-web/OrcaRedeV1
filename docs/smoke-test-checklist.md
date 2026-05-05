# Checklist de Smoke Tests — Módulo Andamento de Obra

**Versão**: v1.0.0-web-complete (Fase 9.5)

## Pré-condições

- [ ] Bloco 8 aplicado e validado
- [ ] 2 engineers reais (A e B) com obras populadas
- [ ] DevTools Console aberto durante todo o teste
- [ ] Path do projeto em ASCII puro (workaround Turbopack)

---

## T1. Realtime do sino

- [ ] Engineer A logado em 2 abas (qualquer página do módulo)
- [ ] SQL insere notificação para A
- [ ] Sino atualiza em <2s sem refresh em ambas as abas
- [ ] Badge incrementa com animação pulse

## T2. Polling fallback do sino

- [ ] DevTools → throttle "Offline" por 60s
- [ ] Banner de polling ativa (ou refresh periódico)
- [ ] Voltar online → contagem correta, sem duplicatas

## T3. Paginação galeria

- [ ] Galeria com >50 itens
- [ ] Carrega 50 inicial
- [ ] "Carregar mais" carrega +50
- [ ] Sem duplicatas, filtros funcionam com paginação

## T4. Paginação diário/alertas

- [ ] Lista >20 itens
- [ ] "Carregar diários anteriores" funcional
- [ ] "Carregar alertas anteriores" funcional
- [ ] Cursor correto, ordenação estável

## T5. Rota notificações

- [ ] `/tools/andamento-obra/notificacoes` acessível
- [ ] Lista paginada funcional
- [ ] Filtro "Não lidas" funcional
- [ ] "Marcar todas como lidas" funcional

## T6. Hook fallback de mídia

- [ ] SQL corrompe um `storage_path` (UPDATE para valor inválido)
- [ ] Recarregar componente → fallback visual aparece
- [ ] App não quebra, navegação continua

## T7. Banner Realtime unificado

- [ ] Quebrar 2 canais (chat + diário) simultaneamente
- [ ] Banner de status aparece em cada componente montado
- [ ] Não duplica no mesmo componente

## T8. Performance home

- [ ] Engineer A com 10 obras
- [ ] Home carrega em <2s (medir com DevTools Network)

## T9. cleanupOrphanStorage

- [ ] Upload manual de arquivo no Storage sem registro no banco
- [ ] `/tools/andamento-obra/admin` acessível
- [ ] "Preview (dry-run)" → mostra arquivo como candidato
- [ ] "Executar limpeza" → arquivo removido
- [ ] Arquivos com registro permanecem

## T10. Docs APK

- [ ] `docs/apk-contracts/` contém 15 arquivos
- [ ] README.md presente em pt-BR
- [ ] 12 arquivos por feature com assinaturas TypeScript
- [ ] Diagramas mermaid renderizam (visualizar em editor)
- [ ] CHANGELOG.md com versão v1.0.0-web-complete

## T11. Matriz RLS

- [ ] SQL helpers executados como A e B
- [ ] A vê dados de A: ✅ em todas as tabelas
- [ ] A vê dados de B: 0 linhas em todas as tabelas
- [ ] A escreve em B: RLS error em todas as tabelas

## T12. Service role no bundle

- [ ] `npm run build` em path ASCII completa sem erros
- [ ] `rg "service_role" .next/static/` → 0 ocorrências

## T13. Smoke test engineer

Fluxo completo em sessão única, sem reiniciar:

1. [ ] Login
2. [ ] Central de Acompanhamento (home)
3. [ ] Criar obra
4. [ ] Importar OrcaRede
5. [ ] Atribuir gerente
6. [ ] Criar template de checklist
7. [ ] Atribuir checklist
8. [ ] Editar perfil de pessoas
9. [ ] Ver progresso
10. [ ] Aprovar diário (ou simular via SQL)
11. [ ] Resolver alerta (ou simular)
12. [ ] Sair (logout)

**Critério**: <5min total, zero `error` no console, zero `warning` que indique bug

## T14. Auditoria mobile

Testar em 360px, 768px, 1024px:

- [ ] Home: cards empilhados, sem overflow horizontal
- [ ] 9 abas da obra: scroll horizontal funcional
- [ ] Chat: composer fixo no rodapé, não cobre mensagens
- [ ] Canvas: pan/zoom funcional em touch
- [ ] Galeria: grid 2 colunas em mobile
- [ ] Dialogs: não cortam abaixo da tela
- [ ] Notificações: empilhadas verticalmente

## T15. Contraste/foco

- [ ] Badges vermelhos (alerta crítico): contraste ≥ 4.5:1
- [ ] Badges amarelos (pendência): contraste ≥ 4.5:1
- [ ] Foco visível em todos os botões e links
- [ ] Labels em todos os inputs de formulário
- [ ] Status comunicado por texto além de cor

## T16. TODOs auditados

- [ ] `rg "TODO|FIXME" src/` → todos resolvidos ou em `docs/known-debt.md`
- [ ] `docs/known-debt.md` completo com referências

## T17. Build clean

- [ ] `npm run build` (path ASCII) → sucesso
- [ ] `npx tsc --noEmit` → 0 erros
- [ ] `npm run lint` → 0 erros novos

---

## Resultado

| ID | Resultado | Tempo | Notas |
|----|-----------|-------|-------|
| T1 | | | |
| T2 | | | |
| T3 | | | |
| T4 | | | |
| T5 | | | |
| T6 | | | |
| T7 | | | |
| T8 | | | |
| T9 | | | |
| T10 | | | |
| T11 | | | |
| T12 | | | |
| T13 | | | |
| T14 | | | |
| T15 | | | |
| T16 | | | |
| T17 | | | |

**Testado por**: ___________
**Data**: ___________
**Tempo total smoke test (T13)**: ___ min
