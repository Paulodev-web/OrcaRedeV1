import type { BudgetDetails } from '@/types';

export interface ConsolidatedMaterialRow {
  materialId: string;
  codigo: string;
  nome: string;
  unidade: string;
  precoUnit: number;
  quantidade: number;
  subtotal: number;
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
      });
    });
  });

  return Array.from(materiaisMap.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
