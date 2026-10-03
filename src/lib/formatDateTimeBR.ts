const TIME_ZONE = 'America/Sao_Paulo';

/**
 * Formata data+hora em pt-BR fixando o fuso de Brasília, independente do
 * fuso do ambiente que renderiza (servidor costuma rodar em UTC).
 */
export function formatDateTimeBR(value: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleString('pt-BR', { timeZone: TIME_ZONE, ...options });
}

/** Só a hora (HH:mm) em horário de Brasília. */
export function formatTimeBR(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  });
}

/** Só a data (DD/MM/AAAA) em horário de Brasília. */
export function formatDateBR(value: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString('pt-BR', { timeZone: TIME_ZONE, ...options });
}
