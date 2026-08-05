"use client";

import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Signature,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  addTechnicalResponsibleAction,
  removeResponsibleSignatureAction,
  setTechnicalResponsibleActiveAction,
  updateTechnicalResponsibleAction,
  uploadResponsibleSignatureAction,
} from "../_actions/technicalResponsibles";
import type { TechnicalResponsibleRow } from "../_data/company";

export interface ResponsaveisManagerProps {
  responsibles: TechnicalResponsibleRow[];
}

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 transition-colors focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/30";

export function ResponsaveisManager({ responsibles }: ResponsaveisManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const actives = responsibles.filter((r) => r.is_active);
  const inactives = responsibles.filter((r) => !r.is_active);

  const handleCreate = (values: { full_name: string; crea: string }) => {
    startTransition(async () => {
      const result = await addTechnicalResponsibleAction(values);
      if (result.success) {
        toast.success("Responsável técnico cadastrado.");
        setCreating(false);
      } else {
        toast.error(result.error ?? "Erro ao cadastrar responsável técnico.");
      }
    });
  };

  const handleUpdate = (id: string, values: { full_name: string; crea: string }) => {
    startTransition(async () => {
      const result = await updateTechnicalResponsibleAction(id, values);
      if (result.success) {
        toast.success("Responsável técnico atualizado.");
        setEditingId(null);
      } else {
        toast.error(result.error ?? "Erro ao atualizar responsável técnico.");
      }
    });
  };

  const handleToggleActive = (row: TechnicalResponsibleRow) => {
    startTransition(async () => {
      const result = await setTechnicalResponsibleActiveAction(row.id, !row.is_active);
      if (result.success) {
        toast.success(
          row.is_active
            ? "Responsável inativado. Ele continua válido nas propostas antigas."
            : "Responsável reativado.",
        );
      } else {
        toast.error(result.error ?? "Erro ao alterar o responsável técnico.");
      }
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-brand-navy">Responsáveis ativos</h2>
            <p className="mt-1 text-sm text-slate-500">
              Nome, CREA e assinatura aparecem no Termo de Aceite do PDF da proposta.
            </p>
          </div>
          {!creating ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700"
            >
              <Plus className="h-4 w-4" />
              Novo responsável
            </button>
          ) : null}
        </div>

        {creating ? (
          <div className="mt-5 rounded-xl border border-brand-blue/40 bg-brand-blue/5 p-4">
            <ResponsibleForm
              submitLabel="Cadastrar"
              isPending={isPending}
              onCancel={() => setCreating(false)}
              onSubmit={handleCreate}
            />
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          {actives.length === 0 && !creating ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
              Nenhum responsável técnico cadastrado ainda.
            </p>
          ) : null}

          {actives.map((row) => (
            <ResponsibleCard
              key={row.id}
              row={row}
              isEditing={editingId === row.id}
              isPending={isPending}
              onStartEdit={() => setEditingId(row.id)}
              onCancelEdit={() => setEditingId(null)}
              onSubmitEdit={(values) => handleUpdate(row.id, values)}
              onToggleActive={() => handleToggleActive(row)}
              startTransition={startTransition}
            />
          ))}
        </div>
      </section>

      {inactives.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-brand-navy">Inativos</h2>
          <p className="mt-1 text-sm text-slate-500">
            Não aparecem ao montar uma proposta nova, mas continuam resolvendo as propostas que já
            apontam para eles.
          </p>

          <div className="mt-5 space-y-3">
            {inactives.map((row) => (
              <ResponsibleCard
                key={row.id}
                row={row}
                isEditing={editingId === row.id}
                isPending={isPending}
                onStartEdit={() => setEditingId(row.id)}
                onCancelEdit={() => setEditingId(null)}
                onSubmitEdit={(values) => handleUpdate(row.id, values)}
                onToggleActive={() => handleToggleActive(row)}
                startTransition={startTransition}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

interface ResponsibleCardProps {
  row: TechnicalResponsibleRow;
  isEditing: boolean;
  isPending: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: (values: { full_name: string; crea: string }) => void;
  onToggleActive: () => void;
  startTransition: (callback: () => void) => void;
}

function ResponsibleCard({
  row,
  isEditing,
  isPending,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onToggleActive,
  startTransition,
}: ResponsibleCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSignatureChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("id", row.id);
    formData.append("file", file);

    startTransition(async () => {
      const result = await uploadResponsibleSignatureAction(formData);
      if (result.success) toast.success("Assinatura atualizada.");
      else toast.error(result.error ?? "Erro ao enviar a assinatura.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  };

  const handleSignatureRemove = () => {
    startTransition(async () => {
      const result = await removeResponsibleSignatureAction(row.id);
      if (result.success) toast.success("Assinatura removida.");
      else toast.error(result.error ?? "Erro ao remover a assinatura.");
    });
  };

  if (isEditing) {
    return (
      <div className="rounded-xl border border-brand-blue/40 bg-brand-blue/5 p-4">
        <ResponsibleForm
          initial={{ full_name: row.full_name, crea: row.crea }}
          submitLabel="Salvar"
          isPending={isPending}
          onCancel={onCancelEdit}
          onSubmit={onSubmitEdit}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 p-4 ${
        row.is_active ? "bg-white" : "bg-slate-50"
      }`}
    >
      <div className="flex h-14 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white">
        {row.signature_url ? (
          // `next/image` exigiria registrar o host do Supabase em
          // next.config.ts, que é arquivo de outra frente.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.signature_url}
            alt={`Assinatura de ${row.full_name}`}
            className="h-full w-full object-contain p-1"
          />
        ) : (
          <span className="flex flex-col items-center gap-0.5 text-[11px] text-slate-400">
            <Signature className="h-4 w-4" />
            Sem assinatura
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-brand-navy">{row.full_name}</p>
        <p className="text-xs text-slate-500">CREA {row.crea}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleSignatureChange}
          className="hidden"
          id={`signature-input-${row.id}`}
        />
        <label
          htmlFor={`signature-input-${row.id}`}
          title={row.signature_url ? "Trocar assinatura" : "Enviar assinatura"}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 ${
            isPending ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <Upload className="h-3.5 w-3.5" />
          Assinatura
        </label>

        {row.signature_url ? (
          <button
            type="button"
            onClick={handleSignatureRemove}
            disabled={isPending}
            title="Remover assinatura"
            className="rounded-lg p-1.5 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}

        <button
          type="button"
          onClick={onStartEdit}
          disabled={isPending}
          title="Editar"
          className="rounded-lg p-1.5 text-brand-blue transition-colors hover:bg-brand-blue/10 disabled:opacity-50"
        >
          <Pencil className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onToggleActive}
          disabled={isPending}
          title={row.is_active ? "Inativar" : "Reativar"}
          className={`rounded-lg p-1.5 transition-colors disabled:opacity-50 ${
            row.is_active
              ? "text-slate-500 hover:bg-slate-100"
              : "text-green-600 hover:bg-green-50"
          }`}
        >
          {row.is_active ? <X className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

interface ResponsibleFormProps {
  initial?: { full_name: string; crea: string };
  submitLabel: string;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (values: { full_name: string; crea: string }) => void;
}

function ResponsibleForm({
  initial,
  submitLabel,
  isPending,
  onCancel,
  onSubmit,
}: ResponsibleFormProps) {
  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [crea, setCrea] = useState(initial?.crea ?? "");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!fullName.trim()) {
      toast.error("Informe o nome completo.");
      return;
    }
    if (!crea.trim()) {
      toast.error("Informe o CREA.");
      return;
    }

    onSubmit({ full_name: fullName, crea });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Nome completo<span className="ml-0.5 text-red-500">*</span>
          </span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={INPUT_CLASS}
            placeholder="Eng. Fulano de Tal"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            CREA<span className="ml-0.5 text-red-500">*</span>
          </span>
          <input
            type="text"
            value={crea}
            onChange={(e) => setCrea(e.target.value)}
            className={INPUT_CLASS}
            placeholder="RS-000000000"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>

      <p className="text-xs text-slate-500">
        A imagem da assinatura é enviada depois de salvar, no cartão do responsável.
      </p>
    </form>
  );
}
