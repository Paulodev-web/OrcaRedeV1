-- =============================================================================
-- SIMULACAO DE MENSAGENS DO GERENTE (DESENVOLVIMENTO)
--
-- O gerente nao existe como usuario ativo do APK ainda. Use estes scripts
-- para validar o fluxo bidirecional do chat (Realtime, notificacoes, badges).
--
-- Pre-requisitos:
--   1. Migration 20260504210000_andamento_obra_chat.sql aplicada.
--   2. Existe uma obra (works) com manager_id NOT NULL e o manager listado
--      em work_members com role='manager'.
--
-- Como usar:
--   Substitua os placeholders abaixo antes de executar:
--     <work_id>          UUID da obra (public.works.id)
--     <manager_user_id>  UUID do usuario manager (auth.users.id)
--                        Deve aparecer em work_members(work_id, role='manager').
--
-- LIMITACAO: Esta simulacao via SQL bypassa o Server Action sendWorkMessage,
-- portanto NAO testa idempotencia (client_event_id), validacao de tamanhos
-- de arquivo, ou checagem de MIME. Esses caminhos serao testados quando o
-- APK chegar (Fase posterior).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Inspecao auxiliar (descobrir IDs validos antes de simular)
-- -----------------------------------------------------------------------------
-- Listar obras e seus gerentes (so as que tem manager):
-- SELECT w.id AS work_id, w.name, w.manager_id, p.full_name AS manager_name
--   FROM public.works w
--   LEFT JOIN public.profiles p ON p.id = w.manager_id
--  WHERE w.manager_id IS NOT NULL
--  ORDER BY w.created_at DESC;

-- Confirmar que <manager_user_id> e membro da obra como 'manager':
-- SELECT * FROM public.work_members
--  WHERE work_id = '<work_id>'::uuid
--    AND user_id = '<manager_user_id>'::uuid;

-- -----------------------------------------------------------------------------
-- 1. Mensagem de texto simples
-- -----------------------------------------------------------------------------
INSERT INTO public.work_messages (work_id, sender_id, sender_role, body)
VALUES (
  '<work_id>'::uuid,
  '<manager_user_id>'::uuid,
  'manager',
  'Bom dia! Equipe chegou no canteiro às 7h45. Tudo certo para começar.'
);

-- -----------------------------------------------------------------------------
-- 2. Mensagem com anexo de imagem
--
-- PASSO MANUAL OBRIGATORIO ANTES:
--   - Acesse Supabase Studio > Storage > andamento-obra
--   - Crie a pasta: <work_id>/chat/<NEW_MSG_UUID>/
--     (gere um UUID com: SELECT gen_random_uuid(); — copie o valor)
--   - Faca upload manual de uma imagem (ex.: foto-canteiro.jpg) nesta pasta
--   - Substitua <NEW_MSG_UUID> abaixo pelo mesmo UUID gerado
-- -----------------------------------------------------------------------------
WITH new_msg AS (
  INSERT INTO public.work_messages (id, work_id, sender_id, sender_role, body)
  VALUES (
    '<NEW_MSG_UUID>'::uuid,
    '<work_id>'::uuid,
    '<manager_user_id>'::uuid,
    'manager',
    NULL
  )
  RETURNING id
)
INSERT INTO public.work_message_attachments (
  message_id, work_id, kind, storage_path, mime_type, size_bytes
)
SELECT
  new_msg.id,
  '<work_id>'::uuid,
  'image',
  '<work_id>/chat/' || new_msg.id::text || '/foto-canteiro.jpg',
  'image/jpeg',
  1048576  -- ~1MB
FROM new_msg;

-- -----------------------------------------------------------------------------
-- 3. Mensagem com video (com legenda)
--
-- Mesmo passo manual: faca upload do video em
-- <work_id>/chat/<NEW_MSG_UUID>/progresso.mp4 antes de rodar.
-- -----------------------------------------------------------------------------
WITH new_msg AS (
  INSERT INTO public.work_messages (id, work_id, sender_id, sender_role, body)
  VALUES (
    '<NEW_MSG_UUID>'::uuid,
    '<work_id>'::uuid,
    '<manager_user_id>'::uuid,
    'manager',
    'Video do progresso de hoje. Postes 1-5 instalados.'
  )
  RETURNING id
)
INSERT INTO public.work_message_attachments (
  message_id, work_id, kind, storage_path, mime_type, size_bytes, duration_seconds
)
SELECT
  new_msg.id,
  '<work_id>'::uuid,
  'video',
  '<work_id>/chat/' || new_msg.id::text || '/progresso.mp4',
  'video/mp4',
  52428800,  -- 50MB
  120        -- 2min
FROM new_msg;

-- -----------------------------------------------------------------------------
-- 4. Mensagem so com audio
-- -----------------------------------------------------------------------------
WITH new_msg AS (
  INSERT INTO public.work_messages (id, work_id, sender_id, sender_role, body)
  VALUES (
    '<NEW_MSG_UUID>'::uuid,
    '<work_id>'::uuid,
    '<manager_user_id>'::uuid,
    'manager',
    NULL
  )
  RETURNING id
)
INSERT INTO public.work_message_attachments (
  message_id, work_id, kind, storage_path, mime_type, size_bytes, duration_seconds
)
SELECT
  new_msg.id,
  '<work_id>'::uuid,
  'audio',
  '<work_id>/chat/' || new_msg.id::text || '/atualizacao.mp3',
  'audio/mpeg',
  3145728,  -- 3MB
  180       -- 3min
FROM new_msg;

-- -----------------------------------------------------------------------------
-- 5. Loop de mensagens para testar paginacao (T15)
--    Cria 60 mensagens com timestamps distribuidos nos ultimos 60 minutos.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  i INT;
BEGIN
  FOR i IN 1..60 LOOP
    INSERT INTO public.work_messages (work_id, sender_id, sender_role, body, created_at)
    VALUES (
      '<work_id>'::uuid,
      '<manager_user_id>'::uuid,
      'manager',
      'Mensagem de teste ' || i,
      now() - (60 - i) * interval '1 minute'
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 6. Verificacoes
-- -----------------------------------------------------------------------------
-- 6.1. Notificacao gerada para o engenheiro:
SELECT id, kind, title, body, link_path, is_read, created_at
  FROM public.notifications
 WHERE work_id = '<work_id>'::uuid
   AND kind = 'message_received'
 ORDER BY created_at DESC
 LIMIT 5;

-- 6.2. last_activity_at atualizado na obra:
SELECT id, name, last_activity_at
  FROM public.works
 WHERE id = '<work_id>'::uuid;

-- 6.3. Mensagens nao lidas pelo engenheiro nesta obra:
SELECT count(*) AS unread_for_engineer
  FROM public.work_messages
 WHERE work_id = '<work_id>'::uuid
   AND sender_role = 'manager'
   AND read_by_engineer_at IS NULL;

-- 6.4. Paths armazenados de anexos no Storage:
SELECT name
  FROM storage.objects
 WHERE bucket_id = 'andamento-obra'
   AND name LIKE '<work_id>/chat/%'
 ORDER BY created_at DESC
 LIMIT 10;

-- -----------------------------------------------------------------------------
-- 7. Limpeza opcional (so use se quiser limpar mensagens de teste)
-- -----------------------------------------------------------------------------
-- DELETE FROM public.work_messages
--  WHERE work_id = '<work_id>'::uuid
--    AND sender_id = '<manager_user_id>'::uuid;
-- (Cascata remove work_message_attachments via FK ON DELETE CASCADE.)
-- (Storage objects em <work_id>/chat/* precisam ser removidos manualmente.)
