const SESSION_KEY_PREFIX = 'suprimentos:conciliacao-vista:';
const BUDGET_KEY_PREFIX = 'suprimentos:conciliacao-vista-budget:';

function storageKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}${sessionId}`;
}

function budgetStorageKey(budgetId: string): string {
  return `${BUDGET_KEY_PREFIX}${budgetId}`;
}

export function markConciliationSeen(sessionId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey(sessionId), '1');
  } catch {
    /* ignore quota / private mode */
  }
}

export function hasSeenConciliation(sessionId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(storageKey(sessionId)) === '1';
  } catch {
    return false;
  }
}

export function markBudgetConciliationSeen(budgetId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(budgetStorageKey(budgetId), '1');
  } catch {
    /* ignore */
  }
}

export function hasSeenBudgetConciliation(budgetId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(budgetStorageKey(budgetId)) === '1';
  } catch {
    return false;
  }
}
