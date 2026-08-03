-- =============================================================================
-- PERMISSÃO POR MÓDULO — camada nova, sem tocar profiles.role
--
-- PROPÓSITO
--   Tela /configuracoes/usuarios (Escopo §6.4). Controla quais módulos do
--   sistema web cada usuário enxerga e edita.
--
-- POR QUE UMA TABELA NOVA E NÃO UM CAMPO EM profiles (Regra Inviolável §3.3)
--   O APK Android fala direto com o Supabase e valida `profiles.role = 'manager'`
--   (docs/apk-contracts/01-authentication.md). Mexer no CHECK de `role`, ou
--   sobrecarregar a coluna com papéis novos, quebraria o app em produção sem
--   passar pelo Next. Esta tabela é ortogonal: o APK a ignora por completo,
--   e `profiles.role` continua com exatamente os mesmos dois valores.
--
-- DEFAULT NA AUSÊNCIA DE LINHA
--   Ausência de linha NÃO significa "sem acesso". Significa "usa o default da
--   aplicação para o papel". Esta tabela guarda apenas o que foi decidido
--   explicitamente, para que ligar a feature não tranque ninguém para fora de
--   um sistema que já está em produção. A regra de fallback vive na aplicação.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper — quem criou o perfil do usuário alvo
--    SECURITY DEFINER para não depender do RLS de `profiles` dentro da policy
--    (mesmo motivo de public.is_work_member em 20260509000000).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_profile_creator(_target_user UUID, _actor UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _target_user
      AND p.created_by = _actor
      AND _actor IS NOT NULL
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_profile_creator(UUID, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_profile_creator(UUID, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_profile_creator(UUID, UUID) IS
  'Helper SECURITY DEFINER para policies RLS: _actor criou o perfil de _target_user.';

-- -----------------------------------------------------------------------------
-- 2. module_permissions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.module_permissions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key  TEXT        NOT NULL,
  can_view    BOOLEAN     NOT NULL DEFAULT true,
  can_edit    BOOLEAN     NOT NULL DEFAULT false,
  granted_by  UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT module_permissions_module_not_blank CHECK (length(btrim(module_key)) > 0),
  CONSTRAINT module_permissions_edit_requires_view CHECK (can_edit = false OR can_view = true),
  CONSTRAINT module_permissions_user_module_key UNIQUE (user_id, module_key)
);

COMMENT ON TABLE public.module_permissions IS
  'Permissão explícita por módulo. Camada nova, ortogonal a profiles.role — o '
  'APK não lê esta tabela. Ausência de linha = default da aplicação para o papel.';

COMMENT ON COLUMN public.module_permissions.module_key IS
  'Valores canônicos: orcamentos, precificacao, suprimentos, andamento-obra, '
  'portal-engenheiro, propostas, configuracoes. Sem CHECK: módulo novo não deve '
  'exigir migration. Mesma convenção de notifications.module_key e '
  'user_module_seen.module_key.';

CREATE INDEX IF NOT EXISTS idx_module_permissions_user
  ON public.module_permissions (user_id, module_key);

CREATE INDEX IF NOT EXISTS idx_module_permissions_granted_by
  ON public.module_permissions (granted_by)
  WHERE granted_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.update_module_permissions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_module_permissions_updated_at ON public.module_permissions;
CREATE TRIGGER trg_module_permissions_updated_at
  BEFORE UPDATE ON public.module_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_module_permissions_updated_at();

-- -----------------------------------------------------------------------------
-- 2.1 RLS — module_permissions
--     SELECT: o próprio usuário lê as suas; quem criou o perfil lê as dele.
--     Escrita: SOMENTE quem criou o perfil. Ninguém edita a própria permissão —
--     é o que impede escalada de privilégio pela API do Supabase.
-- -----------------------------------------------------------------------------
ALTER TABLE public.module_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "module_permissions_select" ON public.module_permissions;
CREATE POLICY "module_permissions_select" ON public.module_permissions
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_profile_creator(user_id, auth.uid())
  );

DROP POLICY IF EXISTS "module_permissions_insert" ON public.module_permissions;
CREATE POLICY "module_permissions_insert" ON public.module_permissions
  FOR INSERT
  WITH CHECK (
    public.is_profile_creator(user_id, auth.uid())
    AND granted_by = auth.uid()
  );

DROP POLICY IF EXISTS "module_permissions_update" ON public.module_permissions;
CREATE POLICY "module_permissions_update" ON public.module_permissions
  FOR UPDATE
  USING (public.is_profile_creator(user_id, auth.uid()))
  WITH CHECK (
    public.is_profile_creator(user_id, auth.uid())
    AND granted_by = auth.uid()
  );

DROP POLICY IF EXISTS "module_permissions_delete" ON public.module_permissions;
CREATE POLICY "module_permissions_delete" ON public.module_permissions
  FOR DELETE
  USING (public.is_profile_creator(user_id, auth.uid()));
