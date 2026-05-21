/**
 * Nome do fornecedor para exibição em cotações, cenários e conciliação.
 * Prioridade: suppliers.name (JOIN) > supplier_name (cache/fallback).
 */
export function getSupplierDisplayName(quote: {
  supplier_name: string;
  suppliers?: { name: string } | { name: string }[] | null;
}): string {
  const joined = Array.isArray(quote.suppliers) ? quote.suppliers[0] : quote.suppliers;
  return joined?.name?.trim() || quote.supplier_name?.trim() || 'Fornecedor';
}
