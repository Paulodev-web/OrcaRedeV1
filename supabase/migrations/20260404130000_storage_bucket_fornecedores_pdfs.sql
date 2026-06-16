-- Bucket privado para upload de PDFs (SupplierPdfImporter → storage.from('fornecedores_pdfs')).
-- A migração 20260401120000 só define RLS; sem esta linha o Supabase retorna StorageApiError: Bucket not found.

INSERT INTO storage.buckets (id, name, public)
VALUES ('fornecedores_pdfs', 'fornecedores_pdfs', false)
ON CONFLICT (id) DO NOTHING;
