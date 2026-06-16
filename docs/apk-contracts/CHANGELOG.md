# Changelog — Contratos APK

Todas as alterações relevantes nos contratos do APK são documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [v1.0.0-web-complete] — 2026-05-05

Versão inicial dos contratos. Corresponde ao estado do portal web 100% funcional, antes do início do desenvolvimento do APK.

### Documentado

- **Autenticação** (`01-authentication.md`)
  - `signInWithPassword` — login do gerente com credenciais criadas pelo engenheiro
  - Verificação de role via tabela `profiles`
  - Persistência de sessão e refresh de token
  - Tratamento de erros (credenciais inválidas, conta inexistente, sessão expirada)

- **Obras** (`02-works.md`)
  - Listagem de obras do gerente (read-only via `work_members`)
  - Detalhe de obra por ID
  - Campos retornados e valores possíveis de `status`
  - Restrição: gerente nunca cria, edita ou exclui obras

### Pendente (próximas versões)

- Contratos de Chat (mensagens, anexos, Realtime)
- Contratos de Diário de Obra (publicação, revisões, mídia)
- Contratos de Marcação de Postes (instalação, foto, GPS)
- Contratos de Checklists (preenchimento, conclusão)
- Contratos de Alertas/Emergências (criação, atualização)
- Contratos de Equipe (presença diária)
- Contratos de Marcos (sinalização de conclusão)
- Contratos de Notificações (push, feed)
- Contratos de Storage (upload de mídia)
- Contratos de Realtime (canais, subscrições)
