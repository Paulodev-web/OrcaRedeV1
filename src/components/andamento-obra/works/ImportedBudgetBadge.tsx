import { FileSearch } from 'lucide-react';

interface ImportedBudgetBadgeProps {
  className?: string;
}

/**
 * Indica visualmente que a obra foi criada a partir de um orçamento importado
 * (Fase 3). Snapshot é fixo: alterações no orçamento original não afetam a obra.
 */
export function ImportedBudgetBadge({ className }: ImportedBudgetBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-[#64ABDE]/10 px-2 py-0.5 text-[10px] font-medium text-[#1D3140] ring-1 ring-[#64ABDE]/30 ${className ?? ''}`}
      title="Obra criada a partir de um orçamento importado do OrçaRede"
    >
      <FileSearch className="h-3 w-3" />
      Importada do OrçaRede
    </span>
  );
}
