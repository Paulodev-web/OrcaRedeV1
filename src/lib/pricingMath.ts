export interface BdiRates {
  df: number;
  fi: number;
  lucro: number;
  impostos: number;
}

export interface PricingComposition {
  materiais: number;
  maoDeObra: number;
  despesasFixas: number;
  despesasFinanceiras: number;
  impostos: number;
  lucro: number;
}

export interface PricingCalculationResult {
  custoDireto: number;
  percentualBdi: number;
  taxaBdi: number;
  precoVenda: number | null;
  lucroEstimado: number | null;
  composicao: PricingComposition;
  isTaxaInvalida: boolean;
}

export const DEFAULT_BDI_RATES: BdiRates = {
  df: 5,
  fi: 1.5,
  lucro: 8,
  impostos: 13.45,
};

function toSafeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return value;
}

export function calculatePricing(
  materiaisSubtotal: number,
  laborSubtotal: number,
  rates: BdiRates
): PricingCalculationResult {
  const materiais = toSafeNumber(materiaisSubtotal);
  const maoDeObra = toSafeNumber(laborSubtotal);
  const custoDireto = materiais + maoDeObra;

  const df = toSafeNumber(rates.df);
  const fi = toSafeNumber(rates.fi);
  const lucroRate = toSafeNumber(rates.lucro);
  const impostosRate = toSafeNumber(rates.impostos);

  const percentualBdi = df + fi + lucroRate + impostosRate;
  const taxaBdi = percentualBdi / 100;
  const isTaxaInvalida = taxaBdi >= 1;

  if (isTaxaInvalida) {
    return {
      custoDireto,
      percentualBdi,
      taxaBdi,
      precoVenda: null,
      lucroEstimado: null,
      isTaxaInvalida,
      composicao: {
        materiais,
        maoDeObra,
        despesasFixas: 0,
        despesasFinanceiras: 0,
        impostos: 0,
        lucro: 0,
      },
    };
  }

  const precoVenda = custoDireto / (1 - taxaBdi);
  const lucroEstimado = precoVenda * (lucroRate / 100);

  return {
    custoDireto,
    percentualBdi,
    taxaBdi,
    precoVenda,
    lucroEstimado,
    isTaxaInvalida,
    composicao: {
      materiais,
      maoDeObra,
      despesasFixas: precoVenda * (df / 100),
      despesasFinanceiras: precoVenda * (fi / 100),
      impostos: precoVenda * (impostosRate / 100),
      lucro: lucroEstimado,
    },
  };
}
