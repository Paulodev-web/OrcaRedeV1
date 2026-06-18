-- =============================================================================
-- MIGRATION: Adiciona 'conciliando' e 'aguardando_revisao' ao CHECK de status
--            da tabela supplier_quotes para suportar o fluxo assíncrono de
--            conciliação via Edge Function match-supplier-quote.
-- =============================================================================

-- Remove o CHECK constraint existente no campo status (qualquer nome que tenha).
-- Usamos DO/EXECUTE para ser resiliente ao nome gerado automaticamente pelo Postgres.
DO $$
DECLARE
  _constraint_name text;
BEGIN
  SELECT conname INTO _constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'supplier_quotes'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%status%IN%';

  IF _constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE supplier_quotes DROP CONSTRAINT %I', _constraint_name);
  END IF;
END $$;

-- Adiciona constraint atualizada com todos os status do ciclo de vida completo
ALTER TABLE supplier_quotes
  ADD CONSTRAINT supplier_quotes_status_check CHECK (
    status IN (
      'pendente',             -- legado: pipeline multi-step (extraction_jobs)
      'processando_ia',       -- PDF enviado para Edge, aguardando Gemini
      'pendente_conciliacao', -- raw_extraction preenchido, aguarda ação do usuário
      'erro_extracao',        -- falha na extração do PDF
      'conciliando',          -- Edge Function match-supplier-quote em execução
      'aguardando_revisao',   -- match concluído, aguarda validação humana
      'conciliado',           -- todos os itens validados pelo usuário
      'aprovado'              -- cotação aprovada para compra
    )
  );
