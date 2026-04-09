/** Item extraído de PDF / Gemini (antes de persistir em supplier_quote_items). */
export type SupplierExtractItem = {
  descricao: string;
  unidade: string;
  quantidade: number;
  preco_unit: number;
  total_item: number;
  ipi_percent: number;
  st_incluso: boolean;
  alerta: boolean;
};

/** Item pendente enviado ao serviço de match semântico (Nível 2). */
export interface UnconciliatedItem {
  id: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  preco_unit: number;
}

/** Material do sistema disponível para pareamento. */
export interface SystemMaterial {
  id: string;
  code: string;
  name: string;
  unit: string;
}

/** Sugestão retornada pelo serviço de match semântico por item. */
export interface SemanticMatchSuggestionPayload {
  supplierItemId: string;
  materialId: string;
  conversionFactor: number;
  confidenceScore: number;
  rationale?: string;
}

/** Resultado completo do serviço de match semântico. */
export type SemanticMatchResult =
  | { success: true; suggestions: SemanticMatchSuggestionPayload[] }
  | { success: false; error: string };
