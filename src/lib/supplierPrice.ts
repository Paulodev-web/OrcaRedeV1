/** Preço efetivo para cenários: negociado tem prioridade sobre o unitário do PDF. */
export function effectiveUnitPrice(
  preco_negociado: number | null | undefined,
  preco_unit: number
): number {
  return preco_negociado ?? preco_unit;
}

export function normalizedPrice(effectiveUnit: number, conversionFactor: number): number {
  return conversionFactor > 0 ? effectiveUnit / conversionFactor : effectiveUnit;
}

/** Converte preço normalizado (UI) de volta à unidade do banco (preco_negociado). */
export function negotiatedFromNormalized(normalized: number, conversionFactor: number): number {
  return conversionFactor > 0 ? normalized * conversionFactor : normalized;
}

/** Preço unitário original normalizado (para exibir riscado / tooltip). */
export function originalNormalizedPrice(preco_unit: number, conversionFactor: number): number {
  return normalizedPrice(preco_unit, conversionFactor);
}
