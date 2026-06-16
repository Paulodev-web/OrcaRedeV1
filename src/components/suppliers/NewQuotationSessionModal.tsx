'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, X } from 'lucide-react';
import type { BudgetOption } from '@/types';
import { onPortalPrimaryButtonSmClass } from '@/lib/branding';

const SCOPE_GLOBAL = '__global__';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgets: BudgetOption[];
  mode?: 'create' | 'edit';
  initialValues?: { title: string; budgetId: string | null };
  onSubmit: (input: { title: string; budgetId: string | null }) => Promise<void>;
}

export default function NewQuotationSessionModal({
  open,
  onOpenChange,
  budgets,
  mode = 'create',
  initialValues,
  onSubmit,
}: Props) {
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState<string>(SCOPE_GLOBAL);
  const [scopeSearch, setScopeSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initialValues?.title ?? '');
    setScope(initialValues?.budgetId ?? SCOPE_GLOBAL);
    setScopeSearch('');
  }, [initialValues, open]);

  const filteredBudgets = useMemo(() => {
    const term = scopeSearch.trim().toLowerCase();
    if (!term) return budgets;
    return budgets.filter((b) => b.name.toLowerCase().includes(term));
  }, [budgets, scopeSearch]);

  const showGlobalOption = useMemo(() => {
    const term = scopeSearch.trim().toLowerCase();
    if (!term) return true;
    return (
      'global'.includes(term) ||
      'catálogo'.includes(term) ||
      'catalogo'.includes(term) ||
      'sistema'.includes(term)
    );
  }, [scopeSearch]);

  const reset = () => {
    setTitle('');
    setScope(SCOPE_GLOBAL);
    setScopeSearch('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    try {
      await onSubmit({
        title: t,
        budgetId: scope === SCOPE_GLOBAL ? null : scope,
      });
      reset();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-session-title"
    >
      <div className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={() => {
            reset();
            onOpenChange(false);
          }}
          className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 id="new-session-title" className="pr-8 text-lg font-semibold text-[#1D3140]">
          {mode === 'create' ? 'Nova sessão de cotação' : 'Editar sessão de cotação'}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {mode === 'create'
            ? 'Escolha se a conciliação usará a lista de materiais de um orçamento ou o catálogo global.'
            : 'Atualize o nome da sessão e, se necessário, o escopo da conciliação.'}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div>
            <label htmlFor="session-title" className="block text-sm font-medium text-gray-700">
              Título
            </label>
            <input
              id="session-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Cotação Fios — Abril"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1">Escopo</span>
            <Select
              value={scope}
              onValueChange={setScope}
              onOpenChange={(isOpen) => {
                if (!isOpen) setScopeSearch('');
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escopo" />
              </SelectTrigger>
              <SelectContent>
                <div className="sticky top-0 z-10 border-b border-gray-200/80 bg-white/95 px-2 pb-2 pt-1 backdrop-blur-sm">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={scopeSearch}
                      onChange={(e) => setScopeSearch(e.target.value)}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      onKeyUp={(e) => e.stopPropagation()}
                      autoComplete="off"
                      placeholder="Buscar orçamento por nome..."
                      className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
                      aria-label="Buscar orçamento por nome"
                    />
                  </div>
                </div>
                {showGlobalOption && (
                  <SelectItem value={SCOPE_GLOBAL}>Global (catálogo do sistema)</SelectItem>
                )}
                {filteredBudgets.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    Orçamento: {b.name}
                  </SelectItem>
                ))}
                {!showGlobalOption && filteredBudgets.length === 0 && (
                  <p className="px-3 py-4 text-center text-sm text-gray-400">
                    Nenhum orçamento encontrado.
                  </p>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm disabled:opacity-50 ${onPortalPrimaryButtonSmClass}`}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Criar e abrir' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
