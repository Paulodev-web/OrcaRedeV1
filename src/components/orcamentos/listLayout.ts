/**
 * Grade de colunas da view em lista.
 *
 * Mora num módulo próprio porque o cabeçalho de colunas fica no `Dashboard` e
 * as células ficam em `BudgetRow`/`FolderRow` — se cada um declarasse o seu
 * template, o cabeçalho sairia do lugar assim que alguém mexesse numa largura.
 *
 * Abaixo de `md` sobram nome e menu; cliente, concessionária, data e status
 * ficam escondidos em vez de espremidos.
 */
export const LIST_GRID =
  'grid grid-cols-[minmax(0,1fr)_44px] md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_110px_100px_150px_44px] items-center gap-3';
