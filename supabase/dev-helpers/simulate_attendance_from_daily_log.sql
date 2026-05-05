-- =============================================================================
-- Simulate Attendance from Daily Log (Bloco 8)
--
-- Pre-requisitos:
--   - Obra com diarios (Bloco 6)
--   - Crew members cadastrados e pelo menos 2-3 alocados na obra (work_team)
--   - Diario com status 'pending_approval'
--
-- Uso:
--   1. Substitua os UUIDs abaixo pelos seus valores reais
--   2. Execute bloco a bloco no SQL Editor do Supabase
-- =============================================================================

-- Variaveis (substitua)
-- :work_id       = UUID da obra
-- :daily_log_id  = UUID de um diario pending_approval
-- :crew_id_1     = UUID do crew_member alocado
-- :crew_id_2     = UUID do crew_member alocado
-- :crew_id_3     = UUID do crew_member NAO alocado (para testar warning)

-- 1. Verificar equipe alocada
SELECT wt.crew_member_id, cm.full_name, wt.role_in_work
FROM public.work_team wt
JOIN public.crew_members cm ON cm.id = wt.crew_member_id
WHERE wt.work_id = ':work_id'
  AND wt.deallocated_at IS NULL;

-- 2. Verificar diario pendente e sua revisao
SELECT dl.id, dl.log_date, dl.status, dlr.crew_present
FROM public.work_daily_logs dl
JOIN public.work_daily_log_revisions dlr ON dlr.id = dl.current_revision_id
WHERE dl.id = ':daily_log_id';

-- 3. Garantir que crew_present tem os 3 membros (2 alocados + 1 nao alocado)
-- Se a revisao nao tem crew_present, atualizar:
UPDATE public.work_daily_log_revisions
SET crew_present = '["':crew_id_1'", "':crew_id_2'", "':crew_id_3'"]'::jsonb
WHERE id = (SELECT current_revision_id FROM public.work_daily_logs WHERE id = ':daily_log_id');

-- 4. Aprovar o diario (status: pending_approval -> approved)
-- Trigger on_daily_log_approved_attendance vai disparar
UPDATE public.work_daily_logs
SET status = 'approved'
WHERE id = ':daily_log_id'
  AND status = 'pending_approval';

-- 5. Verificar work_team_attendance populada
SELECT wta.crew_member_id, cm.full_name, wta.attendance_date, wta.daily_log_id
FROM public.work_team_attendance wta
JOIN public.crew_members cm ON cm.id = wta.crew_member_id
WHERE wta.work_id = ':work_id'
ORDER BY wta.attendance_date DESC, cm.full_name;

-- Esperado: 3 linhas (2 alocados + 1 nao alocado)
-- O nao alocado aparece com warning visual na UI

-- 6. Verificar idempotencia: re-aprovar nao duplica
-- (na pratica o status ja e 'approved', ON CONFLICT DO NOTHING protege)
SELECT count(*) FROM public.work_team_attendance WHERE work_id = ':work_id';

-- 7. Verificar que crew nao alocado esta registrado
SELECT EXISTS (
  SELECT 1 FROM public.work_team_attendance
  WHERE work_id = ':work_id'
    AND crew_member_id = ':crew_id_3'
) AS nao_alocado_registrado;
-- Esperado: true
