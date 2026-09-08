-- Suprimentos: consolidação do BOM feita no banco, não no Node.
--
-- Antes, todo caminho que precisava da lista de materiais de um orçamento
-- (abrir Conciliação, abrir Cenários, e pior, CADA vínculo manual salvo)
-- carregava budget_posts com post_item_groups, post_item_group_materials,
-- post_materials e materials aninhados, e agregava em JavaScript. No maior
-- orçamento da base isso são 7.623 linhas e ~1,4 MB de dados brutos para
-- produzir uma lista de 100 materiais.
--
-- Paridade com consolidateMaterialsFromBudgetDetails
-- (src/services/budgetMaterialAggregation.ts):
--   quantidade   = soma de grupos + avulsos
--   preço unit.  = primeiro registro encontrado
--   grupo cai para materials.price quando price_at_addition é nulo ou zero;
--   avulso não cai (fica 0), assimetria que existe no JS e foi preservada.
--
-- Diferença deliberada: no JS o "primeiro registro" dependia da ordem em que o
-- PostgREST devolvia grupos e materiais, que não é determinística (nenhum
-- order by cobre os níveis aninhados). Em 245 de 7.981 pares orçamento/material
-- o mesmo material aparece com price_at_addition diferente em postes
-- diferentes, e nesses casos o preço exibido era sorteio. Aqui a regra é fixa:
-- menor counter de poste, grupo antes de avulso.
create or replace function public.budget_consolidated_materials(p_budget_id uuid)
returns table (
  material_id uuid,
  code text,
  name text,
  unit text,
  required_qty numeric,
  unit_price numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with linhas as (
    select bp.counter, 0 as fonte, pigm.material_id, pigm.quantity as qty,
           coalesce(nullif(pigm.price_at_addition, 0), m.price, 0) as preco
    from budget_posts bp
    join post_item_groups pig on pig.budget_post_id = bp.id
    join post_item_group_materials pigm on pigm.post_item_group_id = pig.id
    join materials m on m.id = pigm.material_id
    where bp.budget_id = p_budget_id
    union all
    select bp.counter, 1, pm.material_id, pm.quantity,
           coalesce(nullif(pm.price_at_addition, 0), 0)
    from budget_posts bp
    join post_materials pm on pm.post_id = bp.id
    where bp.budget_id = p_budget_id
  )
  select l.material_id, m.code, m.name, m.unit,
         sum(l.qty)::numeric as required_qty,
         (array_agg(l.preco order by l.counter, l.fonte))[1] as unit_price
  from linhas l
  join materials m on m.id = l.material_id
  group by l.material_id, m.code, m.name, m.unit;
$$;

-- Substitui o "carrega o BOM inteiro para responder sim ou não" que rodava a
-- cada save de vínculo manual em assertMaterialInBudgetScope.
create or replace function public.is_material_in_budget(p_budget_id uuid, p_material_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from budget_posts bp
    join post_item_groups pig on pig.budget_post_id = bp.id
    join post_item_group_materials pigm on pigm.post_item_group_id = pig.id
    where bp.budget_id = p_budget_id and pigm.material_id = p_material_id
  ) or exists (
    select 1
    from budget_posts bp
    join post_materials pm on pm.post_id = bp.id
    where bp.budget_id = p_budget_id and pm.material_id = p_material_id
  );
$$;

-- security invoker de propósito: a RLS de budget_posts / materials continua
-- valendo, ninguém enxerga orçamento de outra organização por dentro da função.
grant execute on function public.budget_consolidated_materials(uuid) to authenticated;
grant execute on function public.is_material_in_budget(uuid, uuid) to authenticated;

-- O planner vinha caindo em Seq Scan em post_materials apesar do índice por
-- post_id existir: estatística velha.
analyze post_materials;
analyze post_item_group_materials;
