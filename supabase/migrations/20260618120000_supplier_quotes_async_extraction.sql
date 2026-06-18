-- =============================================================================
-- Refatoração: Arquitetura Assíncrona Limpa para Extração de Cotações
-- Adiciona raw_extraction (JSON bruto Gemini), campos de erro e novos status.
-- =============================================================================

-- 1. Novas colunas na tabela supplier_quotes
ALTER TABLE supplier_quotes
  ADD COLUMN IF NOT EXISTS raw_extraction           JSONB       NULL,
  ADD COLUMN IF NOT EXISTS extraction_error_message TEXT        NULL,
  ADD COLUMN IF NOT EXISTS extraction_error_at      TIMESTAMPTZ NULL;

-- 2. Remover constraint de status antiga (se existir)
ALTER TABLE supplier_quotes
  DROP CONSTRAINT IF EXISTS supplier_quotes_status_check;

-- 3. Nova constraint: inclui estados do fluxo antigo + novos do fluxo assíncrono
ALTER TABLE supplier_quotes
  ADD CONSTRAINT supplier_quotes_status_check
  CHECK (status IN (
    'pendente',              -- legado: extração via extraction_jobs (pipeline multi-step)
    'processando_ia',        -- novo: PDF enviado para Edge, aguardando extração Gemini
    'pendente_conciliacao',  -- novo: extração concluída, raw_extraction preenchido
    'erro_extracao',         -- novo: falha na extração (ver extraction_error_message)
    'conciliado',            -- comum: todos os itens com material vinculado
    'aprovado'               -- comum: usuário aprovou para cenário de compra
  ));

-- 4. Índice para monitorar cotações em processamento
CREATE INDEX IF NOT EXISTS idx_supplier_quotes_processing
  ON supplier_quotes (user_id, created_at DESC)
  WHERE status = 'processando_ia';

-- 5. Índice para cotações com erro (diagnóstico)
CREATE INDEX IF NOT EXISTS idx_supplier_quotes_error
  ON supplier_quotes (user_id, extraction_error_at DESC)
  WHERE status = 'erro_extracao';
