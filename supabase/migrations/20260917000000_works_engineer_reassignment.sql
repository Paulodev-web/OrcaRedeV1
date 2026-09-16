-- Permite trocar o engenheiro responsável por uma obra (works.engineer_id).
-- Até aqui esse campo era gravado uma vez em createWork() e nunca mudava:
-- updateWork() nem aceitava o campo, e a policy works_update trava a troca
-- vinda do cliente (WITH CHECK auth.uid() = engineer_id — a linha só passa
-- se o novo dono for quem está autenticado). A troca real acontece via
-- reassignWorkEngineerAction() (src/app/configuracoes/_actions/organization.ts),
-- gate ensureOrgAdmin() + service-role client, o mesmo padrão de
-- setMemberFieldAccessAction/updateWorkManagerAction já usado nesse arquivo.
--
-- Este trigger espelha sync_work_manager (20260504140000, bloco 6): mantém
-- work_members em sincronia quando engineer_id muda, senão a obra some do
-- work_members_select da RLS pro dono antigo mas nunca aparece pro novo.
CREATE OR REPLACE FUNCTION public.sync_work_engineer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF OLD.engineer_id IS DISTINCT FROM NEW.engineer_id THEN
    DELETE FROM public.work_members
     WHERE work_id = NEW.id
       AND user_id = OLD.engineer_id
       AND role = 'engineer';

    -- org_id explícito pelo mesmo motivo de 20260916130000_fix_seed_work_defaults_org_id:
    -- a escrita vem do service-role client (sem JWT de usuário), e a coluna é
    -- NOT NULL DEFAULT current_org_id(), que depende de auth.uid().
    INSERT INTO public.work_members (work_id, user_id, role, org_id)
    VALUES (NEW.id, NEW.engineer_id, 'engineer', NEW.org_id)
    ON CONFLICT (work_id, user_id) DO UPDATE SET role = 'engineer';

    INSERT INTO public.notifications (user_id, work_id, kind, title, body, link_path)
    VALUES (
      NEW.engineer_id,
      NEW.id,
      'work_created',
      'Obra atribuída a você: ' || NEW.name,
      'Você passou a ser o engenheiro responsável pela obra "' || NEW.name || '".',
      '/tools/andamento-obra/obras/' || NEW.id::text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_work_engineer ON public.works;
CREATE TRIGGER trg_sync_work_engineer
  AFTER UPDATE OF engineer_id ON public.works
  FOR EACH ROW EXECUTE FUNCTION public.sync_work_engineer();
