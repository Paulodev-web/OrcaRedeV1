/**
 * Fixture de entrada — reconstrução da proposta 287.1 (ANDORA CONSTRUÇÕES LTDA,
 * Osório/RS, concessionária Equatorial), a partir do PDF real que a ON enviou.
 *
 * Serve para dois propósitos:
 *
 * 1. Rodar a geração de verdade contra dados de verdade
 *    (`dev/runProposalDraft.mjs`) e conferir a saída à mão.
 *
 * 2. Ser um caso de teste do guardrail com os erros originais embutidos nos
 *    dados. Os quantitativos aqui são os do orçamento; a proposta impressa
 *    escreveu "05 (seis) transformadores" para o fato de 5 unidades. Se a
 *    geração repetir o erro, `numberGuard` reprova — foi contra este caso que a
 *    checagem de concordância foi calibrada.
 *
 * Os valores em real da peça original NÃO estão aqui, de propósito: dinheiro não
 * entra no prompt (ver o cabeçalho de `types.ts`).
 */

import type { ProposalDraftInput } from '../types';

export const ANDORA_DRAFT_INPUT: ProposalDraftInput = {
  project: {
    workType:
      'Infraestrutura elétrica e civil de condomínio residencial — redes de MT/BT, subestações transformadoras, iluminação pública e ramais subterrâneos',
    city: 'Osório',
    state: 'RS',
    developmentName: 'Cyano Private Resort',
    clientName: 'ANDORA CONSTRUÇÕES LTDA.',
    utility: 'Equatorial',
    scopeLabel: 'TIPO DE ESCOPO',
    environmentConstraints:
      'Empreendimento em região de orla marítima: ambiente com risco de corrosão classe C5, exigindo materiais com elevado grau de proteção contra corrosão galvânica e ataque salino.',
    authorNotes:
      'Projeto técnico datado de outubro de 2023, ainda pendente de carta de aprovação da CEEE / Equatorial. Cruzetas de fibra e cabo CA 155,4 MCM tipo Anaheim já considerados conforme padrão atual da concessionária.',
  },

  company: {
    legalName: 'PORTO SERVIÇOS ELÉTRICOS LTDA',
    tradeName: 'ON Engenharia',
    cnpj: '40.258.369/0001-13',
    address: 'VL Arroio Grande / Ibirubá - RS',
    phonePrimary: '(55) 9 9133-7296',
    phoneSecondary: '(54) 9 9129-6181',
    email: 'contato@onengenhariaeletrica.com.br',
    website: 'https://www.onengenhariaeletrica.com.br',
    instagram: '@onengenhariaeletrica',
    whatsappNumber: '+5555991337296',
    logoUrl: null,
  },

  responsible: {
    fullName: 'Eng. Luan Stefanello Pianesso',
    crea: 'CREA/RS: 278122',
    signatureUrl: null,
  },

  // Só estas normas podem ser citadas. Código fora da lista é reprovado pela
  // camada L6 do guardrail — é o que impede a IA de inventar "NT.00012".
  technicalReferences: [
    {
      code: 'NT.00004',
      issuer: 'Equatorial',
      subject:
        'Redes de distribuição — caixas de passagem para energia (Desenho 20)',
      revision: null,
    },
    {
      code: 'NT.00008',
      issuer: 'Equatorial',
      subject: 'Ferragens em liga de alumínio para redes de distribuição',
      revision: 'Revisão 03/2025',
    },
    {
      code: 'NT.023',
      issuer: 'Equatorial',
      subject: 'Medições monofásicas instaladas em poste',
      revision: 'Revisão 03/2023',
    },
    {
      code: 'NBR 5410',
      issuer: 'ABNT',
      subject: 'Instalações elétricas de baixa tensão',
      revision: null,
    },
    {
      code: 'NBR 14039',
      issuer: 'ABNT',
      subject: 'Instalações elétricas de média tensão de 1,0 kV a 36,2 kV',
      revision: null,
    },
    {
      code: 'NR-10',
      issuer: 'MTE',
      subject: 'Segurança em instalações e serviços em eletricidade',
      revision: null,
    },
  ],

  activityGroups: [
    {
      order: 1,
      suggestedTitle:
        'Rede de Distribuição em Média e Baixa Tensão com Transformadores e Rede Subterrânea',
      segmentLabel: 'Rede Energia',
      facts: [
        {
          label:
            'postes de concreto Duplo "T" tipo CAAA IV, adequados para ambiente com risco de corrosão classe C5',
          quantity: 61,
          unit: 'unidades',
          isApproximate: false,
        },
        {
          label:
            'rede de média tensão trifásica em 13,8 kV com cabo de alumínio nu CA 155,4 MCM, 7 fios, tipo Anaheim',
          quantity: 1240,
          unit: 'metros',
          isApproximate: true,
        },
        {
          label:
            'rede de baixa tensão com cabo de alumínio isolado XLPE 0,6/1 kV, configuração 3 x 1 x 70 mm² + 70 mm² neutro isolado',
          quantity: 2150,
          unit: 'metros',
          isApproximate: true,
        },
        {
          // O caso que gerou a regra: a peça impressa escreveu "05 (seis)".
          label:
            'transformadores de distribuição trifásicos de 112,5 kVA, tensão primária 13,8 kV e secundária 220/127 V, padrão para orla marítima',
          quantity: 5,
          unit: 'unidades',
          isApproximate: false,
        },
        {
          label:
            'transformadores de distribuição trifásicos de 75 kVA, tensão primária 13,8 kV e secundária 220/127 V, padrão para orla marítima',
          quantity: 2,
          unit: 'unidades',
          isApproximate: false,
        },
      ],
      mandatoryNote: null,
    },
    {
      order: 2,
      suggestedTitle: 'Rede de Iluminação Pública',
      segmentLabel: 'Rede Iluminação',
      facts: [
        {
          label: 'luminárias públicas em LED 100W, temperatura de cor 5000K',
          quantity: 60,
          unit: 'unidades',
          isApproximate: false,
        },
        {
          label:
            'braços curvos tipo cisne Ø48 mm x 4.000 mm para os pontos de iluminação associados às estruturas dos transformadores',
          quantity: 7,
          unit: 'unidades',
          isApproximate: false,
        },
        {
          label:
            'braços curvos tipo cisne Ø48 mm x 3.000 mm para os demais postes da rede de iluminação pública',
          quantity: 53,
          unit: 'unidades',
          isApproximate: false,
        },
        {
          label: 'medições monofásicas instaladas em poste, padrão da concessionária',
          quantity: 7,
          unit: 'unidades',
          isApproximate: false,
        },
        {
          label:
            'circuito exclusivo de alimentação da iluminação pública em cabo multiplexado duplex AL+CAL/XLPE, configuração 1 x 1 x 35 mm² + 35 mm² neutro isolado',
          quantity: 2000,
          unit: 'metros',
          isApproximate: true,
        },
      ],
      mandatoryNote: null,
    },
    {
      order: 3,
      suggestedTitle: 'Estrutura Civil para Ramal Subterrâneo',
      segmentLabel: 'Ramais de Ligação + Lógica',
      facts: [
        {
          label: 'caixas de passagem para energia conforme Desenho 20 da NT.00004',
          quantity: 183,
          unit: 'unidades',
          isApproximate: false,
        },
        {
          label: 'caixas de passagem para dados nas dimensões 60 x 35 x 70 cm',
          quantity: 181,
          unit: 'unidades',
          isApproximate: false,
        },
      ],
      mandatoryNote:
        'Não foram identificados em projeto os eletrodutos destinados às descidas dos ramais de entrada individuais dos lotes, nem os eletrodutos destinados à infraestrutura de dados e telecomunicações. O presente orçamento contempla adicionalmente o fornecimento e a instalação de eletrodutos de PVC rígido Ø 2 ½" para as descidas dos ramais de entrada de energia, considerando a quantidade total de lotes do empreendimento, e de eletrodutos destinados à infraestrutura de dados e telecomunicações, dimensionados conforme a quantidade de postes prevista em projeto. A previsão foi considerada porque, uma vez instalados poste e caixa, a instalação posterior dos eletrodutos fica significativamente mais difícil.',
    },
  ],

  materialSubgroups: [
    { subgroup: 'CIVIL', itemCount: 14 },
    { subgroup: 'CONDUTOR', itemCount: 9 },
    { subgroup: 'TRANSFORMADOR', itemCount: 2 },
    { subgroup: 'POSTE', itemCount: 4 },
    { subgroup: 'ELETRODUTOS', itemCount: 6 },
    { subgroup: 'FERRAGEM ALUMÍNIO', itemCount: 21 },
    { subgroup: 'PROTEÇÃO PARA ORLA', itemCount: 8 },
    { subgroup: 'LUMINÁRIA', itemCount: 3 },
    { subgroup: 'CRUZETA', itemCount: 5 },
    { subgroup: 'ISOLADOR PORCELANA', itemCount: 4 },
    { subgroup: 'CONEXÃO', itemCount: 12 },
    { subgroup: 'PRÉ FORMADO', itemCount: 7 },
    { subgroup: 'ATERRAMENTO', itemCount: 6 },
    { subgroup: 'MEDIÇÃO', itemCount: 3 },
  ],

  commercial: {
    materialsBilledDirectlyBySupplier: true,
    installmentsApplyToLaborOnly: true,
    hasDownPayment: true,
    unitsLabel: 'lotes',
    commercialFacts: [
      {
        label: 'parcelas do valor de serviço, sendo a primeira a entrada',
        quantity: 10,
        unit: 'parcelas',
        isApproximate: false,
      },
      {
        label: 'lotes do empreendimento para rateio do investimento',
        quantity: 173,
        unit: 'lotes',
        isApproximate: false,
      },
    ],
  },

  template: {
    institutionalText: `QUEM SOMOS
Somos uma empresa dedicada a transformar o cenário da infraestrutura elétrica, unindo capacidade técnica e responsabilidade socioambiental. Atuamos com foco na entrega de resultados sólidos, como demonstrado em nossa gestão de projetos de loteamentos particulares, onde a eficiência na alocação de recursos e a transparência financeira são as bases do nosso sucesso.

NOSSA IDENTIDADE
Acreditamos que a energia é o motor do desenvolvimento, e por isso fundamentamos nossa atuação em três pilares essenciais:
Visão: Oferecer soluções inovadoras e eficientes, para suprir as necessidades energéticas de nossos clientes.
Missão: Possibilitar o acesso a energia limpa e renovável de forma acessível e personalizada para os nossos clientes, segura para a preservação do meio ambiente e para a construção de uma sociedade mais sustentável.
Valores: Atuamos com ética e transparência nas relações comerciais e com a sociedade. Prezamos pelo respeito ao meio ambiente, pela valorização de nossos colaboradores e pelo atendimento aos clientes com excelência e comprometimento.

COMPROMISSO COM A QUALIDADE
Entendemos que uma obra de infraestrutura elétrica exige precisão. No gerenciamento de nossos projetos, mantemos um controle rigoroso sobre os custos de materiais e logística, garantindo que o resultado final reflita a qualidade técnica esperada.
Para nós, o sucesso é resultado da escolha de produtos de alta qualidade. Por isso, trabalhamos em conjunto com parceiros e empresas líderes de mercado para garantir que cada quilômetro de rede construída seja sinônimo de segurança e durabilidade.`,

    orcaRedeText: `DIFERENCIAL TECNOLÓGICO: SISTEMA ORÇAREDE
A ON Engenharia entende que a precisão técnica e a confiança do cliente são os pilares de uma obra bem-sucedida. Por isso, desenvolvemos o OrçaRede, um software próprio e exclusivo que revoluciona a forma como planejamos e entregamos nossos projetos elétricos.

O Que é o OrçaRede? É o nosso sistema único de gerenciamento de obra e acompanhamento do cliente. Diferente de processos manuais, o OrçaRede integra todas as etapas da engenharia em uma plataforma digital robusta.

Benefícios para o Seu Projeto
Precisão Cirúrgica no Orçamento: O sistema possui um algoritmo avançado que inibe erros na listagem de materiais, garantindo que o que foi orçado seja exatamente o necessário para a execução.
Redução de Desperdícios: Através do controle rigoroso de insumos, otimizamos custos e evitamos compras desnecessárias ou faltas de última hora.
Padronização Técnica: Todo o conhecimento de engenharia da ON está embarcado no software, garantindo que cada projeto siga as normas vigentes.

O Cliente no Controle: Dashboard Exclusivo
Acreditamos na transparência total. Ao contratar a ON Engenharia, o cliente recebe um link dedicado para acompanhar sua obra em tempo real.
Acompanhamento Visual: Gráficos de progresso executivo e fotos da obra.
Cronograma Atualizado: Saiba exatamente em que fase a equipe de campo está trabalhando.
Relatórios em Tempo Real: Acesso direto aos dados que importam para a sua tomada de decisão.
Documentos da equipe executora: Acesso a documentos dos colaboradores, contrato de trabalho e fichas de EPI, ASO e afins.

Por que escolher a ON Engenharia? Enquanto o mercado utiliza planilhas genéricas, nós utilizamos tecnologia proprietária. O OrçaRede não é apenas uma ferramenta de cálculo: é a nossa garantia de que sua obra elétrica será entregue com zero erro de material e visibilidade total.`,

    billingConditionsText: `CONDIÇÕES DE FATURAMENTO E NEGOCIAÇÃO DE MATERIAIS
Faturamento Direto: Os valores de materiais foram estimados na modalidade de pagamento à vista, com faturamento emitido diretamente do fornecedor para a Contratante. Ressalta-se que os preços de mercado sofrem oscilações semanais; portanto, o orçamento final estará sujeito a atualizações conforme as tabelas vigentes na data da efetiva compra.
Flexibilidade de Negociação: Prazos, parcelamentos e demais condições comerciais poderão ser renegociados entre as partes (Contratante, Contratada e Fornecedores), adequando-se ao cronograma físico-financeiro da obra e às políticas dos fornecedores no ato da contratação.`,

    contractorResponsibilities: [
      'fornecimento de ART',
      'execução conforme projeto elétrico, de iluminação e civil',
      'montagem eletromecânica completa',
      'execução dos sistemas de aterramento',
      'testes elétricos',
      'energização',
      'comissionamento do sistema',
      'adequações necessárias para atendimento às exigências da concessionária',
    ],

    exclusions: [
      'taxas da concessionária',
      'projetos executivos complementares e aprovação de projetos elétricos',
      'licenciamentos',
      'adequações civis não especificadas',
      'reforços estruturais existentes',
      'pavimentações especiais',
      'recomposição de acabamentos nobres',
      'serviços não explicitamente descritos neste documento',
      'procedimentos de orçamento de alterações em via pública e conexão com a concessionária',
      'infraestrutura de alojamento e segurança para materiais no canteiro',
    ],
  },
};

/**
 * Variante mínima — um grupo, dois fatos. Útil para iterar em prompt sem gastar
 * o custo do rascunho completo.
 */
export const ANDORA_DRAFT_INPUT_MINIMAL: ProposalDraftInput = {
  ...ANDORA_DRAFT_INPUT,
  activityGroups: [ANDORA_DRAFT_INPUT.activityGroups[2]],
};
