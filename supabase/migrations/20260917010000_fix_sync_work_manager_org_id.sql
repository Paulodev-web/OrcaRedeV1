-- sync_work_manager() insere em work_members sem org_id explícito, contando
-- com o DEFAULT current_org_id() — que depende de auth.uid(). Isso nunca deu
-- erro porque toda troca de manager_id passava por updateWork()
-- (src/actions/works.ts), que escreve com o client autenticado do próprio
-- usuário (auth.uid() presente).
--
-- reassignWorkManagerAction (aba "Responsável", org admin) trocou isso: passou
-- a escrever manager_id via service-role client (sem JWT de usuário) depois do
-- gate de permissão — mesmo padrão de reassignWorkEngineerAction. Sem auth.uid(),
-- current_org_id() retorna NULL e o INSERT trava em "null value in column
-- org_id of relation work_members violates not-null constraint".
--
-- Mesma correção já aplicada em seed_work_defaults() por
-- 20260916130000_fix_seed_work_defaults_org_id.sql: passar org_id = NEW.org_id
-- explicitamente em vez de depender do DEFAULT.
CREATE OR REPLACE FUNCTION public.sync_work_manager()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF OLD.manager_id IS DISTINCT FROM NEW.manager_id THEN
    IF OLD.manager_id IS NOT NULL THEN
      DELETE FROM public.work_members
       WHERE work_id = NEW.id
         AND user_id = OLD.manager_id
         AND role = 'manager';
    END IF;

    IF NEW.manager_id IS NOT NULL THEN
      INSERT INTO public.work_members (work_id, user_id, role, org_id)
      VALUES (NEW.id, NEW.manager_id, 'manager', NEW.org_id)
      ON CONFLICT (work_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
