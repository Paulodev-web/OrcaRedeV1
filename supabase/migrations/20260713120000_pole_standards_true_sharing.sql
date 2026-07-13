-- =============================================================================
-- Padrões de Poste: compartilhamento real entre concessionárias.
--
-- O modelo anterior "compartilhava" um padrão de poste criando uma linha
-- independente de pole_standards por concessionária selecionada (mesmo nome,
-- ids diferentes). Isso causava: duplicação sem fim a cada edição, a tela de
-- edição não sabia quais outras concessionárias tinham cópias, e os grupos de
-- itens copiados apontavam para item_group_templates de OUTRA concessionária
-- (template_id não pertencia à concessionária da cópia), quebrando a exibição
-- e sofrendo cascade delete quando o grupo original era alterado/excluído.
--
-- Este arquivo introduz uma tabela de associação N:N (pole_standard_companies)
-- para que um único registro de pole_standards seja compartilhado por várias
-- concessionárias, migra os dados existentes (colapsando as cópias duplicadas
-- em um único registro canônico) e remove a coluna company_id de
-- pole_standards, que deixa de fazer sentido.
-- =============================================================================

CREATE TABLE public.pole_standard_companies (
  pole_standard_id uuid NOT NULL REFERENCES public.pole_standards(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.utility_companies(id) ON DELETE CASCADE,
  PRIMARY KEY (pole_standard_id, company_id)
);

CREATE INDEX pole_standard_companies_company_id_idx ON public.pole_standard_companies(company_id);

ALTER TABLE public.pole_standard_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pole standard companies" ON public.pole_standard_companies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.pole_standards ps WHERE ps.id = pole_standard_companies.pole_standard_id AND ps.user_id = auth.uid())
  );
CREATE POLICY "Users can insert own pole standard companies" ON public.pole_standard_companies
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.pole_standards ps WHERE ps.id = pole_standard_companies.pole_standard_id AND ps.user_id = auth.uid())
  );
CREATE POLICY "Users can delete own pole standard companies" ON public.pole_standard_companies
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.pole_standards ps WHERE ps.id = pole_standard_companies.pole_standard_id AND ps.user_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- Migração de dados: colapsa linhas duplicadas (mesmo usuário/nome/descrição/
-- tipo de poste, geradas pelo modelo antigo de "1 linha por concessionária")
-- em um único registro canônico (o mais antigo), preservando todas as
-- concessionárias associadas e mesclando grupos/materiais sem duplicar.
-- -----------------------------------------------------------------------------

CREATE TEMP TABLE _pole_standard_dupes AS
SELECT
  id,
  company_id,
  first_value(id) OVER (
    PARTITION BY user_id, name, coalesce(description, ''), coalesce(post_type_id::text, '')
    ORDER BY created_at, id
  ) AS canonical_id
FROM public.pole_standards;

INSERT INTO public.pole_standard_companies (pole_standard_id, company_id)
SELECT DISTINCT canonical_id, company_id
FROM _pole_standard_dupes
ON CONFLICT DO NOTHING;

INSERT INTO public.pole_standard_groups (pole_standard_id, template_id, quantity)
SELECT DISTINCT ON (d.canonical_id, psg.template_id) d.canonical_id, psg.template_id, psg.quantity
FROM public.pole_standard_groups psg
JOIN _pole_standard_dupes d ON d.id = psg.pole_standard_id
ORDER BY d.canonical_id, psg.template_id, psg.pole_standard_id
ON CONFLICT (pole_standard_id, template_id) DO NOTHING;

INSERT INTO public.pole_standard_materials (pole_standard_id, material_id, quantity)
SELECT DISTINCT ON (d.canonical_id, psm.material_id) d.canonical_id, psm.material_id, psm.quantity
FROM public.pole_standard_materials psm
JOIN _pole_standard_dupes d ON d.id = psm.pole_standard_id
ORDER BY d.canonical_id, psm.material_id, psm.pole_standard_id
ON CONFLICT (pole_standard_id, material_id) DO NOTHING;

DELETE FROM public.pole_standards ps
USING _pole_standard_dupes d
WHERE ps.id = d.id AND d.id <> d.canonical_id;

DROP TABLE _pole_standard_dupes;

-- -----------------------------------------------------------------------------
-- company_id deixa de existir em pole_standards: a lista de concessionárias
-- agora vive inteiramente em pole_standard_companies.
-- -----------------------------------------------------------------------------

DROP INDEX IF EXISTS public.pole_standards_company_id_idx;
ALTER TABLE public.pole_standards DROP COLUMN company_id;
