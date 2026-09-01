"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  addWorkSegmentAction,
  deleteWorkSegmentAction,
  reorderWorkSegmentsAction,
  seedDefaultWorkSegmentsAction,
  updateWorkSegmentAction,
} from "@/actions/workSegments";
import type { WorkSegment } from "@/services/segments/workSegments";

export interface SegmentosManagerProps {
  segments: WorkSegment[];
}

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 transition-colors focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/30";

const ICON_BUTTON_CLASS =
  "rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Catálogo de segmentos de obra (§7.3).
 *
 * A ordem importa: é ela que define a sequência dos seletores no orçamento e
 * das linhas em "Valores Globais por Segmento" na proposta. Por isso a lista
 * tem reordenação, e não só nome.
 *
 * A lista vem do servidor; cada ação revalida a rota e o `router.refresh()`
 * traz o estado novo — sem cópia local que possa divergir do banco.
 */
export function SegmentosManager({ segments }: SegmentosManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // A reordenação é otimista: mover um item de ponta a ponta com um round-trip
  // por clique deixaria a lista "pulando". `ordered` é o que a tela mostra, e
  // ele é ressincronizado durante a renderização quando o servidor manda uma
  // lista nova — o padrão do React para estado derivado de props, sem o efeito
  // extra que dispararia uma renderização em cascata.
  const [ordered, setOrdered] = useState<WorkSegment[]>(segments);
  const [syncedFrom, setSyncedFrom] = useState<WorkSegment[]>(segments);
  if (syncedFrom !== segments) {
    setSyncedFrom(segments);
    setOrdered(segments);
  }

  const run = (action: () => Promise<{ success: boolean; error?: string }>, okMessage: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        toast.success(okMessage);
        router.refresh();
      } else {
        toast.error(result.error ?? "Não foi possível concluir a operação.");
        router.refresh();
      }
    });
  };

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      toast.error("Informe o nome do segmento.");
      return;
    }
    startTransition(async () => {
      const result = await addWorkSegmentAction(name);
      if (result.success) {
        toast.success(`Segmento "${name}" criado.`);
        setNewName("");
        router.refresh();
      } else {
        toast.error(result.error ?? "Erro ao criar segmento.");
      }
    });
  };

  const handleSaveEdit = (event: FormEvent) => {
    event.preventDefault();
    const id = editingId;
    if (!id) return;
    const name = editingName.trim();
    if (!name) {
      toast.error("Informe o nome do segmento.");
      return;
    }
    startTransition(async () => {
      const result = await updateWorkSegmentAction(id, name);
      if (result.success) {
        toast.success("Segmento renomeado.");
        setEditingId(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Erro ao renomear segmento.");
      }
    });
  };

  const handleDelete = (segment: WorkSegment) => {
    const confirmed = window.confirm(
      `Excluir o segmento "${segment.name}"?\n\n` +
        "Os postes e grupos marcados com ele voltam para \"não segmentado\". " +
        "Nenhum material ou preço é perdido.",
    );
    if (!confirmed) return;
    run(() => deleteWorkSegmentAction(segment.id), `Segmento "${segment.name}" excluído.`);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;

    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    setOrdered(next);
    run(
      () => reorderWorkSegmentsAction(next.map((segment) => segment.id)),
      "Ordem dos segmentos atualizada.",
    );
  };

  const handleSeedDefaults = () => {
    run(
      () => seedDefaultWorkSegmentsAction(),
      "Catálogo padrão restaurado. Os segmentos que você já tinha foram mantidos.",
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-surface p-4 text-sm text-slate-600">
        <p>
          Estes são os segmentos que aparecem no seletor{" "}
          <strong className="text-slate-800">Segmento da obra</strong> de cada poste e no override
          de cada grupo de itens. Eles quebram a planilha de materiais e as tabelas de valores da
          proposta.
        </p>
        <p className="mt-2">
          A ordem abaixo é a ordem em que os segmentos aparecem no orçamento e na proposta.
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-surface p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label htmlFor="novo-segmento" className="mb-1 block text-sm font-medium text-slate-700">
            Novo segmento
          </label>
          <input
            id="novo-segmento"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Ex.: Rede Primária"
            className={INPUT_CLASS}
            disabled={isPending}
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span>Adicionar</span>
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-surface">
        {ordered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Layers className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500">
              Nenhum segmento cadastrado. Crie os seus acima ou comece pelo catálogo padrão.
            </p>
            <button
              type="button"
              onClick={handleSeedDefaults}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Usar catálogo padrão</span>
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {ordered.map((segment, index) => (
              <li key={segment.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={isPending || index === 0}
                    className={ICON_BUTTON_CLASS}
                    title="Mover para cima"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={isPending || index === ordered.length - 1}
                    className={ICON_BUTTON_CLASS}
                    title="Mover para baixo"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                <Layers className="h-4 w-4 shrink-0 text-brand-blue" />

                {editingId === segment.id ? (
                  <form onSubmit={handleSaveEdit} className="flex flex-1 items-center gap-2">
                    <input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      className={INPUT_CLASS}
                      autoFocus
                      disabled={isPending}
                    />
                    <button
                      type="submit"
                      disabled={isPending}
                      className={ICON_BUTTON_CLASS}
                      title="Salvar"
                    >
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 text-emerald-600" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      disabled={isPending}
                      className={ICON_BUTTON_CLASS}
                      title="Cancelar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-slate-800">{segment.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(segment.id);
                        setEditingName(segment.name);
                      }}
                      disabled={isPending}
                      className={ICON_BUTTON_CLASS}
                      title="Renomear"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(segment)}
                      disabled={isPending}
                      className={`${ICON_BUTTON_CLASS} hover:text-red-600`}
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {ordered.length > 0 && (
        <button
          type="button"
          onClick={handleSeedDefaults}
          disabled={isPending}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Restaurar segmentos do catálogo padrão que faltarem</span>
        </button>
      )}
    </div>
  );
}
