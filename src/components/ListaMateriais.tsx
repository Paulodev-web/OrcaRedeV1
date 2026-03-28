"use client";
import React, { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Orcamento, MaterialConsolidado } from '@/types';

interface ListaMateriaisProps {
  orcamento: Orcamento;
}

export function ListaMateriais({ orcamento }: ListaMateriaisProps) {
  const { materiais, gruposItens } = useApp();

  const materiaisConsolidados = useMemo(() => {
    const consolidado: { [key: string]: MaterialConsolidado } = {};

    orcamento.postes.forEach(poste => {
      poste.gruposItens.forEach(grupoId => {
        const grupo = gruposItens.find(g => g.id === grupoId);
        if (grupo) {
          grupo.materiais.forEach(({ materialId, quantidade }) => {
            const material = materiais.find(m => m.id === materialId);
            if (material) {
              if (consolidado[materialId]) {
                consolidado[materialId].quantidade += quantidade;
                consolidado[materialId].precoTotal = consolidado[materialId].quantidade * material.precoUnit;
              } else {
                consolidado[materialId] = {
                  material,
                  quantidade,
                  precoTotal: quantidade * material.precoUnit
                };
              }
            }
          });
        }
      });
    });

    return Object.values(consolidado);
  }, [orcamento.postes, materiais, gruposItens]);

  const custoTotal = materiaisConsolidados.reduce((total, item) => total + item.precoTotal, 0);

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Lista de Materiais Consolidada
      </h3>

      {materiaisConsolidados.length === 0 ? (
        <p className="text-gray-500 text-sm">
          Adicione postes e grupos de itens para ver a lista de materiais.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-gray-700">Item</th>
                  <th className="text-center py-2 font-medium text-gray-700">Qtd.</th>
                  <th className="text-center py-2 font-medium text-gray-700">Un.</th>
                  <th className="text-right py-2 font-medium text-gray-700">Preço Unit.</th>
                  <th className="text-right py-2 font-medium text-gray-700">Preço Total</th>
                </tr>
              </thead>
              <tbody>
                {materiaisConsolidados.map(({ material, quantidade, precoTotal }) => (
                  <tr key={material.id} className="border-b">
                    <td className="py-2">
                      <div>
                        <div className="font-medium text-gray-900">{material.descricao}</div>
                        <div className="text-xs text-gray-500">{material.codigo}</div>
                      </div>
                    </td>
                    <td className="text-center py-2">{quantidade}</td>
                    <td className="text-center py-2">{material.unidade}</td>
                    <td className="text-right py-2">
                      R$ {material.precoUnit.toFixed(2)}
                    </td>
                    <td className="text-right py-2 font-medium">
                      R$ {precoTotal.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-gray-900">
                CUSTO TOTAL DO PROJETO:
              </span>
              <span className="text-xl font-bold text-green-600">
                R$ {custoTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}