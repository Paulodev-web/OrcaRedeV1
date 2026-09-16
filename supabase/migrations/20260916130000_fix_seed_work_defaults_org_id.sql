-- seed_work_defaults() insere em work_members sem org_id explícito. A coluna
-- é NOT NULL DEFAULT current_org_id(), e current_org_id() depende de
-- auth.uid() — que é NULL quando a obra nasce via createWorkFromBudget
-- (insert feito com o client service_role, sem JWT de usuário). Resultado:
-- "null value in column org_id of relation work_members violates not-null
-- constraint" toda vez que se importa um orçamento.
--
-- Corrige passando org_id = NEW.org_id (a obra já nasce com org_id correto,
-- resolvido pela app antes do insert em works). Mesmo padrão já usado em
-- tasks_sync_followers()/task_events, que passam NEW.org_id explicitamente
-- em vez de depender do DEFAULT.
CREATE OR REPLACE FUNCTION public.seed_work_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  INSERT INTO public.work_milestones (work_id, code, name, order_index) VALUES
    (NEW.id, 'survey',        'Locação',           1),
    (NEW.id, 'poles',         'Postes instalados', 2),
    (NEW.id, 'cabling_lv',    'Cabeamento BT',     3),
    (NEW.id, 'cabling_mv',    'Cabeamento MT',     4),
    (NEW.id, 'energization',  'Energização',       5),
    (NEW.id, 'commissioning', 'Comissionamento',   6);

  INSERT INTO public.work_members (work_id, user_id, role, org_id)
  VALUES (NEW.id, NEW.engineer_id, 'engineer', NEW.org_id)
  ON CONFLICT (work_id, user_id) DO NOTHING;

  IF NEW.manager_id IS NOT NULL THEN
    INSERT INTO public.work_members (work_id, user_id, role, org_id)
    VALUES (NEW.id, NEW.manager_id, 'manager', NEW.org_id)
    ON CONFLICT (work_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  INSERT INTO public.notifications (user_id, work_id, kind, title, body, link_path)
  VALUES (
    NEW.engineer_id,
    NEW.id,
    'work_created',
    'Obra criada: ' || NEW.name,
    'Você criou a obra "' || NEW.name || '".',
    '/tools/andamento-obra/obras/' || NEW.id::text
  );

  RETURN NEW;
END;
$function$;
