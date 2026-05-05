/**
 * Normalização de status de orçamento alinhada ao AppContext (Dashboard).
 * Usada na listagem server-side para importar obras — evita divergência entre
 * o que o cliente mostra como "Finalizado" e o que o Postgres filtra com .in().
 */
export function isBudgetFinalizedForImport(status: string | null | undefined): boolean {
  const raw = (status ?? '').trim();
  if (!raw) return false;
  const s = raw.toLowerCase();
  return (
    s === 'finalizado'
    || s === 'finalized'
    || s === 'concluído'
    || s === 'concluido'
  );
}
