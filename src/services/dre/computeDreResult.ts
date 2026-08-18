import { DRE_GROUPS, type DreGroup, type DrePlannedSnapshot, type DreResult } from './types';

interface ComputeDreResultInput {
  contractValue: number;
  revenueSource: 'proposal' | 'pricing';
  planned: DrePlannedSnapshot;
  /** Custo realizado por grupo, já somado (OC para material/frete, dre_actuals para o resto). */
  realizado: Record<DreGroup, number>;
  /** Quais grupos estão fechados. Grupo ausente conta como aberto. */
  fechados: Partial<Record<DreGroup, boolean>>;
}

/**
 * Calcula o resultado da DRE de Obra a partir do orçado congelado e do
 * realizado somado. Pura — nenhuma chamada a banco aqui, só matemática, para
 * poder ser testada isolada do Supabase.
 *
 * O antídoto do §4 do plano mora aqui: `custoProjetado` troca o realizado pelo
 * orçado em todo grupo ainda aberto, e `custoReal`/`margemRealPercent` só
 * existem quando os 6 grupos estão fechados — nunca uma aproximação disfarçada
 * de número real.
 */
export function computeDreResult(input: ComputeDreResultInput): DreResult {
  const { contractValue, revenueSource, planned, realizado, fechados } = input;

  const groups = DRE_GROUPS.map((grupo) => {
    const planejado = Math.max(planned[grupo] ?? 0, 0);
    const real = Math.max(realizado[grupo] ?? 0, 0);
    const fechado = fechados[grupo] === true;
    const variacao = real - planejado;
    const variacaoPercent = planejado > 0 ? (variacao / planejado) * 100 : null;

    return { grupo, planejado, realizado: real, fechado, variacao, variacaoPercent };
  });

  const totalPlanejado = groups.reduce((acc, g) => acc + g.planejado, 0);
  const gruposAbertos = groups.filter((g) => !g.fechado).length;
  const gruposTotal = groups.length;

  const custoProjetado = groups.reduce((acc, g) => acc + (g.fechado ? g.realizado : g.planejado), 0);
  const lucroProjetado = contractValue - custoProjetado;
  const margemProjetadaPercent = contractValue > 0 ? (lucroProjetado / contractValue) * 100 : 0;

  const todosFechados = gruposAbertos === 0;
  const custoReal = todosFechados ? groups.reduce((acc, g) => acc + g.realizado, 0) : null;
  const lucroReal = custoReal !== null ? contractValue - custoReal : null;
  const margemRealPercent =
    custoReal !== null && contractValue > 0 ? ((contractValue - custoReal) / contractValue) * 100 : null;

  return {
    contractValue,
    revenueSource,
    groups,
    totalPlanejado,
    custoProjetado,
    lucroProjetado,
    margemProjetadaPercent,
    custoReal,
    lucroReal,
    margemRealPercent,
    gruposAbertos,
    gruposTotal,
  };
}
