import type { BudgetDetails } from '@/types';
import { getPostDisplayName } from '@/lib/utils';
import type { PostWithMaterials } from './exportService';

/**
 * Lista consolidada no cliente (Painel Consolidado).
 * Paridade server-side: loadFullConsolidatedBudgetMaterials em
 * src/services/supplies/budgetMaterialQuantities.ts
 */

const SEM_SUBGRUPO = 'Não classificado';

export interface ConsolidatedMaterialRow {
  materialId: string;
  codigo: string;
  nome: string;
  unidade: string;
  precoUnit: number;
  quantidade: number;
  subtotal: number;
  subgrupo: string;
}

export function consolidateMaterialsFromBudgetDetails(
  budgetDetails: BudgetDetails | null
): ConsolidatedMaterialRow[] {
  if (!budgetDetails || !budgetDetails.posts || budgetDetails.posts.length === 0) {
    return [];
  }

  const materiaisMap = new Map<string, ConsolidatedMaterialRow>();

  budgetDetails.posts.forEach((post) => {
    post.post_item_groups.forEach((group) => {
      group.post_item_group_materials.forEach((material) => {
        const materialId = material.material_id;
        const materialData = material.materials;

        if (materiaisMap.has(materialId)) {
          const existingMaterial = materiaisMap.get(materialId)!;
          existingMaterial.quantidade += material.quantity;
          existingMaterial.subtotal = existingMaterial.quantidade * existingMaterial.precoUnit;
          return;
        }

        const priceToUse = material.price_at_addition || materialData.price || 0;
        materiaisMap.set(materialId, {
          materialId,
          codigo: materialData.code || '',
          nome: materialData.name || 'Material sem nome',
          unidade: materialData.unit || '',
          precoUnit: priceToUse,
          quantidade: material.quantity,
          subtotal: priceToUse * material.quantity,
          subgrupo: materialData.material_subgroups?.name || SEM_SUBGRUPO,
        });
      });
    });

    post.post_materials.forEach((material) => {
      const materialId = material.material_id;
      const materialData = material.materials;

      if (materiaisMap.has(materialId)) {
        const existingMaterial = materiaisMap.get(materialId)!;
        existingMaterial.quantidade += material.quantity;
        existingMaterial.subtotal = existingMaterial.quantidade * existingMaterial.precoUnit;
        return;
      }

      const priceToUse = material.price_at_addition || 0;
      materiaisMap.set(materialId, {
        materialId,
        codigo: materialData.code || '',
        nome: materialData.name || 'Material sem nome',
        unidade: materialData.unit || '',
        precoUnit: priceToUse,
        quantidade: material.quantity,
        subtotal: priceToUse * material.quantity,
        subgrupo: materialData.material_subgroups?.name || SEM_SUBGRUPO,
      });
    });
  });

  return Array.from(materiaisMap.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Nome do segmento de obra já resolvido pela cascata da §7.3
 * (grupo → poste → não segmentado). Vem do `WorkSegmentsProvider`; quando o
 * orçamento é aberto fora dele, nada é passado e a exportação sai sem segmento.
 */
export type SegmentNameResolver = (
  postId: string,
  postItemGroupId?: string
) => string | null;

/**
 * Detalhamento poste a poste (grupos + materiais avulsos), usado nas
 * exportações que separam os materiais por poste e por segmento.
 */
export function buildPostsWithMaterialsFromBudgetDetails(
  budgetDetails: BudgetDetails,
  segmentNameFor?: SegmentNameResolver
): PostWithMaterials[] {
  return budgetDetails.posts.map((post) => {
    const groups = post.post_item_groups.map((group) => ({
      groupName: group.name,
      segment: segmentNameFor?.(post.id, group.id) ?? null,
      materials: group.post_item_group_materials.map((material) => ({
        materialId: material.material_id,
        codigo: material.materials.code || '-',
        nome: material.materials.name,
        unidade: material.materials.unit,
        quantidade: material.quantity,
        precoUnit: material.price_at_addition,
        subtotal: material.quantity * material.price_at_addition,
      })),
    }));

    const looseMaterials = (post.post_materials || []).map((material) => ({
      materialId: material.material_id,
      codigo: material.materials.code || '-',
      nome: material.materials.name,
      unidade: material.materials.unit,
      quantidade: material.quantity,
      precoUnit: material.price_at_addition,
      subtotal: material.quantity * material.price_at_addition,
    }));

    return {
      postName: getPostDisplayName(post),
      postType: post.post_types?.name || 'Tipo não definido',
      coords: { x: post.x_coord, y: post.y_coord },
      segment: segmentNameFor?.(post.id) ?? null,
      groups,
      looseMaterials,
    };
  });
}
