"use client";

import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { ImageOff, Loader2, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  removeCompanyLogoAction,
  saveCompanySettingsAction,
  uploadCompanyLogoAction,
  type CompanySettingsInput,
} from "../_actions/companySettings";
import type { CompanySettingsRow } from "../_data/company";

export interface EmpresaFormProps {
  /** `null` quando o usuário nunca salvou — o formulário abre vazio. */
  settings: CompanySettingsRow | null;
}

type FormState = CompanySettingsInput;

function toFormState(settings: CompanySettingsRow | null): FormState {
  return {
    legal_name: settings?.legal_name ?? "",
    trade_name: settings?.trade_name ?? "",
    cnpj: settings?.cnpj ?? "",
    address: settings?.address ?? "",
    phone_primary: settings?.phone_primary ?? "",
    phone_secondary: settings?.phone_secondary ?? "",
    email: settings?.email ?? "",
    website: settings?.website ?? "",
    instagram: settings?.instagram ?? "",
    whatsapp_number: settings?.whatsapp_number ?? "",
  };
}

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 transition-colors focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/30";

export function EmpresaForm({ settings }: EmpresaFormProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(settings));
  const [isSaving, startSaving] = useTransition();
  const [isUploading, startUploading] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setField = (field: keyof FormState) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!form.legal_name.trim()) {
      toast.error("Informe a razão social.");
      return;
    }

    startSaving(async () => {
      const result = await saveCompanySettingsAction(form);
      if (result.success) toast.success("Dados da empresa salvos.");
      else toast.error(result.error ?? "Erro ao salvar os dados da empresa.");
    });
  };

  const handleLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    startUploading(async () => {
      const result = await uploadCompanyLogoAction(formData);
      if (result.success) toast.success("Logo atualizado.");
      else toast.error(result.error ?? "Erro ao enviar o logo.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  };

  const handleLogoRemove = () => {
    startUploading(async () => {
      const result = await removeCompanyLogoAction();
      if (result.success) toast.success("Logo removido.");
      else toast.error(result.error ?? "Erro ao remover o logo.");
    });
  };

  return (
    <div className="space-y-6">
      {/* Logo — sobe direto, independente do formulário: o arquivo já vai para
          o storage no momento da escolha. */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-brand-navy">Logo</h2>
        <p className="mt-1 text-sm text-slate-500">
          Aparece no cabeçalho do PDF e na página pública da proposta.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-5">
          <div className="flex h-24 w-40 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
            {settings?.logo_url ? (
              // `next/image` exigiria registrar o host do Supabase em
              // next.config.ts, que é arquivo de outra frente.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.logo_url}
                alt="Logo da empresa"
                className="h-full w-full object-contain p-2"
              />
            ) : (
              <span className="flex flex-col items-center gap-1 text-xs text-slate-400">
                <ImageOff className="h-5 w-5" />
                Sem logo
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="hidden"
              id="company-logo-input"
            />
            <label
              htmlFor="company-logo-input"
              className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-brand-blue/40 bg-brand-blue/10 px-4 py-2 text-sm font-medium text-brand-navy transition-colors hover:bg-brand-blue/20 ${
                isUploading ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {settings?.logo_url ? "Trocar logo" : "Enviar logo"}
            </label>

            {settings?.logo_url ? (
              <button
                type="button"
                onClick={handleLogoRemove}
                disabled={isUploading}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Remover
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-brand-navy">Dados institucionais</h2>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Razão social" required>
              <input
                type="text"
                value={form.legal_name}
                onChange={setField("legal_name")}
                className={INPUT_CLASS}
                placeholder="ON Engenharia Elétrica LTDA"
              />
            </Field>

            <Field label="Nome fantasia">
              <input
                type="text"
                value={form.trade_name ?? ""}
                onChange={setField("trade_name")}
                className={INPUT_CLASS}
                placeholder="ON Engenharia"
              />
            </Field>

            <Field label="CNPJ">
              <input
                type="text"
                value={form.cnpj ?? ""}
                onChange={setField("cnpj")}
                className={INPUT_CLASS}
                placeholder="00.000.000/0001-00"
              />
            </Field>

            <Field label="Endereço">
              <input
                type="text"
                value={form.address ?? ""}
                onChange={setField("address")}
                className={INPUT_CLASS}
                placeholder="Rua, número, bairro, cidade/UF"
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-brand-navy">Contato</h2>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Telefone principal">
              <input
                type="text"
                value={form.phone_primary ?? ""}
                onChange={setField("phone_primary")}
                className={INPUT_CLASS}
                placeholder="(54) 3000-0000"
              />
            </Field>

            <Field label="Telefone secundário">
              <input
                type="text"
                value={form.phone_secondary ?? ""}
                onChange={setField("phone_secondary")}
                className={INPUT_CLASS}
                placeholder="(54) 3000-0001"
              />
            </Field>

            <Field
              label="WhatsApp"
              hint="Formato internacional, sem máscara — é o número do botão na proposta pública."
            >
              <input
                type="text"
                value={form.whatsapp_number ?? ""}
                onChange={setField("whatsapp_number")}
                className={INPUT_CLASS}
                placeholder="+5554999999999"
              />
            </Field>

            <Field label="E-mail">
              <input
                type="email"
                value={form.email ?? ""}
                onChange={setField("email")}
                className={INPUT_CLASS}
                placeholder="contato@empresa.com.br"
              />
            </Field>

            <Field label="Site">
              <input
                type="text"
                value={form.website ?? ""}
                onChange={setField("website")}
                className={INPUT_CLASS}
                placeholder="https://empresa.com.br"
              />
            </Field>

            <Field label="Instagram">
              <input
                type="text"
                value={form.instagram ?? ""}
                onChange={setField("instagram")}
                className={INPUT_CLASS}
                placeholder="@empresa"
              />
            </Field>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-accent-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar dados da empresa
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
