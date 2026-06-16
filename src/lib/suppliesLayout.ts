/**
 * Classes para áreas de tabela do módulo de suprimentos.
 * Altura proporcional à viewport em vez de px fixos.
 */

/** Scroll vertical — ocupa boa parte da tela em monitores grandes */
export const suppliesTableScrollYClass =
  'min-h-[clamp(16rem,42dvh,28rem)] max-h-[clamp(20rem,min(75dvh,calc(100dvh-12rem)),calc(100vh-12rem))] overflow-y-auto';

/** Scroll horizontal + vertical */
export const suppliesTableScrollClass = `${suppliesTableScrollYClass} overflow-x-auto`;

/** Variante compacta (painéis colapsáveis, modais) */
export const suppliesTableScrollYCompactClass =
  'min-h-[10rem] max-h-[clamp(12rem,min(40dvh,calc(100dvh-20rem)),28rem)] overflow-y-auto';

/** Container com borda arredondada */
export const suppliesTableBorderedScrollClass =
  `rounded-lg border border-gray-200 ${suppliesTableScrollClass}`;

/** Página de suprimentos: coluna flexível que preenche a altura útil */
export const suppliesPageColumnClass = 'mx-auto flex w-full max-w-7xl flex-1 flex-col min-h-0 gap-6';
