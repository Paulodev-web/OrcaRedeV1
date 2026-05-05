'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assignChecklistToWork } from '@/actions/workChecklists';
import type { ChecklistTemplate } from '@/types/works';

interface Props {
  workId: string;
  templates: ChecklistTemplate[];
}

export function AssignChecklistDialog({ workId, templates }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');

  const defaultTemplate = templates.find((t) => t.isDefault);

  const handleOpen = () => {
    setOpen(true);
    setError(null);
    setSelectedTemplateId(defaultTemplate?.id ?? '');
    setName(defaultTemplate?.name ?? '');
    setDueDate('');
  };

  const handleTemplateChange = (id: string) => {
    setSelectedTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) setName(tpl.name);
  };

  const handleSubmit = () => {
    setError(null);
    if (!name.trim()) {
      setError('Nome obrigatório.');
      return;
    }

    startTransition(async () => {
      const result = await assignChecklistToWork({
        workId,
        templateId: selectedTemplateId || undefined,
        name: name.trim(),
        dueDate: dueDate || undefined,
      });

      if (!result.success) {
        setError(result.error ?? 'Erro ao atribuir.');
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-lg bg-[#64ABDE] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#4A8FC2]"
      >
        + Atribuir checklist
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-[#1D3140]">Atribuir checklist</h3>

        <div className="space-y-3">
          {templates.length > 0 && (
            <div>
              <label htmlFor="tpl-select" className="block text-sm font-medium text-gray-700">
                Modelo (opcional)
              </label>
              <select
                id="tpl-select"
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">— Ad-hoc (sem modelo) —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.items.length} itens){t.isDefault ? ' ★' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="cl-name" className="block text-sm font-medium text-gray-700">
              Nome *
            </label>
            <input
              id="cl-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="cl-due" className="block text-sm font-medium text-gray-700">
              Prazo (opcional)
            </label>
            <input
              id="cl-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending}
              className="rounded-md bg-[#1D3140] px-4 py-2 text-sm font-medium text-white hover:bg-[#2A4557] disabled:opacity-50"
            >
              {pending ? 'Atribuindo...' : 'Atribuir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
