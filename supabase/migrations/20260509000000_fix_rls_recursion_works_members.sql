-- ============================================================================
-- Fix: Recursão infinita em work_members_select policy
-- Causa: policy work_members_select faz EXISTS em work_members, criando
--        auto-recursão quando o curto-circuito do OR não funciona.
-- Solução: função SECURITY DEFINER STABLE que checa membership sem reaplicar RLS.
-- ============================================================================

-- 1. Função helper (SECURITY DEFINER bypassa RLS internamente)
CREATE OR REPLACE FUNCTION public.is_work_member(_work_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.work_members
    WHERE work_id = _work_id 
      AND user_id = _user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_work_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_work_member(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.is_work_member(uuid, uuid) IS 
  'Helper SECURITY DEFINER para policies RLS. Quebra ciclo de recursão em work_members.';

-- 2. Recriar policy works_select usando a função
DROP POLICY IF EXISTS works_select ON public.works;
CREATE POLICY works_select ON public.works FOR SELECT 
USING (
  auth.uid() = engineer_id 
  OR public.is_work_member(id, auth.uid())
);

-- 3. Recriar policy work_members_select usando a função
DROP POLICY IF EXISTS work_members_select ON public.work_members;
CREATE POLICY work_members_select ON public.work_members FOR SELECT 
USING (
  auth.uid() = user_id 
  OR public.is_work_member(work_id, auth.uid())
);
