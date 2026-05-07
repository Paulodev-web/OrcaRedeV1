'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deactivateChecklistTemplate, setDefaultTemplate } from '@/actions/workChecklists';
import type { ChecklistTemplate } from '@/types/works';

interface Props {
  templates: ChecklistTemplate[];
}

export function TemplatesList({ templates }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSetDefault(id: string) {
    startTransition(async () => {
      await setDefaultTemplate({ id });
      router.refresh();
    });
  }

  function handleDeactivate(id: string) {
    if (!confirm('Desativar este modelo? Ele não será excluído, mas não aparecerá mais na lista.')) return;
    startTransition(async () => {
      await deactivateChecklistTemplate({ id });
      router.refresh();
    });
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
        <p className="text-sm text-gray-500">Nenhum modelo criado ainda.</p>
        <Link
          href="/tools/andamento-obra/checklists/novo"
          className="mt-3 inline-block text-sm font-medium text-[#64ABDE] hover:underline"
        >
          Criar primeiro modelo
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3" aria-busy={pending}>
      {templates.map((t) => (
        <div
          key={t.id}
          className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
        >
          <Link
            href={`/tools/andamento-obra/checklists/${t.id}`}
            className="flex-1"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-[#1D3140]">{t.name}</span>
              {t.isDefault && (
                <span className="rounded bg-[#64ABDE]/15 px-2 py-0.5 text-xs font-medium text-[#1D3140]">
                  Padrão
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              {t.items.length} {t.items.length === 1 ? 'item' : 'itens'}
              {t.description ? ` · ${t.description}` : ''}
            </p>
          </Link>

          <div className="flex items-center gap-2">
            {!t.isDefault && (
              <button
                type="button"
                onClick={() => handleSetDefault(t.id)}
                className="rounded px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-[#1D3140]"
                disabled={pending}
              >
                Definir padrão
              </button>
            )}
            <button
              type="button"
              onClick={() => handleDeactivate(t.id)}
              className="rounded px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-50"
              disabled={pending}
            >
              Desativar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
