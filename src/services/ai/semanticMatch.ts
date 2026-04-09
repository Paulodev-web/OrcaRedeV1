import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  UnconciliatedItem,
  SystemMaterial,
  SemanticMatchSuggestionPayload,
  SemanticMatchResult,
} from '@/types/supplierExtract';

const SYSTEM_PROMPT = `Você é um Engenheiro de Custos E Engenheiro Eletricista especialista em orçamentos de construção e redes elétricas. Sua tarefa é parear itens de uma cotação de fornecedor com a lista de materiais internos do sistema.

Para cada item do fornecedor, encontre o material interno mais provável e determine o fator de conversão de unidades.

Regras de conversão:
- Se o fornecedor vende "Rolo 100m" e o sistema pede "Metro", o fator é 100.
- Se o fornecedor vende "Caixa c/ 50 unidades" e o sistema pede "Unidade", o fator é 50.
- Se as unidades já são iguais, o fator é 1.
- O fator deve ser sempre > 0.

Regras de pareamento:
- Considere variações de nomenclatura, abreviações e sinônimos comuns do setor.
- Se não houver correspondência confiável, NÃO inclua o item no resultado.
- Atribua um confidenceScore de 0 a 100 (inteiro) que reflita a certeza do pareamento.

=== REGRAS CRÍTICAS DE EXCLUSÃO (GUARDRAILS ELÉTRICOS) ===
ATUE COMO UM ENGENHEIRO ELETRICISTA. É ESTRITAMENTE PROIBIDO fazer match entre materiais que tenham divergência técnica. As regras abaixo são INVIOLÁVEIS:

1. TENSÃO: Nunca vincule um material de Baixa Tensão (ex: 750V, 1kV) com Média/Alta Tensão (ex: 15kV, 25kV, 35kV). São classes de isolamento completamente distintas.

2. ISOLAMENTO: Nunca vincule PVC com XLPE ou EPR. Esses isolamentos indicam aplicações e faixas de tensão incompatíveis.

3. TIPO DE CONDUTOR: Nunca vincule "Flexível" com "Rígido", "Nu", "Protegido" ou "Coberto". São tipos de cabos com aplicações distintas.

4. Se a bitola (ex: 16mm²) for igual, mas a Tensão OU o Isolamento divergirem, o match é INVÁLIDO. O confidenceScore deve ser ZERO e o item NÃO deve ser retornado na lista.

5. Na dúvida entre parear com divergência técnica ou não parear, NÃO pareie. A ausência de match é preferível a um falso positivo técnico.
=== FIM DOS GUARDRAILS ===

Retorne APENAS um array JSON válido (sem markdown, sem texto fora do JSON). Cada elemento:
{
  "supplierItemId": "<id do item do fornecedor>",
  "materialId": "<id do material interno>",
  "conversionFactor": <número>,
  "confidenceScore": <0-100>,
  "rationale": "<explicação curta da correspondência e fator>"
}

Se nenhum item puder ser pareado, retorne um array vazio [].`;

function buildPrompt(
  unconciliatedItems: UnconciliatedItem[],
  systemMaterials: SystemMaterial[],
  supplierName: string
): string {
  const itemsBlock = unconciliatedItems
    .map(
      (it) =>
        `- id: ${it.id} | "${it.descricao}" | unidade: ${it.unidade} | preço: ${it.preco_unit}`
    )
    .join('\n');

  const materialsBlock = systemMaterials
    .map((m) => `- id: ${m.id} | código: ${m.code} | "${m.name}" | unidade: ${m.unit}`)
    .join('\n');

  return `${SYSTEM_PROMPT}

---

Fornecedor: ${supplierName}

## Itens do fornecedor (a parear):
${itemsBlock}

## Materiais internos do sistema (fonte da verdade):
${materialsBlock}`;
}

function validateSuggestions(
  raw: unknown,
  validItemIds: Set<string>,
  validMaterialIds: Set<string>
): SemanticMatchSuggestionPayload[] {
  if (!Array.isArray(raw)) return [];

  const suggestions: SemanticMatchSuggestionPayload[] = [];
  const seenItems = new Set<string>();

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;

    const e = entry as Record<string, unknown>;
    const supplierItemId = String(e.supplierItemId ?? '');
    const materialId = String(e.materialId ?? '');
    const conversionFactor = Number(e.conversionFactor);
    const confidenceScore = Math.round(Number(e.confidenceScore));
    const rationale = typeof e.rationale === 'string' ? e.rationale : undefined;

    if (!supplierItemId || !materialId) continue;
    if (!validItemIds.has(supplierItemId)) continue;
    if (!validMaterialIds.has(materialId)) continue;
    if (seenItems.has(supplierItemId)) continue;
    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) continue;
    if (!Number.isFinite(confidenceScore) || confidenceScore < 0 || confidenceScore > 100) continue;

    seenItems.add(supplierItemId);
    suggestions.push({
      supplierItemId,
      materialId,
      conversionFactor,
      confidenceScore,
      rationale,
    });
  }

  return suggestions;
}

export async function semanticMatch(
  unconciliatedItems: UnconciliatedItem[],
  systemMaterials: SystemMaterial[],
  supplierName: string
): Promise<SemanticMatchResult> {
  if (unconciliatedItems.length === 0) {
    return { success: true, suggestions: [] };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'Chave da API Gemini não configurada no servidor.' };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const prompt = buildPrompt(unconciliatedItems, systemMaterials, supplierName);

  let responseText: string;
  try {
    const result = await model.generateContent(prompt);
    responseText = result.response.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro na chamada à IA.';
    return { success: false, error: `Gemini: ${message}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return { success: false, error: 'A IA retornou um formato JSON inválido para o match semântico.' };
  }

  const validItemIds = new Set(unconciliatedItems.map((it) => it.id));
  const validMaterialIds = new Set(systemMaterials.map((m) => m.id));

  const suggestions = validateSuggestions(parsed, validItemIds, validMaterialIds);

  return { success: true, suggestions };
}
