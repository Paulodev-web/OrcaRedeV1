/**
 * Vocabulário de arrasto do Dashboard do OrçaRede.
 *
 * Substitui o drag-and-drop nativo do HTML5 que havia aqui (`draggable`,
 * `dataTransfer`, `setDragImage` com um `<div>` fora da tela). Três razões:
 *
 *   1. O HTML5 DnD não funciona em toque — no celular e no tablet da obra não
 *      dava para mover nada.
 *   2. O "fantasma" do arrasto era um snapshot do navegador; o código
 *      contornava isso desenhando uma etiqueta invisível e passando para o
 *      `setDragImage`. O dnd-kit move o próprio elemento.
 *   3. É o mesmo motor da Esteira (`/tarefas`), então as duas telas passam a
 *      ter o mesmo comportamento e a mesma animação.
 *
 * Ids são strings estruturadas em vez de objetos em `data` porque assim a
 * origem e o destino sobrevivem a qualquer serialização, e o `dragend` só
 * precisa de `split(':')` para saber para onde o item foi. UUID não contém
 * ':', então o parsing é seguro.
 */

export type DashboardDragKind = 'budget' | 'folder';

/** Alvo que representa a raiz (fora de qualquer pasta). */
export const DROP_ROOT = 'root';

export function draggableId(kind: DashboardDragKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseDraggableId(
  raw: string,
): { kind: DashboardDragKind; id: string } | null {
  const [kind, ...rest] = raw.split(':');
  if (kind !== 'budget' && kind !== 'folder') return null;
  const id = rest.join(':');
  return id ? { kind, id } : null;
}

/**
 * Id de uma zona de drop.
 *
 * `zone` distingue zonas que apontam para a MESMA pasta — o cartão da pasta, o
 * item dela no breadcrumb e a área da pasta aberta. O dnd-kit exige ids únicos;
 * a pasta de destino vem do segundo segmento.
 */
export function dropZoneId(zone: string, folderId: string | null): string {
  return `zone:${zone}:${folderId ?? DROP_ROOT}`;
}

/**
 * Pasta de destino de uma zona. Devolve `undefined` quando o id não é de uma
 * zona (soltou fora de qualquer alvo), e `null` quando o destino é a raiz —
 * `null` é um destino legítimo, então os dois casos precisam ser distinguíveis.
 */
export function parseDropZoneId(raw: string): string | null | undefined {
  const parts = raw.split(':');
  if (parts[0] !== 'zone' || parts.length < 3) return undefined;
  const folderId = parts.slice(2).join(':');
  return folderId === DROP_ROOT ? null : folderId;
}
