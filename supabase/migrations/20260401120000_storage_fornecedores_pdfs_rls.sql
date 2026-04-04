-- Políticas RLS em storage.objects para o bucket privado `fornecedores_pdfs`.
-- Cliente (upload) e Server Action (download) usam a mesma sessão (anon ou authenticated).

DROP POLICY IF EXISTS "fornecedores_pdfs_insert" ON storage.objects;
DROP POLICY IF EXISTS "fornecedores_pdfs_select" ON storage.objects;

-- INSERT: upload a partir do browser (SupplierPdfImporter).
CREATE POLICY "fornecedores_pdfs_insert"
ON storage.objects
FOR INSERT
TO authenticated, anon
WITH CHECK (bucket_id = 'fornecedores_pdfs');

-- SELECT: download na Server Action (extractSupplierDataAction).
CREATE POLICY "fornecedores_pdfs_select"
ON storage.objects
FOR SELECT
TO authenticated, anon
USING (bucket_id = 'fornecedores_pdfs');

-- Em produção, prefira restringir a TO authenticated e exigir login na rota,
-- removendo `anon` das políticas acima.
