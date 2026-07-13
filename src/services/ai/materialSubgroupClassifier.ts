import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { MATERIAL_SUBGROUPS, type MaterialSubgroup } from '@/types';

/** Tamanho padrão de lote enviado ao Gemini por chamada de classificação. */
export const DEFAULT_SUBGROUP_CLASSIFY_BATCH_SIZE = 30;

/** Confiança mínima para aceitar a classificação sugerida pela IA; abaixo disso o material fica sem subgrupo (null) para revisão manual. */
export const SUBGROUP_CLASSIFY_CONFIDENCE_THRESHOLD = 70;

export function getSubgroupClassifyGeminiModel(): string {
  return process.env.MATERIAL_SUBGROUP_GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
}

export interface MaterialToClassify {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  unit: string;
}

export interface MaterialSubgroupClassification {
  id: string;
  subgroup: MaterialSubgroup;
  confidence: number;
}

export interface ClassifyMaterialsResult {
  success: boolean;
  classifications: MaterialSubgroupClassification[];
  error?: string;
}

const SYSTEM_PROMPT = `Você é um engenheiro eletricista especialista em materiais de redes de distribuição de energia elétrica (postes, cabos, ferragens, isoladores). Sua tarefa é classificar cada material do catálogo em exatamente um dos subgrupos abaixo, com base no código, nome/descrição e unidade.

Subgrupos disponíveis e seus critérios:
- POSTE: postes de concreto, madeira, fibra ou aço, e acessórios exclusivos de poste (ex: sapata de poste).
- AMARRAÇÃO: arames de amarração, fitas/cintas de amarração de cabo em isolador ou cruzeta.
- PRÉ FORMADO: conjuntos pré-formados de ancoragem, suspensão ou derivação para cabos (alça pré-formada, distanciador pré-formado).
- CIVIL: materiais de obra civil - concreto, cimento, brita, areia, tubos de PVC/concreto, blocos, guias, calçada.
- FERRAGEM: ferragens genéricas de fixação e sustentação - parafusos, porcas, arruelas, cantoneiras, suportes metálicos, mão-francesa, olhal, sextavado. Use FERRAGEM quando não houver categoria mais específica.
- POLIMÉRICO: isoladores e espaçadores POLIMÉRICOS (material polimérico/resina), inclusive itens de rede compacta protegida.
- ILUMINAÇÃO: luminárias, lâmpadas, relés fotoelétricos, braços e projetores de iluminação pública.
- CONDUTOR: cabos e fios condutores de energia - CA, CAA, cobre nu, multiplexado, XLPE, coberto.
- ATERRAMENTO: hastes de aterramento, conectores de aterramento, cabo de cobre nu para malha de terra, caixa de inspeção de aterramento.
- PROTEÇÃO: equipamentos de proteção elétrica - para-raios, chave fusível, elo fusível, disjuntor, religador.
- CONEXÃO: conectores e terminais de emenda ou derivação de cabo (conector cunha, terminal, luva de emenda, conector perfurante) - não confundir com CONDUTOR (o cabo em si) nem com ATERRAMENTO (conectores específicos de aterramento vão em ATERRAMENTO).
- CABO DE AÇO: cabo de aço mensageiro/sustentação (não é o condutor de energia).
- CRUZETA: cruzetas de madeira, concreto ou polimérica.
- ISOLAÇÃO: isoladores de porcelana ou vidro (isoladores poliméricos vão em POLIMÉRICO, não aqui).
- OUTROS: use apenas quando o material claramente não se encaixa em nenhum subgrupo acima.

Regras:
- Escolha exatamente um subgrupo por material da lista fornecida.
- Atribua confidence de 0 a 100 (inteiro) refletindo a certeza da classificação.
- Se houver dúvida entre dois subgrupos, escolha o mais específico e reduza o confidence.
- Nunca invente um subgrupo fora da lista fornecida.
- Classifique TODOS os materiais recebidos, um resultado por id.`;

function buildPrompt(materials: MaterialToClassify[]): string {
  const materiaisBlock = materials
    .map(
      (m) =>
        `- id: ${m.id} | código: ${m.code} | "${m.name}"${m.description ? ` | descrição: "${m.description}"` : ''} | unidade: ${m.unit}`
    )
    .join('\n');

  return `${SYSTEM_PROMPT}

---

## Materiais a classificar:
${materiaisBlock}`;
}

function validateClassifications(
  raw: unknown,
  validIds: Set<string>
): MaterialSubgroupClassification[] {
  if (!Array.isArray(raw)) return [];

  const subgroupSet = new Set<string>(MATERIAL_SUBGROUPS);
  const results: MaterialSubgroupClassification[] = [];
  const seenIds = new Set<string>();

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;

    const e = entry as Record<string, unknown>;
    const id = String(e.id ?? '');
    const subgroup = String(e.subgroup ?? '');
    const confidence = Math.round(Number(e.confidence));

    if (!id || !validIds.has(id)) continue;
    if (seenIds.has(id)) continue;
    if (!subgroupSet.has(subgroup)) continue;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) continue;

    seenIds.add(id);
    results.push({ id, subgroup: subgroup as MaterialSubgroup, confidence });
  }

  return results;
}

/** Classifica um lote de materiais em subgrupos via Gemini. O chamador é responsável por dividir listas grandes em lotes (ver DEFAULT_SUBGROUP_CLASSIFY_BATCH_SIZE). */
export async function classifyMaterialSubgroupsBatch(
  materials: MaterialToClassify[]
): Promise<ClassifyMaterialsResult> {
  if (materials.length === 0) {
    return { success: true, classifications: [] };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, classifications: [], error: 'Chave da API Gemini não configurada no servidor.' };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: getSubgroupClassifyGeminiModel(),
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.STRING },
            subgroup: { type: SchemaType.STRING, format: 'enum', enum: [...MATERIAL_SUBGROUPS] },
            confidence: { type: SchemaType.INTEGER },
          },
          required: ['id', 'subgroup', 'confidence'],
        },
      },
      temperature: 0.1,
    },
  });

  const prompt = buildPrompt(materials);

  let responseText: string;
  try {
    const result = await model.generateContent(prompt);
    responseText = result.response.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro na chamada à IA.';
    return { success: false, classifications: [], error: `Gemini: ${message}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return { success: false, classifications: [], error: 'A IA retornou um formato JSON inválido para a classificação de subgrupos.' };
  }

  const validIds = new Set(materials.map((m) => m.id));
  const classifications = validateClassifications(parsed, validIds);

  return { success: true, classifications };
}

/** Divide um array em lotes de tamanho fixo. */
export function chunkMaterials<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
