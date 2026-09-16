"use client";

import dynamic from 'next/dynamic';

/**
 * Fronteira de client-only para o visualizador de planta.
 *
 * `react-pdf` puxa o pdf.js, que no topo do módulo faz `new DOMMatrix()`
 * (pdf.js/src/display/canvas.js). `DOMMatrix` só existe no navegador, então
 * qualquer avaliação no servidor estoura:
 *
 *   Runtime Error: DOMMatrix is not defined
 *
 * Quatro componentes importavam a implementação de forma estática
 * (AreaTrabalho, EngineerPortal, PublicWorkView, PublicWorkViewPremium) e um
 * deles, AreaTrabalho, é alcançado pelo AppShell — que entra em TODA rota.
 * O resultado era o pdf.js sendo avaliado no servidor em toda página do
 * sistema, inclusive no chat, que não exibe planta nenhuma.
 *
 * Este arquivo mantém o mesmo nome e os mesmos exports de antes, então
 * ninguém precisou mudar o import: a implementação foi para
 * `CanvasVisualImpl` e entra aqui por `dynamic` com `ssr: false`, que é o
 * que garante que o pdf.js só carregue no navegador.
 */
export const CanvasVisual = dynamic(
  () => import('./CanvasVisualImpl').then((m) => m.CanvasVisual),
  { ssr: false },
);

export default CanvasVisual;
