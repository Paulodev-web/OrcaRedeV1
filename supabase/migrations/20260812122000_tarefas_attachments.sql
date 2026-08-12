-- =============================================================================
-- ESTEIRA DE TRABALHO — anexos do card
--
-- POR QUE ENTRA AGORA (a versão da manhã adiou de propósito)
--   Adiar anexo mata o módulo. O briefing da Fase 1 É um PDF ou uma foto do
--   local; o retorno da Engenharia É um arquivo. Sem anexo, a conversa vira
--   "manda no zap que eu te mando o arquivo" — exatamente o gargalo do
--   mapeamentooperacional.md §4.
--
-- DUAS PORTAS, UM LUGAR SÓ
--   `message_id NULL` é o que faz isso funcionar:
--     message_id IS NULL  → anexo do card (arrastado na grade de anexos)
--     message_id NOT NULL → foto/arquivo mandado dentro do chat
--   A grade de anexos lê os dois; a linha do tempo mostra o segundo como bolha.
--   Nenhuma duplicação de tabela, nenhuma escolha pro usuário fazer.
--
-- BUCKET PRIVADO, NÃO PÚBLICO
--   `proposal-media` (20260803123000) é público de propósito, porque alimenta a
--   página pública da proposta e o gerador de PDF sem sessão. Aqui não existe
--   essa necessidade, e foto de obra de cliente não deve ficar aberta por URL.
--   O desenho seguido é o de `andamento-obra` (20260504200000): bucket privado
--   + URL assinada na leitura (`useSignedUrlWithFallback` já existe no front).
--
-- UPLOAD NÃO PASSA POR SERVER ACTION
--   Server Action na Vercel tem teto de ~4.5 MB de body — foto de celular
--   estoura sozinha. O browser sobe direto pro Storage (com barra de progresso)
--   e só depois uma Server Action registra a linha aqui. É por isso que as
--   policies de storage.objects abaixo precisam existir para `authenticated`,
--   em vez de tudo fluir por service role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. task_attachments
-- -----------------------------------------------------------------------------
CREATE TABLE public.task_attachments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  org_id       UUID        NOT NULL DEFAULT public.current_org_id(),
  -- NULL = anexo do card; preenchido = veio dentro de uma mensagem do chat.
  message_id   UUID        NULL REFERENCES public.task_messages(id) ON DELETE CASCADE,
  uploaded_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),

  storage_path TEXT        NOT NULL CHECK (length(btrim(storage_path)) > 0),
  file_name    TEXT        NOT NULL CHECK (length(btrim(file_name)) > 0),
  mime_type    TEXT        NULL,
  file_size    BIGINT      NULL,
  -- Só para imagem: evita o pulo de layout da grade enquanto a miniatura
  -- carrega (o `<img>` já nasce com a proporção certa reservada).
  width        INT         NULL,
  height       INT         NULL,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_attachments IS
  'Arquivos de um card da esteira. message_id NULL = anexo do card; '
  'preenchido = mandado dentro do chat. As duas portas caem na mesma grade.';

COMMENT ON COLUMN public.task_attachments.storage_path IS
  'Caminho no bucket privado `tarefas`, no formato {org_id}/{task_id}/{uuid}-{nome}. '
  'O primeiro segmento é o que as policies de storage.objects conferem.';

CREATE INDEX idx_task_attachments_task
  ON public.task_attachments (task_id, created_at DESC);

CREATE INDEX idx_task_attachments_message
  ON public.task_attachments (message_id)
  WHERE message_id IS NOT NULL;

-- Anexo novo conta como atividade: o card sobe na ordenação e a esteira sabe
-- que algo aconteceu ali.
CREATE OR REPLACE FUNCTION public.task_attachments_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tasks SET last_activity_at = now() WHERE id = NEW.task_id;

  INSERT INTO public.task_followers (task_id, user_id, org_id, reason)
  VALUES (NEW.task_id, NEW.uploaded_by, NEW.org_id, 'comentou')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.task_attachments_after_insert()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_task_attachment_after_insert ON public.task_attachments;
CREATE TRIGGER trg_task_attachment_after_insert
  AFTER INSERT ON public.task_attachments
  FOR EACH ROW EXECUTE FUNCTION public.task_attachments_after_insert();

-- -----------------------------------------------------------------------------
-- 2. RLS — task_attachments
--    Mesmo alcance da task e do chat: org-wide na leitura.
--    DELETE só de quem subiu — apagar arquivo de colega não é operação de rotina.
--    Sem UPDATE: anexo é criado e removido, nunca editado.
-- -----------------------------------------------------------------------------
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_attachments_select" ON public.task_attachments;
CREATE POLICY "task_attachments_select" ON public.task_attachments
  FOR SELECT
  TO authenticated
  USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "task_attachments_insert" ON public.task_attachments;
CREATE POLICY "task_attachments_insert" ON public.task_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND auth.uid() = uploaded_by
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_attachments.task_id
        AND t.org_id = (SELECT public.current_org_id())
    )
  );

DROP POLICY IF EXISTS "task_attachments_delete" ON public.task_attachments;
CREATE POLICY "task_attachments_delete" ON public.task_attachments
  FOR DELETE
  TO authenticated
  USING (
    org_id = (SELECT public.current_org_id())
    AND uploaded_by = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- 3. Storage — bucket privado `tarefas`
--
--    Path: {org_id}/{task_id}/{uuid}-{nome}
--    O primeiro segmento ser o org_id (e não o user_id, como em
--    `proposal-media`) é deliberado: o arquivo é da EMPRESA, não de quem
--    subiu. Colega precisa baixar o que o outro anexou — é o ponto da camada
--    de org. Por isso a conferência é `current_org_id()`, não `auth.uid()`.
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('tarefas', 'tarefas', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "tarefas_storage_select" ON storage.objects;
CREATE POLICY "tarefas_storage_select" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'tarefas'
    AND (storage.foldername(name))[1] = (SELECT public.current_org_id())::text
  );

DROP POLICY IF EXISTS "tarefas_storage_insert" ON storage.objects;
CREATE POLICY "tarefas_storage_insert" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'tarefas'
    AND (storage.foldername(name))[1] = (SELECT public.current_org_id())::text
  );

DROP POLICY IF EXISTS "tarefas_storage_delete" ON storage.objects;
CREATE POLICY "tarefas_storage_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'tarefas'
    AND (storage.foldername(name))[1] = (SELECT public.current_org_id())::text
  );

-- Sem policy de UPDATE: o caminho carrega um uuid próprio a cada upload, então
-- sobrescrever objeto existente não é operação do módulo.

-- -----------------------------------------------------------------------------
-- 4. Realtime — anexo aparece na hora pra quem está com o card aberto.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.task_attachments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
