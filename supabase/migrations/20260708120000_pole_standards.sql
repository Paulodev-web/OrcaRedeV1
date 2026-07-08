-- =============================================================================
-- Padrões de Poste (grupo de grupos de itens):
-- Um "padrão de poste" agrupa um tipo de poste opcional + N grupos de itens
-- (cada um com um multiplicador de quantidade) + materiais avulsos, permitindo
-- aplicar de uma vez toda a composição padrão de uma concessionária a um poste
-- novo — igual a como item_group_templates agrupa materiais.
-- =============================================================================

CREATE TABLE public.pole_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  company_id uuid NOT NULL REFERENCES public.utility_companies(id) ON DELETE CASCADE,
  post_type_id uuid REFERENCES public.post_types(id) ON DELETE SET NULL,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pole_standards_company_id_idx ON public.pole_standards(company_id);
CREATE INDEX pole_standards_user_id_idx ON public.pole_standards(user_id);

CREATE TABLE public.pole_standard_groups (
  pole_standard_id uuid NOT NULL REFERENCES public.pole_standards(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.item_group_templates(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  PRIMARY KEY (pole_standard_id, template_id)
);

CREATE TABLE public.pole_standard_materials (
  pole_standard_id uuid NOT NULL REFERENCES public.pole_standards(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  PRIMARY KEY (pole_standard_id, material_id)
);

ALTER TABLE public.pole_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pole_standard_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pole_standard_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pole standards" ON public.pole_standards
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own pole standards" ON public.pole_standards
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pole standards" ON public.pole_standards
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own pole standards" ON public.pole_standards
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own pole standard groups" ON public.pole_standard_groups
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.pole_standards ps WHERE ps.id = pole_standard_groups.pole_standard_id AND ps.user_id = auth.uid())
  );
CREATE POLICY "Users can insert own pole standard groups" ON public.pole_standard_groups
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.pole_standards ps WHERE ps.id = pole_standard_groups.pole_standard_id AND ps.user_id = auth.uid())
  );
CREATE POLICY "Users can update own pole standard groups" ON public.pole_standard_groups
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.pole_standards ps WHERE ps.id = pole_standard_groups.pole_standard_id AND ps.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.pole_standards ps WHERE ps.id = pole_standard_groups.pole_standard_id AND ps.user_id = auth.uid())
  );
CREATE POLICY "Users can delete own pole standard groups" ON public.pole_standard_groups
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.pole_standards ps WHERE ps.id = pole_standard_groups.pole_standard_id AND ps.user_id = auth.uid())
  );

CREATE POLICY "Users can view own pole standard materials" ON public.pole_standard_materials
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.pole_standards ps WHERE ps.id = pole_standard_materials.pole_standard_id AND ps.user_id = auth.uid())
  );
CREATE POLICY "Users can insert own pole standard materials" ON public.pole_standard_materials
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.pole_standards ps WHERE ps.id = pole_standard_materials.pole_standard_id AND ps.user_id = auth.uid())
  );
CREATE POLICY "Users can update own pole standard materials" ON public.pole_standard_materials
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.pole_standards ps WHERE ps.id = pole_standard_materials.pole_standard_id AND ps.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.pole_standards ps WHERE ps.id = pole_standard_materials.pole_standard_id AND ps.user_id = auth.uid())
  );
CREATE POLICY "Users can delete own pole standard materials" ON public.pole_standard_materials
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.pole_standards ps WHERE ps.id = pole_standard_materials.pole_standard_id AND ps.user_id = auth.uid())
  );
