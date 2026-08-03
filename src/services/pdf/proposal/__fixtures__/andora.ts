import type {
  ProposalAbc,
  ProposalAbcRow,
  ProposalData,
  ProposalMaterialRow,
  ProposalSectionConfig,
  ProposalSectionKey,
  ProposalSegmentTotal,
} from '@/types/proposal';

import { syntheticLogo, syntheticPhoto, syntheticSignature } from './syntheticImage';

/**
 * FIXTURE COMPLETA — equivalente à proposta 287.1 / ANDORA CONSTRUÇÕES LTDA.
 *
 * Preenche todo o `ProposalData` com dados no volume e no formato da peça real:
 * 23 subgrupos de material, curva ABC de ponta a ponta, três segmentos de obra,
 * parcelamento em 10x sobre o VS, cronograma, matriz de responsabilidade e
 * texto institucional.
 *
 * TODOS os agregados são DERIVADOS das linhas de material — nada é digitado à
 * mão duas vezes. É isso que faz a fixture passar na validação de coerência:
 * a curva ABC nasce do consolidado por subgrupo, os totais por curva nascem
 * das linhas, e os segmentos nascem do mapa subgrupo → segmento.
 *
 * Onde a peça real erra, aqui está corrigido de propósito — "05 (cinco)
 * transformadores" no lugar de "05 (seis)", "MAPA ARQUITETÔNICO" no lugar de
 * "ARQUITETÔONICO", "cinquenta e três" no lugar de "cinqüenta e três" e a frase
 * quebrada "destinada necessários para a eletrificação" reescrita.
 */

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// 1. Consolidado de material — a fonte de tudo que vem depois
// ---------------------------------------------------------------------------

type MaterialSpec = [
  code: string,
  name: string,
  subgroup: string,
  unit: string,
  quantity: number,
  unitPrice: number,
];

const MATERIAL_SPECS: MaterialSpec[] = [
  ['CIV-0183', 'Caixa de passagem para energia, conforme Desenho 20 da NT.00004', 'Civil', 'un', 183, 890.0],
  ['CIV-0184', 'Caixa de passagem para dados 60 x 35 x 70 cm', 'Civil', 'un', 181, 420.0],
  ['CIV-0210', 'Concreto usinado FCK 20 MPa para envelopamento de dutos', 'Civil', 'm³', 62, 155.0],

  ['CND-1554', 'Cabo de alumínio nu CA 155,4 MCM, 7 fios, tipo Anaheim', 'Condutor', 'm', 1240, 41.8],
  ['CND-0703', 'Cabo de alumínio isolado XLPE 0,6/1 kV 3 x 1 x 70 mm² + 70 mm²', 'Condutor', 'm', 2150, 38.6],
  ['CND-0353', 'Cabo multiplexado duplex AL+CAL/XLPE 1 x 1 x 35 mm² + 35 mm²', 'Condutor', 'm', 2000, 16.3],

  ['TRF-1125', 'Transformador trifásico 112,5 kVA, 13,8 kV / 220-127 V, padrão orla', 'Transformador', 'un', 5, 21900.0],
  ['TRF-0750', 'Transformador trifásico 75 kVA, 13,8 kV / 220-127 V, padrão orla', 'Transformador', 'un', 2, 16000.0],

  ['PST-1160', 'Poste de concreto Duplo T CAAA IV 11/600, classe de corrosão C5', 'Poste CAA II - C4', 'un', 43, 1640.0],
  ['PST-1210', 'Poste de concreto Duplo T CAAA IV 12/1000, classe de corrosão C5', 'Poste CAA II - C4', 'un', 18, 1530.0],

  ['ELD-0250', 'Eletroduto PVC rígido Ø 2 ½", barra de 3 m', 'Eletrodutos', 'un', 1240, 33.5],
  ['ELD-0500', 'Eletroduto corrugado PEAD Ø 50 mm para infraestrutura de dados', 'Eletrodutos', 'm', 1860, 8.4],

  ['FAL-0008', 'Ferragem leve em liga de alumínio, conforme NT.00008 rev. 03/2025', 'Ferragem alumínio', 'cj', 61, 620.0],
  ['FAL-0619', 'Mão-francesa em liga de alumínio 619 mm', 'Ferragem alumínio', 'un', 122, 94.0],

  ['ORL-0150', 'Chave fusível 15 kV / 100 A com proteção para orla marítima', 'Proteção para orla', 'un', 15, 1480.0],
  ['ORL-0120', 'Para-raios polimérico 12 kV / 10 kA com proteção para orla marítima', 'Proteção para orla', 'un', 45, 348.0],

  ['LUM-0100', 'Luminária pública LED 100 W, temperatura de cor 5000 K', 'Luminária', 'un', 60, 480.0],

  ['CRZ-2400', 'Cruzeta de fibra de vidro 2400 mm', 'Cruzeta', 'un', 61, 268.0],
  ['CRZ-1900', 'Cruzeta de fibra de vidro 1900 mm', 'Cruzeta', 'un', 29, 252.0],

  ['ISP-0150', 'Isolador de pino em porcelana 15 kV', 'Isolador porcelana', 'un', 183, 61.0],
  ['ISP-0072', 'Isolador roldana em porcelana 72 x 72 mm', 'Isolador porcelana', 'un', 250, 15.0],

  ['CNX-0735', 'Conector cunha de alumínio 70 - 35 mm²', 'Conexão', 'un', 420, 18.6],
  ['CNX-1554', 'Conector paralelo bimetálico para CA 155,4 MCM', 'Conexão', 'un', 180, 31.7],

  ['PRF-1554', 'Alça pré-formada de distribuição para CA 155,4 MCM', 'Pré-formado', 'un', 244, 34.1],
  ['PRF-0004', 'Laço pré-formado 4 CA', 'Pré-formado', 'un', 210, 22.2],

  ['ATR-0624', 'Haste de aterramento cobreada 5/8" x 2,4 m', 'Aterramento', 'un', 92, 78.5],
  ['ATR-0016', 'Cabo de cobre nu 16 mm² para aterramento', 'Aterramento', 'm', 640, 8.6],

  ['MED-0023', 'Caixa de medição monofásica em poste, conforme NT.023 rev. 03/2023', 'Medição', 'un', 7, 1450.0],

  ['FRT-0001', 'Frete de postes de concreto até o canteiro de obras', 'Frete de poste', 'vb', 1, 10000.0],

  ['BRC-4000', 'Braço curvo tipo cisne Ø 48 mm x 4.000 mm', 'Braço', 'un', 7, 315.0],
  ['BRC-3000', 'Braço curvo tipo cisne Ø 48 mm x 3.000 mm', 'Braço', 'un', 53, 132.0],

  ['FER-0190', 'Cinta circular em aço galvanizado 190 mm', 'Ferragem', 'un', 122, 42.0],
  ['FER-1625', 'Parafuso máquina galvanizado 16 x 250 mm', 'Ferragem', 'un', 305, 10.7],

  ['PRT-0300', 'Protetor de cabo tipo pescoço de ganso, 3 m', 'Proteção', 'un', 45, 89.6],

  ['CCP-0001', 'Concretagem de base de poste', 'Concretagem postes', 'un', 61, 51.86],

  ['ISO-0150', 'Isolador polimérico tipo bastão 15 kV', 'Isolador polimérico', 'un', 24, 100.5],

  ['REL-1000', 'Relé fotoelétrico NA 1000 W', 'Relé', 'un', 60, 26.63],

  ['FTA-0200', 'Fita de advertência "RISCO ELETRICIDADE", rolo de 200 m', 'Fita advertência', 'un', 14, 97.5],

  ['FIX-0250', 'Abraçadeira de fixação para eletroduto Ø 2 ½"', 'Fixação', 'un', 620, 2.05],
];

const materials: ProposalMaterialRow[] = MATERIAL_SPECS.map(
  ([code, name, subgroup, unit, quantity, unitPrice]) => ({
    code,
    name,
    subgroup,
    unit,
    quantity,
    unitPrice,
    subtotal: round2(quantity * unitPrice),
  }),
);

// ---------------------------------------------------------------------------
// 2. Curva ABC derivada do consolidado, por Pareto sobre os subgrupos
// ---------------------------------------------------------------------------

function subgroupTotals(rows: ProposalMaterialRow[]): Array<{ label: string; amount: number }> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const label = row.subgroup ?? 'Sem subgrupo';
    totals.set(label, round2((totals.get(label) ?? 0) + row.subtotal));
  }
  return [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Corte A/B/C — editável no editor de proposta; aqui usa 68% / 95%. */
const CURVE_CUT_A = 68;
const CURVE_CUT_B = 95;

function buildAbc(rows: ProposalMaterialRow[]): ProposalAbc {
  const groups = subgroupTotals(rows);
  const grandTotal = round2(groups.reduce((acc, group) => acc + group.amount, 0));

  let cumulative = 0;
  let curve: 'A' | 'B' | 'C' = 'A';

  const abcRows: ProposalAbcRow[] = groups.map((group, index) => {
    const current = curve;
    cumulative += (group.amount / grandTotal) * 100;
    // O item que cruza o corte ainda pertence à curva corrente; o próximo desce.
    if (curve === 'A' && cumulative >= CURVE_CUT_A) curve = 'B';
    else if (curve === 'B' && cumulative >= CURVE_CUT_B) curve = 'C';

    return {
      curve: current,
      label: group.label,
      amount: group.amount,
      percent: round2((group.amount / grandTotal) * 100),
      order: index + 1,
    };
  });

  const totals = (['A', 'B', 'C'] as const)
    .map((key) => {
      const amount = round2(
        abcRows.filter((row) => row.curve === key).reduce((acc, row) => acc + row.amount, 0),
      );
      return { curve: key, amount, percent: round2((amount / grandTotal) * 100) };
    })
    .filter((total) => total.amount > 0);

  return { rows: abcRows, totals, grandTotal };
}

const abc = buildAbc(materials);

// ---------------------------------------------------------------------------
// 3. Segmentos de obra — material vem do mapa subgrupo → segmento
// ---------------------------------------------------------------------------

const SEGMENT_BY_SUBGROUP: Record<string, string> = {
  Civil: 'Ramais de ligação + lógica',
  Eletrodutos: 'Ramais de ligação + lógica',
  'Fita advertência': 'Ramais de ligação + lógica',

  Luminária: 'Rede iluminação',
  Braço: 'Rede iluminação',
  Medição: 'Rede iluminação',
  Relé: 'Rede iluminação',
};
const DEFAULT_SEGMENT = 'Rede energia';

/** Mão de obra por segmento — vem da precificação, não do consolidado. */
const SEGMENT_LABOR: Record<string, number> = {
  'Rede energia': 287000.0,
  'Ramais de ligação + lógica': 58000.0,
  'Rede iluminação': 47685.72,
};

const SEGMENT_ORDER = ['Rede energia', 'Ramais de ligação + lógica', 'Rede iluminação'];

function buildSegments(rows: ProposalMaterialRow[]): {
  segments: ProposalSegmentTotal[];
  materialTotal: number;
  laborTotal: number;
  grandTotal: number;
} {
  const materialBySegment = new Map<string, number>();
  for (const row of rows) {
    const segment = SEGMENT_BY_SUBGROUP[row.subgroup ?? ''] ?? DEFAULT_SEGMENT;
    materialBySegment.set(segment, round2((materialBySegment.get(segment) ?? 0) + row.subtotal));
  }

  const materialTotal = round2(
    [...materialBySegment.values()].reduce((acc, value) => acc + value, 0),
  );
  const laborTotal = round2(
    SEGMENT_ORDER.reduce((acc, segment) => acc + (SEGMENT_LABOR[segment] ?? 0), 0),
  );
  const grandTotal = round2(materialTotal + laborTotal);

  const segments: ProposalSegmentTotal[] = SEGMENT_ORDER.map((label, index) => {
    const materialAmount = materialBySegment.get(label) ?? 0;
    const laborAmount = SEGMENT_LABOR[label] ?? 0;
    const totalAmount = round2(materialAmount + laborAmount);
    return {
      label,
      materialAmount,
      laborAmount,
      totalAmount,
      percent: round2((totalAmount / grandTotal) * 100),
      order: index + 1,
    };
  }).sort((a, b) => b.totalAmount - a.totalAmount)
    .map((segment, index) => ({ ...segment, order: index + 1 }));

  return { segments, materialTotal, laborTotal, grandTotal };
}

const { segments, materialTotal, laborTotal, grandTotal } = buildSegments(materials);

// ---------------------------------------------------------------------------
// 4. Parcelamento — 10x SOBRE A MÃO DE OBRA, nunca sobre material
// ---------------------------------------------------------------------------

const INSTALLMENTS = 10;
const DUE_LABELS = [
  'Entrada — assinatura do contrato',
  '30 dias',
  '60 dias',
  '90 dias',
  '120 dias',
  '150 dias',
  '180 dias',
  '210 dias',
  '240 dias',
  '270 dias',
];

const paymentTerms = Array.from({ length: INSTALLMENTS }, (_, index) => {
  const percent = round2(100 / INSTALLMENTS);
  return {
    order: index + 1,
    percent,
    amount: round2((percent / 100) * laborTotal),
    dueLabel: DUE_LABELS[index],
  };
});

const UNITS_COUNT = 173;

// ---------------------------------------------------------------------------
// 5. Seções
// ---------------------------------------------------------------------------

const SECTION_TITLES: Array<[ProposalSectionKey, string]> = [
  ['capa', 'Capa'],
  ['quem_somos', 'Quem somos'],
  ['seu_projeto', 'Seu projeto'],
  ['localizacao', 'Localização da obra'],
  ['fotos_obra', 'Fotos executivas'],
  ['descricao_atividades', 'Descrição das atividades'],
  ['escopo_materiais', 'Escopo dos materiais subdivididos'],
  ['curva_abc', 'Curva de preços dos materiais'],
  ['condicoes_faturamento', 'Condições de faturamento e negociação de materiais'],
  ['valores_por_segmento', 'Valores globais de material e mão de obra por segmento'],
  ['valores_globais', 'Valores globais'],
  ['investimento_por_unidade', 'Valor de investimento por lote'],
  ['condicoes_pagamento', 'Condições de pagamento'],
  ['cronograma', 'Cronograma executivo'],
  ['matriz_responsabilidade', 'Matriz de responsabilidade'],
  ['consideracoes_finais', 'Considerações finais'],
  ['diferencial_orcarede', 'Diferencial tecnológico: sistema OrçaRede'],
  ['termo_aceite', 'Termo de aceite'],
  ['contato', 'Contato'],
];

const sections: ProposalSectionConfig[] = SECTION_TITLES.map(([key, title], index) => ({
  key,
  title,
  order: index + 1,
  enabled: true,
}));

// ---------------------------------------------------------------------------
// 6. Payload
// ---------------------------------------------------------------------------

export const andoraProposalFixture: ProposalData = {
  id: 'fixture-andora-287-1',
  budgetId: 'fixture-budget-287',
  status: 'draft',

  header: {
    proposalNumber: 287,
    version: 1,
    scopeLabel: 'Tipo de escopo',
    projectTitle: 'Execução de infraestrutura elétrica e civil em condomínio residencial',
    projectSubtitle: 'Cond. Residencial — Cyano Private Resort',
    clientName: 'ANDORA CONSTRUÇÕES LTDA.',
    city: 'Osório / RS',
    issuedAt: '2026-06-12',
    validityDate: '2026-07-12',
  },

  company: {
    legalName: 'PORTO SERVIÇOS ELÉTRICOS LTDA',
    tradeName: 'ON Engenharia',
    cnpj: '40.258.369/0001-13',
    address: 'VL Arroio Grande — Ibirubá / RS',
    phonePrimary: '(55) 9 9133-7296',
    phoneSecondary: '(54) 9 9129-6181',
    email: 'contato@onengenhariaeletrica.com.br',
    website: 'onengenhariaeletrica.com.br',
    instagram: '@onengenhariaeletrica',
    whatsappNumber: '+5555991337296',
    logoUrl: syntheticLogo(),
  },

  responsible: {
    fullName: 'Eng. Luan Stefanello Pianesso',
    crea: 'CREA/RS: 278122',
    signatureUrl: syntheticSignature(),
  },

  sections,

  institutional: {
    quemSomos: {
      heading: 'Quem somos',
      paragraphs: [
        'Somos uma empresa dedicada a transformar o cenário da infraestrutura elétrica, unindo capacidade técnica e responsabilidade socioambiental. Atuamos com foco na entrega de resultados sólidos, como demonstrado em nossa gestão de projetos de loteamentos particulares, onde a eficiência na alocação de recursos e a transparência financeira são as bases do nosso sucesso.',
      ],
      bullets: [],
    },
    identidade: {
      heading: 'Nossa identidade',
      paragraphs: [
        'Acreditamos que a energia é o motor do desenvolvimento, e por isso fundamentamos nossa atuação em três pilares essenciais:',
      ],
      bullets: [
        'Visão: oferecer soluções inovadoras e eficientes para suprir as necessidades energéticas de nossos clientes.',
        'Missão: possibilitar o acesso a energia limpa e renovável de forma acessível e personalizada, segura para a preservação do meio ambiente e para a construção de uma sociedade mais sustentável.',
        'Valores: atuamos com ética e transparência nas relações comerciais e com a sociedade, prezando pelo respeito ao meio ambiente, pela valorização de nossos colaboradores e pelo atendimento aos clientes com excelência e comprometimento.',
      ],
    },
    compromisso: {
      heading: 'Compromisso com a qualidade',
      paragraphs: [
        'Entendemos que uma obra de infraestrutura elétrica exige precisão. No gerenciamento de nossos projetos, mantemos um controle rigoroso sobre os custos de materiais e logística, garantindo que o resultado final reflita a qualidade técnica esperada.',
        'Para nós, o sucesso é resultado da escolha de produtos de alta qualidade. Por isso, trabalhamos em conjunto com parceiros e empresas líderes de mercado para garantir que cada quilômetro de rede construída seja sinônimo de segurança e durabilidade.',
      ],
      bullets: [],
    },
    diferencialOrcaRede: {
      heading: 'Diferencial tecnológico: sistema OrçaRede',
      paragraphs: [
        'A ON Engenharia entende que a precisão técnica e a confiança do cliente são os pilares de uma obra bem-sucedida. Por isso, desenvolvemos o OrçaRede, um software próprio e exclusivo que revoluciona a forma como planejamos e entregamos nossos projetos elétricos.',
        'É o nosso sistema único de gerenciamento de obra e acompanhamento do cliente. Diferente de processos manuais, o OrçaRede integra todas as etapas da engenharia em uma plataforma digital robusta.',
        'Acreditamos na transparência total. Ao contratar a ON Engenharia, o cliente recebe um link dedicado para acompanhar sua obra em tempo real — sua obra na palma da mão, onde quer que você esteja.',
      ],
      bullets: [
        'Precisão cirúrgica no orçamento: o sistema possui um algoritmo avançado que inibe erros na listagem de materiais, garantindo que o que foi orçado seja exatamente o necessário para a execução.',
        'Redução de desperdícios: através do controle rigoroso de insumos, otimizamos custos e evitamos compras desnecessárias ou faltas de última hora.',
        'Padronização técnica: todo o conhecimento de engenharia da ON está embarcado no software, garantindo que cada projeto siga as normas vigentes e os padrões de cada concessionária.',
        'Acompanhamento visual: gráficos de progresso executivo e fotos da obra atualizadas pela equipe de campo.',
        'Cronograma atualizado: saiba exatamente em que fase a equipe de campo está trabalhando.',
        'Relatórios em tempo real: acesso direto aos dados que importam para a sua tomada de decisão.',
        'Documentos da equipe executora: acesso a documentos dos colaboradores, contrato de trabalho, fichas de EPI e ASO.',
      ],
    },
  },

  media: {
    seuProjeto: [
      {
        url: syntheticPhoto('mapa', 101, 900, 560),
        caption: null,
        order: 1,
        group: 'Mapa arquitetônico do empreendimento',
      },
      {
        url: syntheticPhoto('rede', 102),
        caption: 'Traçado da rede primária',
        order: 2,
        group: 'Redes de MT/BT e subestações transformadoras',
      },
      {
        url: syntheticPhoto('subestacao', 103),
        caption: 'Subestação transformadora tipo pedestal',
        order: 3,
        group: 'Redes de MT/BT e subestações transformadoras',
      },
    ],
    localizacao: [
      {
        url: syntheticPhoto('aerea', 201, 900, 520),
        caption: 'Osório / RS — acesso pela RS-030',
        order: 1,
        group: null,
      },
    ],
    fotosObra: [
      { url: syntheticPhoto('rede', 301), caption: 'Rede de média tensão energizada', order: 1, group: 'Estruturas elétricas' },
      { url: syntheticPhoto('subestacao', 302), caption: 'Transformador 112,5 kVA', order: 2, group: 'Estruturas elétricas' },
      { url: syntheticPhoto('rede', 303), caption: 'Montagem eletromecânica em cruzeta de fibra', order: 3, group: 'Estruturas elétricas' },
      { url: syntheticPhoto('aerea', 304), caption: 'Rede de iluminação pública concluída', order: 4, group: 'Estruturas elétricas' },
      { url: syntheticPhoto('vala', 401), caption: 'Valas e dutos para ramais de ligação de lotes', order: 5, group: 'Estruturas civil' },
      { url: syntheticPhoto('vala', 402), caption: 'Envelopamento de dutos em travessia de rua', order: 6, group: 'Estruturas civil' },
      { url: syntheticPhoto('vala', 403), caption: 'Caixas de passagem conforme Desenho 20 — NT.00004', order: 7, group: 'Estruturas civil' },
      { url: syntheticPhoto('subestacao', 404), caption: 'Base de concreto para transformador', order: 8, group: 'Estruturas civil' },
    ],
  },

  activities: [
    {
      order: 1,
      title: '1. Rede de distribuição em média e baixa tensão com transformadores e rede subterrânea',
      intro:
        'Execução completa da rede de distribuição elétrica em média e baixa tensão destinada à eletrificação do condomínio, contemplando fornecimento de materiais, mão de obra especializada, montagem eletromecânica, seccionamento, proteção, instalação dos equipamentos e comissionamento do sistema elétrico conforme projeto executivo aprovado. Os serviços compreendem:',
      items: [
        'Instalação de 61 (sessenta e um) postes de concreto Duplo "T" tipo CAAA IV, adequados para aplicação em ambiente com risco de corrosão classe C5, conforme especificações técnicas e critérios estruturais definidos em projeto;',
        'Execução de aproximadamente 1.240 metros de rede de média tensão trifásica em 13,8 kV, utilizando cabo de alumínio nu CA 155,4 MCM, 7 fios, tipo Anaheim, incluindo lançamento, tensionamento, regulagem, conexões e montagem completa da rede aérea;',
        'Instalação de aproximadamente 2.150 metros de rede de baixa tensão com cabo de alumínio isolado XLPE 0,6/1 kV, configuração 3 x 1 x 70 mm² + 70 mm² neutro isolado, incluindo fixação, derivações, interligações elétricas, tensionamento e regulagem;',
        'Instalação de 05 (cinco) transformadores de distribuição trifásicos de 112,5 kVA, tensão primária 13,8 kV e secundária 220/127 V, padrão de aplicação para orla marítima;',
        'Instalação de 02 (dois) transformadores de distribuição trifásicos de 75 kVA, tensão primária 13,8 kV e secundária 220/127 V, padrão de aplicação para orla marítima;',
        'Fornecimento e instalação de ferragens leves em liga de alumínio, conforme especificações da concessionária Equatorial, atendendo integralmente aos requisitos da Norma Técnica NT.00008 — Revisão 03/2025;',
        'Instalação completa de isoladores, chaves fusíveis, para-raios, conectores, cruzetas, suportes, ancoragens e demais acessórios necessários à perfeita operação do sistema elétrico;',
        'Execução dos sistemas de aterramento das estruturas, transformadores e equipamentos, incluindo hastes, conectores e equalização de potencial conforme normas técnicas vigentes;',
        'Execução de testes elétricos, inspeções, energização e comissionamento final da rede de distribuição.',
      ],
      note: null,
      facts: [
        { label: 'postes de concreto Duplo T CAAA IV', quantity: 61, unit: 'un', isApproximate: false },
        { label: 'rede de média tensão 13,8 kV', quantity: 1240, unit: 'm', isApproximate: true },
        { label: 'rede de baixa tensão XLPE 0,6/1 kV', quantity: 2150, unit: 'm', isApproximate: true },
        { label: 'transformadores de 112,5 kVA', quantity: 5, unit: 'un', isApproximate: false },
        { label: 'transformadores de 75 kVA', quantity: 2, unit: 'un', isApproximate: false },
      ],
    },
    {
      order: 2,
      title: '2. Rede de iluminação pública',
      intro:
        'Execução completa do sistema de iluminação pública, contemplando fornecimento de materiais, instalação eletromecânica, interligações elétricas, testes operacionais e comissionamento do sistema de iluminação das vias internas do empreendimento. Os serviços compreendem:',
      items: [
        'Instalação de 60 (sessenta) luminárias públicas em LED 100 W, temperatura de cor 5000 K, proporcionando elevada eficiência luminosa, durabilidade e baixo consumo energético;',
        'Instalação de 07 (sete) braços curvos tipo cisne Ø 48 mm x 4.000 mm, destinados aos pontos de iluminação associados às estruturas dos transformadores;',
        'Instalação de 53 (cinquenta e três) braços curvos tipo cisne Ø 48 mm x 3.000 mm para os demais postes da rede de iluminação pública;',
        'Execução de 07 (sete) medições monofásicas instaladas em poste, conforme padrão da concessionária Equatorial e em conformidade com a Norma Técnica NT.023 — Revisão 03/2023;',
        'Instalação de circuito exclusivo e independente para alimentação da iluminação pública, utilizando aproximadamente 2.000 metros de cabo multiplexado tipo duplex AL+CAL/XLPE, configuração 1 x 1 x 35 mm² + 35 mm² neutro isolado;',
        'Execução das interligações elétricas entre luminárias e rede de alimentação, incluindo conectores, derivações, terminais, fixações e proteções;',
        'Instalação dos dispositivos de acionamento, proteção e controle da iluminação pública, conforme projeto executivo;',
        'Execução de testes operacionais, energização e comissionamento final do sistema de iluminação pública.',
      ],
      note: null,
      facts: [
        { label: 'luminárias públicas LED 100 W 5000 K', quantity: 60, unit: 'un', isApproximate: false },
        { label: 'braços curvos tipo cisne 4.000 mm', quantity: 7, unit: 'un', isApproximate: false },
        { label: 'braços curvos tipo cisne 3.000 mm', quantity: 53, unit: 'un', isApproximate: false },
        { label: 'medições monofásicas em poste', quantity: 7, unit: 'un', isApproximate: false },
        { label: 'cabo multiplexado duplex 1x1x35+35 mm²', quantity: 2000, unit: 'm', isApproximate: true },
      ],
    },
    {
      order: 3,
      title: '3. Estrutura civil para ramal subterrâneo',
      intro:
        'Execução das obras civis destinadas à implantação da infraestrutura subterrânea para passagem dos circuitos elétricos de ligação de lotes e sistemas complementares do condomínio, contemplando escavações, instalação de caixas de passagem, acomodação de eletrodutos e proteção mecânica por envelopamento de dutos das redes subterrâneas. Os serviços compreendem:',
      items: [
        'Fornecimento e instalação de 183 (cento e oitenta e três) caixas de passagem para energia, conforme especificações do Desenho 20 da Norma Técnica NT.00004 — Equatorial;',
        'Fornecimento e instalação de 181 (cento e oitenta e uma) caixas de passagem para dados nas dimensões 60 x 35 x 70 cm;',
        'Execução de abertura de valas com utilização de equipamentos próprios tipo mini escavadeira, destinadas à acomodação da infraestrutura subterrânea elétrica e de dados;',
        'Preparação, alinhamento e acomodação de eletrodutos conforme projeto executivo;',
        'Fornecimento e aplicação de concreto usinado para envelopamento e proteção mecânica dos dutos nas travessias de ruas e pontos críticos do empreendimento;',
        'Instalação de fita de advertência "RISCO ELETRICIDADE" ao longo das redes subterrâneas, conforme critérios de segurança e sinalização técnica;',
        'Fechamento de valas, compactação e recomposição das áreas intervenientes após execução da infraestrutura subterrânea;',
        'Adequação da infraestrutura conforme exigências técnicas da concessionária e normas vigentes.',
      ],
      note: {
        heading: 'Observação técnica importante',
        paragraphs: [
          'Não foram identificados em projeto os eletrodutos destinados às descidas dos ramais de entrada individuais dos lotes, bem como os eletrodutos destinados à infraestrutura de dados e telecomunicações. Dessa forma, o presente orçamento contempla adicionalmente os itens abaixo.',
          'Tal previsão foi considerada visando garantir a completa execução da infraestrutura subterrânea necessária ao adequado atendimento elétrico e de comunicação do empreendimento, uma vez que, após instalados o poste e a caixa, a instalação dos eletrodutos se torna significativamente mais difícil.',
        ],
        bullets: [
          'Fornecimento e instalação de eletrodutos de PVC rígido Ø 2 ½" para as descidas dos ramais de entrada de energia, considerando a quantidade total de lotes do empreendimento;',
          'Fornecimento e instalação de eletrodutos destinados à infraestrutura de dados e telecomunicações, dimensionados conforme a quantidade de postes previstos no projeto.',
        ],
      },
      facts: [
        { label: 'caixas de passagem para energia', quantity: 183, unit: 'un', isApproximate: false },
        { label: 'caixas de passagem para dados', quantity: 181, unit: 'un', isApproximate: false },
        { label: 'eletroduto PVC rígido Ø 2 ½"', quantity: 1240, unit: 'un', isApproximate: false },
      ],
    },
  ],

  materials,
  abc,

  billingConditions: {
    heading: null,
    paragraphs: [
      'Faturamento direto: os valores de materiais foram estimados na modalidade de pagamento à vista, com faturamento emitido diretamente do fornecedor para a Contratante. Ressalta-se que os preços de mercado sofrem oscilações semanais; portanto, o orçamento final estará sujeito a atualizações conforme as tabelas vigentes na data da efetiva compra.',
      'Flexibilidade de negociação: prazos, parcelamentos e demais condições comerciais poderão ser renegociados entre as partes (Contratante, Contratada e Fornecedores), adequando-se ao cronograma físico-financeiro da obra e às políticas dos fornecedores no ato da contratação.',
    ],
    bullets: [],
  },

  pricingOptions: [
    {
      savedPricingBudgetId: 'fixture-pricing-287-principal',
      label: 'Cenário principal',
      isRecommended: true,
      globals: { materialTotal, laborTotal, grandTotal },
      segments,
      paymentTerms,
      unitInvestment: {
        unitsCount: UNITS_COUNT,
        unitsLabel: 'lotes',
        amountPerUnit: round2(grandTotal / UNITS_COUNT),
      },
    },
  ],

  schedule: {
    columns: [
      { key: 'd01', label: '01 dia' },
      { key: 'd20', label: '20 dias' },
      { key: 'd60', label: '60 dias' },
      { key: 'd90', label: '90 dias' },
      { key: 'd270', label: '270 dias' },
    ],
    rows: [
      { order: 1, stage: 'Assinatura do contrato', marks: { d01: true } },
      { order: 2, stage: 'Elaboração do projeto executivo', marks: { d20: true } },
      { order: 3, stage: 'Aprovação junto à concessionária', marks: { d60: 'Projeto aprovado' } },
      { order: 4, stage: 'Mobilização de materiais', marks: { d90: true } },
      { order: 5, stage: 'Início da execução', marks: { d90: true } },
      { order: 6, stage: 'Comissionamento e energização', marks: { d270: true } },
    ],
    footnote:
      'Os prazos do cronograma executivo estão condicionados à conclusão da obra civil (valas, bases e caixas) e à emissão da carta de aprovação pela concessionária.',
  },

  responsibilityMatrix: [
    { order: 1, description: 'Fornecimento de eletrodutos e envelopamento em concreto', responsible: 'contratante' },
    { order: 2, description: 'Construção de bases (transformadores e postes) e caixas de passagem', responsible: 'contratante' },
    { order: 3, description: 'Lançamento de cabos de potência (MT/BT) e iluminação', responsible: 'contratada' },
    { order: 4, description: 'Montagem de terminações, conexões e acessórios de estanqueidade', responsible: 'contratada' },
    { order: 5, description: 'Ensaio de tensão aplicada (VLF)', responsible: 'contratada' },
    { order: 6, description: 'Instalação e interligação de transformadores e QDPs', responsible: 'contratada' },
    { order: 7, description: 'Fiscalização técnica e orientação da infraestrutura civil', responsible: 'contratada' },
    { order: 8, description: 'Pagamento de fretes de materiais e equipamentos', responsible: 'contratante' },
    { order: 9, description: 'Gestão e administração dos recebimentos (logística)', responsible: 'contratada' },
    { order: 10, description: 'Execução de ensaios (VLF / aterramento) e as-built', responsible: 'contratada' },
    { order: 11, description: 'Recomposição de pavimentação e acabamentos civis', responsible: 'contratante' },
    { order: 12, description: 'Interface com a concessionária de energia', responsible: 'ambos' },
    { order: 13, description: 'Carga e descarga de materiais', responsible: 'contratante' },
    { order: 14, description: 'Alimentação da equipe executiva', responsible: 'contratada' },
    { order: 15, description: 'Acomodação da equipe executiva (hospedagem)', responsible: 'contratada' },
    { order: 16, description: 'Ponto de energia, água e banheiro químico no canteiro', responsible: 'contratante' },
  ],

  finalConsiderations: [
    {
      heading: null,
      paragraphs: [
        'O presente escopo contempla o fornecimento de materiais, equipamentos, infraestrutura e mão de obra especializada necessários para execução completa da infraestrutura elétrica e civil conforme padrões técnicos aplicáveis da concessionária local, normas vigentes da ABNT e os projetos apresentados.',
        'Todos os serviços serão executados por profissionais habilitados e capacitados, obedecendo rigorosamente às exigências de segurança da NR-10, às normas técnicas da concessionária de energia e às boas práticas de engenharia elétrica.',
        'Todos os materiais e equipamentos empregados na execução das obras deverão ser estritamente novos, de primeira linha e certificados pelos órgãos competentes. É requisito mandatório que todos os componentes sejam homologados junto à concessionária, garantindo total compatibilidade com os padrões técnicos e a aprovação na vistoria final.',
        'Dada a localização do empreendimento em região de orla marítima, a especificação prioriza materiais com elevado grau de proteção e resistência à corrosão galvânica e ao ataque salino. Essa escolha visa assegurar a confiabilidade operacional, a segurança e a máxima durabilidade dos ativos, mitigando custos precoces com manutenção decorrentes das severas condições de intempéries da zona costeira.',
      ],
      bullets: [
        'Já consideradas cruzetas de fibra, conforme padrão atual da concessionária;',
        'Já considerado cabo de alumínio CA 155,4 MCM, 7 fios, tipo Anaheim, padrão atual da concessionária.',
      ],
    },
    {
      heading: 'A contratada será responsável por',
      paragraphs: [],
      bullets: [
        'Fornecimento de ART;',
        'Execução conforme projeto elétrico, de iluminação e civil;',
        'Montagem eletromecânica completa;',
        'Aterramentos;',
        'Testes elétricos;',
        'Energização;',
        'Comissionamento do sistema;',
        'Adequações necessárias para atendimento às exigências da concessionária.',
      ],
    },
    {
      heading: 'Não estão inclusos neste escopo',
      paragraphs: [],
      bullets: [
        'Taxas da concessionária;',
        'Projetos executivos complementares e aprovação de projetos elétricos;',
        'Licenciamentos;',
        'Adequações civis não especificadas;',
        'Reforços em estruturas existentes;',
        'Pavimentações especiais;',
        'Recomposição de acabamentos nobres;',
        'Procedimentos de orçamento de alterações em via pública e conexão com a concessionária;',
        'Infraestrutura de alojamento e segurança para materiais no canteiro;',
        'Serviços não explicitamente descritos neste documento.',
      ],
    },
    {
      heading: 'Premissas de projeto',
      paragraphs: [
        'Os quantitativos apresentados foram estimados com base nas informações atualmente disponíveis. Eventuais alterações de percurso, interferências civis, adequações exigidas em campo ou aumento de metragem do ramal subterrâneo deverão ser previamente avaliados e poderão gerar revisão de custos mediante aditivo contratual.',
        'Este orçamento baseia-se em projeto técnico pendente de aprovação final pela concessionária. Portanto, quantitativos e materiais podem sofrer ajustes caso surjam novas exigências técnicas para o ambiente de orla marítima ou no projeto executivo.',
        'Após a conclusão dos serviços, a instalação deverá ser entregue em pleno funcionamento, testada e apta para solicitação de ligação definitiva junto à concessionária de energia.',
      ],
      bullets: [
        'NR-10;',
        'NBR 14039;',
        'NBR 5410;',
        'Padrões construtivos da concessionária;',
        'Exigências técnicas e de segurança aplicáveis às instalações de média e baixa tensão.',
      ],
    },
  ],

  acceptance: {
    closingText:
      'Agradecemos a oportunidade de apresentar nossa proposta técnica e comercial para o Condomínio Residencial Cyano Private Resort. Nosso compromisso é entregar uma infraestrutura de energia e iluminação que alie segurança normativa, eficiência tecnológica e a durabilidade necessária para o ambiente de orla. Estamos à disposição para eventuais ajustes técnicos e esperamos contribuir para a viabilização deste empreendimento de excelência.',
  },
};

/**
 * Variante propositalmente quebrada: a Curva C recebe o valor da Curva B, que é
 * exatamente o erro que a proposta 163.4 (Maxif4) levou ao cliente.
 * Serve para provar que a validação barra o documento antes de renderizar.
 */
export function makeBrokenAbcFixture(): ProposalData {
  const totals = andoraProposalFixture.abc.totals.map((total) =>
    total.curve === 'C'
      ? {
          ...total,
          amount: andoraProposalFixture.abc.totals.find((t) => t.curve === 'B')?.amount ?? total.amount,
        }
      : total,
  );
  return {
    ...andoraProposalFixture,
    abc: { ...andoraProposalFixture.abc, totals },
  };
}
