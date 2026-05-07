-- =============================================================================
-- Simulate Manager Checklist Completion (Bloco 8)
--
-- Pre-requisitos:
--   - Engineer com template e checklist atribuido a uma obra
--   - Manager da obra (work_members.role = 'manager')
--
-- Uso:
--   1. Substitua os UUIDs abaixo pelos seus valores reais
--   2. Execute bloco a bloco no SQL Editor do Supabase
-- =============================================================================

-- Variaveis (substitua)
-- :manager_id   = UUID do manager
-- :work_id      = UUID da obra
-- :checklist_id = UUID do work_checklists atribuido

-- 1. Verificar items do checklist
SELECT id, order_index, label, requires_photo, is_completed
FROM public.work_checklist_items
WHERE work_checklist_id = ':checklist_id'
ORDER BY order_index;

-- 2. Manager marca checklist como in_progress (pending -> in_progress)
UPDATE public.work_checklists
SET status = 'in_progress'
WHERE id = ':checklist_id'
  AND status = 'pending';

-- 3. Manager marca items 1 a 4 (com idempotencia via client_event_id)
-- Item 1
UPDATE public.work_checklist_items
SET is_completed = true,
    completed_at = now(),
    completed_by = ':manager_id',
    client_event_id = gen_random_uuid()
WHERE work_checklist_id = ':checklist_id'
  AND order_index = 0
  AND is_completed = false;

-- Item 2
UPDATE public.work_checklist_items
SET is_completed = true,
    completed_at = now(),
    completed_by = ':manager_id',
    client_event_id = gen_random_uuid()
WHERE work_checklist_id = ':checklist_id'
  AND order_index = 1
  AND is_completed = false;

-- Item 3
UPDATE public.work_checklist_items
SET is_completed = true,
    completed_at = now(),
    completed_by = ':manager_id',
    client_event_id = gen_random_uuid()
WHERE work_checklist_id = ':checklist_id'
  AND order_index = 2
  AND is_completed = false;

-- Item 4
UPDATE public.work_checklist_items
SET is_completed = true,
    completed_at = now(),
    completed_by = ':manager_id',
    client_event_id = gen_random_uuid()
WHERE work_checklist_id = ':checklist_id'
  AND order_index = 3
  AND is_completed = false;

-- 4. Verificar status: deve ser in_progress (falta item 5)
SELECT status FROM public.work_checklists WHERE id = ':checklist_id';

-- 5. Marcar ultimo item (item 5) -> trigger auto-completion
UPDATE public.work_checklist_items
SET is_completed = true,
    completed_at = now(),
    completed_by = ':manager_id',
    client_event_id = gen_random_uuid()
WHERE work_checklist_id = ':checklist_id'
  AND order_index = 4
  AND is_completed = false;

-- 6. Verificar: status deve ser awaiting_validation
SELECT status FROM public.work_checklists WHERE id = ':checklist_id';
-- Esperado: awaiting_validation

-- 7. Verificar notificacao para engineer
SELECT * FROM public.notifications
WHERE work_id = ':work_id'
  AND kind = 'checklist_completed'
ORDER BY created_at DESC
LIMIT 1;
