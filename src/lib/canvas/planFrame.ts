/**
 * Onde a planta fica dentro do quadro logico 6000x6000.
 *
 * Esta e a UNICA implementacao da conta. O portal, a Server Action de
 * importacao e (via `work_project_snapshot.plan_geometry`) o APK passam todos
 * por aqui. Se dois lados calcularem isso por conta propria, um poste marcado
 * em campo cai fora do lugar no portal, e o erro cresce conforme se afasta do
 * centro da prancha.
 *
 * Sem dependencia de react-pdf de proposito: roda no servidor.
 */
import { CANVAS_SIZE, CANVAS_CENTER } from './canvasTokens';

export interface PlanFrame {
  /** Lado ocupado pela planta dentro do quadro, em unidades logicas. */
  width: number;
  height: number;
  /** Canto superior esquerdo da planta dentro do quadro. */
  offsetX: number;
  offsetY: number;
  /** Fator aplicado a pagina para chegar nesse tamanho. */
  scale: number;
}

/**
 * @param pageWidth  largura da pagina EXIBIDA, em pontos (rotacao ja aplicada)
 * @param pageHeight altura da pagina EXIBIDA, em pontos
 *
 * V2 (`render_version === 2`): a largura vira 6000 e a altura acompanha o
 * aspecto. Numa pagina retrato isso estoura o quadro na vertical, de proposito.
 *
 * V1 (legado): a pagina e multiplicada por um fator preso entre 2 e 4. Numa A1
 * paisagem o fator cai no piso 2, entao a planta ocupa 4768x3368 no meio de um
 * quadro de 6000.
 */
export function calculatePlanFrame(
  pageWidth: number,
  pageHeight: number,
  renderVersion: number | null | undefined,
): PlanFrame {
  const larguraValida = pageWidth > 0 ? pageWidth : 1;
  const alturaValida = pageHeight > 0 ? pageHeight : 1;

  let scale: number;
  let width: number;
  let height: number;

  if (renderVersion === 2) {
    scale = CANVAS_SIZE / larguraValida;
    width = CANVAS_SIZE;
    height = alturaValida * scale;
  } else {
    scale = Math.max(2, Math.min(4, 1200 / Math.max(larguraValida, alturaValida)));
    width = larguraValida * scale;
    height = alturaValida * scale;
  }

  return {
    width,
    height,
    offsetX: CANVAS_CENTER - width / 2,
    offsetY: CANVAS_CENTER - height / 2,
    scale,
  };
}

/**
 * O que fica gravado em `work_project_snapshot.plan_geometry`.
 *
 * Existe porque o APK NAO consegue descobrir isso sozinho: o `react-native-pdf`
 * no Android reporta o tamanho da view em pixels, nao o da pagina em pontos, e
 * a diferenca (1,66x numa A2) faz o quadro logico do aparelho divergir do quadro
 * do portal. Gravando no import, os dois lados leem o mesmo numero.
 */
export interface PlanGeometry {
  version: 1;
  /** Pagina exibida, em pontos, com a rotacao ja aplicada. */
  page: { width: number; height: number; rotation: number };
  frame: { width: number; height: number; offsetX: number; offsetY: number };
  renderVersion: number;
  numPages: number | null;
}

export function buildPlanGeometry(params: {
  pageWidth: number;
  pageHeight: number;
  rotation: number;
  renderVersion: number;
  numPages: number | null;
}): PlanGeometry {
  const frame = calculatePlanFrame(params.pageWidth, params.pageHeight, params.renderVersion);
  const arredonda = (n: number) => Math.round(n * 100) / 100;
  return {
    version: 1,
    page: {
      width: arredonda(params.pageWidth),
      height: arredonda(params.pageHeight),
      rotation: params.rotation,
    },
    frame: {
      width: arredonda(frame.width),
      height: arredonda(frame.height),
      offsetX: arredonda(frame.offsetX),
      offsetY: arredonda(frame.offsetY),
    },
    renderVersion: params.renderVersion,
    numPages: params.numPages,
  };
}
