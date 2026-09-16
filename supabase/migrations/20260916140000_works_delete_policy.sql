-- works tinha policy de INSERT/SELECT/UPDATE mas nenhuma de DELETE. Com RLS
-- ligado (relrowsecurity=true) e sem policy, todo DELETE simplesmente não
-- casa nenhuma linha — sem erro, sem efeito. O botão "Excluir obra"
-- (deleteWork em src/actions/works.ts) parecia funcionar (toast de sucesso)
-- mas não apagava nada.
--
-- Mesma regra do works_insert: só o engenheiro dono da obra, dentro da sua
-- org ativa, pode apagar.
CREATE POLICY works_delete ON public.works
  FOR DELETE
  USING (org_id = (SELECT public.current_org_id()) AND auth.uid() = engineer_id);
