-- =============================================================================
-- Gerentes de obra entram na organização
--
-- O cadastro de gerente saiu de Andamento de Obra → Pessoas e passou a ser o
-- mesmo "Cadastrar pessoa" de Configurações → Organização e equipe. Quem foi
-- criado pelo caminho antigo tem `profiles.role = 'manager'` mas nenhuma linha
-- em `org_members` — e a tela nova lista membros da organização, não perfis.
-- Sem este backfill, gerente já existente simplesmente não apareceria em lugar
-- nenhum, apesar de continuar entrando no APK.
--
-- A organização é a do `created_by` (o engenheiro que o cadastrou), que é o
-- mesmo escopo que `ensureManagerBelongsToEngineer` já usava para deixá-lo ser
-- escolhido no campo "Gerente" da obra.
--
-- Entra como `member` e setor `execucao`: gerente não administra organização, e
-- o setor é o que o Quadro de Trabalho usa para rotear.
-- =============================================================================

INSERT INTO public.org_members (org_id, user_id, role, sector, is_active, invited_by)
SELECT
  creator_org.org_id,
  m.id,
  'member',
  'execucao',
  COALESCE(m.is_active, TRUE),
  m.created_by
FROM public.profiles m
CROSS JOIN LATERAL (
  -- A org ativa do criador, com a associação dele como plano B: um engenheiro
  -- sem `active_org_id` preenchido ainda tem vínculo de onde tirar a resposta.
  SELECT COALESCE(
    (SELECT c.active_org_id FROM public.profiles c WHERE c.id = m.created_by),
    (SELECT om.org_id
       FROM public.org_members om
      WHERE om.user_id = m.created_by AND om.is_active
      ORDER BY om.created_at
      LIMIT 1)
  ) AS org_id
) AS creator_org
WHERE m.role = 'manager'
  AND m.created_by IS NOT NULL
  AND creator_org.org_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.org_members om WHERE om.user_id = m.id
  );
