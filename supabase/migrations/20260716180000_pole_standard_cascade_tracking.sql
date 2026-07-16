-- =============================================================================
-- Rastreia qual padrão de poste (se algum) originou cada poste de orçamento e
-- cada grupo/material avulso aplicado a ele. Isso permite que uma edição no
-- padrão (grupos, materiais avulsos ou tipo de poste) seja propagada em cascata
-- para todos os orçamentos onde esse padrão já foi aplicado, sem apagar itens
-- que o usuário tenha adicionado manualmente depois (esses ficam com
-- pole_standard_id NULL e não são tocados pela cascata).
-- =============================================================================

ALTER TABLE public.budget_posts
  ADD COLUMN pole_standard_id uuid REFERENCES public.pole_standards(id) ON DELETE SET NULL;

ALTER TABLE public.post_materials
  ADD COLUMN pole_standard_id uuid REFERENCES public.pole_standards(id) ON DELETE SET NULL;

ALTER TABLE public.post_item_groups
  ADD COLUMN pole_standard_id uuid REFERENCES public.pole_standards(id) ON DELETE SET NULL;

CREATE INDEX budget_posts_pole_standard_id_idx ON public.budget_posts(pole_standard_id);
CREATE INDEX post_materials_pole_standard_id_idx ON public.post_materials(pole_standard_id);
CREATE INDEX post_item_groups_pole_standard_id_idx ON public.post_item_groups(pole_standard_id);
