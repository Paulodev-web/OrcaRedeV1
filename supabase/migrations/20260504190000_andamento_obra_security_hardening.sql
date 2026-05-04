-- =============================================================================
-- Hardening de segurança para funções dos Blocos 1 e 2.
-- 1) Define search_path imutável em trigger functions (lint 0011).
-- 2) Revoga EXECUTE de SECURITY DEFINER trigger functions para anon/authenticated/public
--    (lints 0028 e 0029): essas funções nunca devem ser chamadas via PostgREST RPC.
-- =============================================================================

ALTER FUNCTION public.update_profiles_updated_at()
  SET search_path = public, auth;

ALTER FUNCTION public.profiles_enforce_immutable_columns()
  SET search_path = public, auth;

ALTER FUNCTION public.update_crew_members_updated_at()
  SET search_path = public, auth;

ALTER FUNCTION public.update_works_updated_at()
  SET search_path = public, auth;

ALTER FUNCTION public.update_work_milestones_updated_at()
  SET search_path = public, auth;

-- Revogar EXECUTE de funções SECURITY DEFINER que são apenas trigger handlers.
-- Triggers continuam funcionando porque são chamados pelo próprio Postgres
-- com privilégios do dono da função, não via GRANT EXECUTE para roles.
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_work_defaults()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_work_manager()    FROM PUBLIC, anon, authenticated;
