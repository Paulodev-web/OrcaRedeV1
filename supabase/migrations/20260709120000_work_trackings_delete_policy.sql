-- work_trackings tinha policies de SELECT/INSERT/UPDATE mas nenhuma de DELETE,
-- então deleteWorkTrackingAction apagava tracked_posts/post_connections mas o
-- DELETE em work_trackings era silenciosamente bloqueado pelo RLS (0 linhas
-- afetadas, sem erro) e a obra reaparecia ao recarregar a página.

create policy "Users can delete own work trackings"
on public.work_trackings
for delete
to public
using (
  budget_id in (
    select budgets.id from budgets where budgets.user_id = auth.uid()
  )
);
