/**
 * Formata uma data como tempo relativo em pt-BR.
 * Ex.: "agora há pouco", "há 5 minutos", "há 2 horas", "ontem", "DD/MM".
 */
export function formatRelativeTime(value: Date | string | null | undefined, now: Date = new Date()): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  if (diffSec < 45) return 'agora há pouco';
  if (diffMin < 2) return 'há 1 minuto';
  if (diffMin < 60) return `há ${diffMin} minutos`;
  if (diffHour < 2) return 'há 1 hora';
  if (diffHour < 24) return `há ${diffHour} horas`;
  if (diffDay === 1) return 'ontem';
  if (diffDay < 7) return `há ${diffDay} dias`;

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  if (yyyy === now.getFullYear()) return `${dd}/${mm}`;
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Retorna rótulo de agrupamento por dia para o feed de notificações.
 * "Hoje", "Ontem", ou "DD/MM" / "DD/MM/YYYY".
 */
export function dayBucketLabel(value: Date | string, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  if (date >= startOfToday) return 'Hoje';
  if (date >= startOfYesterday) return 'Ontem';

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  if (yyyy === now.getFullYear()) return `${dd}/${mm}`;
  return `${dd}/${mm}/${yyyy}`;
}
