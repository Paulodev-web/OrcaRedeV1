/**
 * `responseSchema` de cada etapa.
 *
 * Segue o padrão mais robusto já usado no projeto — `SchemaType` tipado, como em
 * `scripts/classify-materials-subgroups.mjs` — em vez de descrever o JSON em
 * prosa dentro do prompt, que é o que `geminiSupplierQuote.ts` e
 * `semanticMatch.ts` ainda fazem. Com schema, o modelo não tem como devolver
 * markdown em volta nem inventar chave.
 *
 * `required` está preenchido em todos os objetos: campo faltando vira `undefined`
 * silencioso no parse, e um bloco institucional ausente só apareceria na hora de
 * gerar o PDF.
 */

import { SchemaType, type ResponseSchema, type Schema } from '@google/generative-ai';

/** `ProposalRichBlock` do contrato canônico. */
export const RICH_BLOCK_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  description:
    'Bloco de texto estruturado. Parágrafos e bullets separados — o motor de PDF pagina cada elemento.',
  properties: {
    heading: {
      type: SchemaType.STRING,
      description: 'Título do bloco. String vazia quando o bloco não tem título.',
    },
    paragraphs: {
      type: SchemaType.ARRAY,
      description: 'Um parágrafo por elemento, texto corrido, sem quebra interna.',
      items: { type: SchemaType.STRING },
    },
    bullets: {
      type: SchemaType.ARRAY,
      description: 'Um item de lista por elemento, sem marcador nem numeração.',
      items: { type: SchemaType.STRING },
    },
  },
  required: ['heading', 'paragraphs', 'bullets'],
};

/**
 * Etapa 1 — capa.
 *
 * `projectSubtitle` é string (vazia quando não há nome comercial) em vez de
 * nullable: a API do Gemini é mais confiável com ausência representada por
 * string vazia do que com `null` em campo de topo. A normalização para `null`
 * acontece no parse.
 */
export const COVER_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    projectTitle: {
      type: SchemaType.STRING,
      description: 'Título do empreendimento na capa, caixa alta, até 12 palavras.',
    },
    projectSubtitle: {
      type: SchemaType.STRING,
      description:
        'Nome comercial do empreendimento. String vazia quando não houver — nunca inventar.',
    },
  },
  required: ['projectTitle', 'projectSubtitle'],
};

/** Etapa 2 — institucional. */
export const INSTITUTIONAL_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    quemSomos: RICH_BLOCK_SCHEMA,
    identidade: RICH_BLOCK_SCHEMA,
    compromisso: RICH_BLOCK_SCHEMA,
    diferencialOrcaRede: RICH_BLOCK_SCHEMA,
  },
  required: ['quemSomos', 'identidade', 'compromisso', 'diferencialOrcaRede'],
};

/**
 * Etapa 3 — um grupo de atividades.
 *
 * `facts` não está no schema de propósito: os quantitativos são do sistema. O
 * modelo não os devolve, não os confirma e não tem como alterá-los.
 */
export const ACTIVITY_GROUP_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    title: {
      type: SchemaType.STRING,
      description: 'Nome do grupo, sem numeração.',
    },
    intro: {
      type: SchemaType.STRING,
      description:
        'Parágrafo único de abertura, sem quantitativo, terminando em "Os serviços compreendem:".',
    },
    items: {
      type: SchemaType.ARRAY,
      description: 'Uma linha de escopo por elemento.',
      items: { type: SchemaType.STRING },
    },
    hasNote: {
      type: SchemaType.BOOLEAN,
      description: 'true somente quando houver OBSERVAÇÃO OBRIGATÓRIA a redigir.',
    },
    note: RICH_BLOCK_SCHEMA,
  },
  required: ['title', 'intro', 'items', 'hasNote', 'note'],
};

/** Etapa 4 — comercial. */
export const COMMERCIAL_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    billingConditions: RICH_BLOCK_SCHEMA,
    scheduleFootnote: {
      type: SchemaType.STRING,
      description: 'Frase única de rodapé do cronograma. Sem número, sem prazo.',
    },
    acceptanceClosingText: {
      type: SchemaType.STRING,
      description: 'Parágrafo único de fechamento, 3 a 5 frases, sem despedida.',
    },
  },
  required: ['billingConditions', 'scheduleFootnote', 'acceptanceClosingText'],
};

/** Etapa 5 — considerações finais. */
export const CONSIDERATIONS_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    finalConsiderations: {
      type: SchemaType.ARRAY,
      description: 'Os seis blocos, na ordem definida nas instruções.',
      items: RICH_BLOCK_SCHEMA,
      minItems: 1,
    },
  },
  required: ['finalConsiderations'],
};

/** Refinamento por bloco — entra e sai um `ProposalRichBlock`. */
export const REFINE_BLOCK_SCHEMA: ResponseSchema = RICH_BLOCK_SCHEMA;

/**
 * Sugestão de mídia por tag.
 *
 * `tag` é enum fechado montado a partir do vocabulário real da biblioteca —
 * mesma técnica de `MATERIAL_SUBGROUPS` no script de classificação de
 * subgrupos, onde o enum no schema é o que impede rótulo inventado.
 */
export function buildMediaTagsSchema(availableTags: string[]): ResponseSchema {
  return {
    type: SchemaType.OBJECT,
    properties: {
      suggestions: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            tag: {
              type: SchemaType.STRING,
              format: 'enum',
              enum: availableTags,
              description: 'Exatamente uma das tags do vocabulário fornecido.',
            },
            confidence: {
              type: SchemaType.INTEGER,
              description: '0 a 100.',
            },
            rationale: {
              type: SchemaType.STRING,
              description: 'Uma frase ligando a tag ao conteúdo da seção.',
            },
          },
          required: ['tag', 'confidence', 'rationale'],
        },
      },
    },
    required: ['suggestions'],
  };
}
