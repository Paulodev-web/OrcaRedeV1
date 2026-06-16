-- Migration: Adiciona coluna display_name em supplier_quotes
-- Permite que o usuário defina um nome customizado para o orçamento (em vez de usar o nome bruto do arquivo PDF).

ALTER TABLE supplier_quotes
  ADD COLUMN IF NOT EXISTS display_name TEXT;

COMMENT ON COLUMN supplier_quotes.display_name IS 'Nome customizado do orçamento definido pelo usuário. Se vazio, usar fallback para nome do arquivo PDF.';
