'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createChecklistTemplate,
  updateChecklistTemplate,
} from '@/actions/workChecklists';
import type { ChecklistTemplate, CreateChecklistTemplateItemInput } from '@/types/works';

interface Props {
  template: ChecklistTemplate | null;
}

interface ItemDraft {
  key: string;
  label: string;
  description: string;
  requiresPhoto: boolean;
}

let keyCounter = 0;
function nextKey() {
  keyCounter += 1;
  return `item-${keyCounter}`;
}

export function TemplateEditor({ template }: Props) {
  const isNew = !template;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [items, setItems] = useState<ItemDraft[]>(() =>
    template?.items.map((i) => ({
      key: nextKey(),
      label: i.label,
      description: i.description ?? '',
      requiresPhoto: i.requiresPhoto,
    })) ?? [{ key: nextKey(), label: '', description: '', requiresPhoto: false }],
  );

  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const addItem = () => {
    setItems((prev) => [...prev, { key: nextKey(), label: '', description: '', requiresPhoto: false }]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof ItemDraft, value: string | boolean) => {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );
  };

  const moveItem = useCallback((fromIdx: number, toIdx: number) => {
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      moveItem(dragIdx, idx);
      setDragIdx(idx);
    }
  };

  const handleDragEnd = () => {
    setDragIdx(null);
  };

  const handleSubmit = () => {
    setError(null);
    const validItems = items.filter((i) => i.label.trim().length > 0);
    if (validItems.length === 0) {
      setError('Adicione pelo menos 1 item ao modelo.');
      return;
    }

    const itemsPayload: CreateChecklistTemplateItemInput[] = validItems.map((i, idx) => ({
      label: i.label.trim(),
      description: i.description.trim() || undefined,
      requiresPhoto: i.requiresPhoto,
      orderIndex: idx,
    }));

    startTransition(async () => {
      let result;
      if (isNew) {
        result = await createChecklistTemplate({
          name: name.trim(),
          description: description.trim() || undefined,
          isDefault,
          items: itemsPayload,
        });
      } else {
        result = await updateChecklistTemplate({
          id: template.id,
          name: name.trim(),
          description: description.trim() || undefined,
          isDefault,
          items: itemsPayload,
        });
      }

      if (!result.success) {
        setError(result.error ?? 'Erro ao salvar.');
        return;
      }
      router.push('/tools/andamento-obra/checklists');
      router.refresh();
    });
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-[#1D3140]">
        {isNew ? 'Novo modelo' : 'Editar modelo'}
      </h1>

      {!isNew && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Alterações neste modelo não afetam checklists já atribuídos a obras (snapshot fixo).
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="tpl-name" className="block text-sm font-medium text-gray-700">
            Nome *
          </label>
          <input
            id="tpl-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-[#64ABDE] focus:ring-1 focus:ring-[#64ABDE]"
            maxLength={200}
          />
        </div>

        <div>
          <label htmlFor="tpl-desc" className="block text-sm font-medium text-gray-700">
            Descrição
          </label>
          <textarea
            id="tpl-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-[#64ABDE] focus:ring-1 focus:ring-[#64ABDE]"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-[#64ABDE] focus:ring-[#64ABDE]"
          />
          Modelo padrão (aparece como sugestão ao atribuir)
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700">Itens</h2>
            <button
              type="button"
              onClick={addItem}
              className="text-xs font-medium text-[#64ABDE] hover:underline"
            >
              + Adicionar item
            </button>
          </div>

          <div className="space-y-2">
            {items.map((item, idx) => (
              <div
                key={item.key}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className="flex items-start gap-2 rounded-md border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="mt-2.5 cursor-grab text-gray-400" aria-hidden>☰</span>
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    placeholder={`Item ${idx + 1}`}
                    value={item.label}
                    onChange={(e) => updateItem(idx, 'label', e.target.value)}
                    className="block w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Instruções (opcional)"
                    value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    className="block w-full rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-500"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={item.requiresPhoto}
                      onChange={(e) => updateItem(idx, 'requiresPhoto', e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    Exige foto
                  </label>
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="mt-2 text-xs text-red-400 hover:text-red-600"
                    aria-label="Remover item"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="rounded-lg bg-[#1D3140] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#2A4557] disabled:opacity-50"
          >
            {pending ? 'Salvando...' : isNew ? 'Criar modelo' : 'Salvar alterações'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
