-- Performance indexes for Engineer Portal dashboard loading.
create index if not exists idx_work_trackings_updated_at
  on public.work_trackings (updated_at desc);

create index if not exists idx_work_trackings_budget_id
  on public.work_trackings (budget_id);

create index if not exists idx_tracked_posts_tracking_id_name
  on public.tracked_posts (tracking_id, name);

create index if not exists idx_post_connections_tracking_id
  on public.post_connections (tracking_id);
