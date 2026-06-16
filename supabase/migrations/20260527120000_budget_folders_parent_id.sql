-- Suporte a subpastas: coluna parent_id referenciando a própria tabela
ALTER TABLE public.budget_folders
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.budget_folders (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS budget_folders_parent_id_idx
  ON public.budget_folders (parent_id);

COMMENT ON COLUMN public.budget_folders.parent_id IS 'Pasta pai; NULL = pasta na raiz do dashboard';
