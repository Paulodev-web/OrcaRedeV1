-- Custo base + itens extras + margem (precificação)
alter table public.budgets
  add column if not exists profit_margin_percent numeric(10,4) not null default 0,
  add column if not exists extra_cost_items jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'budgets' and c.conname = 'budgets_profit_margin_non_negative'
  ) then
    alter table public.budgets
      add constraint budgets_profit_margin_non_negative
      check (profit_margin_percent >= 0);
  end if;
end$$;

comment on column public.budgets.profit_margin_percent is 'Margem de lucro em percentual (0 = nenhuma)';
comment on column public.budgets.extra_cost_items is 'JSON: array de { id, description, value }';
