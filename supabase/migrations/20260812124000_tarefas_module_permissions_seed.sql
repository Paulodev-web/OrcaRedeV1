-- =============================================================================
-- Semeia module_permissions para o módulo 'tarefas'
--
-- Desde 20260811130000_module_permission_enforcement.sql, ausência de linha =
-- sem acesso. Sem este seed, a Esteira de Trabalho nasceria invisível pra todo
-- mundo — inclusive pra quem pediu o módulo. Mesmo racional e mesmo formato do
-- seed original: acesso total a todo org_members ativo, granted_by NULL
-- (baseline de rollout, não concessão de admin).
-- =============================================================================
INSERT INTO public.module_permissions (user_id, org_id, module_key, can_view, can_edit, granted_by)
SELECT m.user_id, m.org_id, 'tarefas', true, true, NULL
FROM public.org_members m
WHERE m.is_active
ON CONFLICT (user_id, module_key) DO NOTHING;
