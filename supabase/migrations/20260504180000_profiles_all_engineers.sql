-- =============================================================================
-- Define role 'engineer' em todos os perfis (e alinha work_members).
-- Executa como postgres: auth.uid() é NULL, então o trigger de imutabilidade
-- em profiles não força OLD.role de volta.
-- =============================================================================

UPDATE public.profiles
SET
  role = 'engineer',
  created_by = NULL,
  updated_at = now();

UPDATE public.work_members
SET role = 'engineer'
WHERE role = 'manager';
