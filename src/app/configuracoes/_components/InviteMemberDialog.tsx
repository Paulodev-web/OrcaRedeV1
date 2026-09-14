"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Check, Copy, HardHat, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createOrgUserAction } from "../_actions/organization";
import { ORG_SECTOR_LABELS, ORG_SECTORS, type OrgSector } from "@/types/organization";

const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?";

/** Senha temporária ditada por telefone: alfabeto sem caracteres ambíguos (0/O, 1/l/I). */
function generateStrongPassword(length = 12): string {
  if (typeof window === "undefined" || !window.crypto?.getRandomValues) {
    let pwd = "";
    for (let i = 0; i < length; i += 1) {
      pwd += PASSWORD_ALPHABET[Math.floor(Math.random() * PASSWORD_ALPHABET.length)];
    }
    return pwd;
  }
  const bytes = new Uint32Array(length);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join("");
}

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 transition-colors focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/30";

export function InviteMemberDialog({ onClose }: { onClose: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sector, setSector] = useState<OrgSector | "">("");
  const [isWorkManager, setIsWorkManager] = useState(false);
  const [password, setPassword] = useState(() => generateStrongPassword(12));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [created, setCreated] = useState<
    { email: string; temporaryPassword: string; isWorkManager: boolean } | null
  >(null);
  const [copied, setCopied] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("A senha temporária precisa ter pelo menos 8 caracteres.");
      return;
    }

    startTransition(async () => {
      const result = await createOrgUserAction({
        fullName,
        email,
        phone: phone || null,
        temporaryPassword: password,
        sector: sector || null,
        isWorkManager,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setCreated({
        email: result.data.email,
        temporaryPassword: result.data.temporaryPassword,
        isWorkManager,
      });
    });
  };

  const handleCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar. Anote a senha manualmente.");
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  if (created) {
    return (
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Conta criada</DialogTitle>
            <DialogDescription>
              Anote ou copie a senha temporária. Por segurança, ela <strong>não será exibida
              novamente</strong>. A pessoa entra sem acesso a nenhum módulo — conceda pela lista
              de membros logo abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Compartilhe a senha por um canal seguro. Depois de fechar, ela some daqui.</p>
              </div>
            </div>
            {created.isWorkManager && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <p className="flex items-center gap-2 font-medium text-slate-700">
                  <HardHat className="h-4 w-4 shrink-0 text-slate-400" />
                  Conta de campo
                </p>
                <p className="mt-1">
                  É com este e-mail e esta senha que a pessoa entra no app Android — o app pede a
                  troca da senha no primeiro acesso. Para ela receber uma obra, escolha o nome no
                  campo <strong>Gerente</strong> ao criar ou editar a obra.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                E-mail
              </label>
              <p className="text-sm text-slate-700">{created.email}</p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                Senha temporária
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-base text-slate-900">
                  {created.temporaryPassword}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700"
            >
              Concluído
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-slate-400" />
              Cadastrar pessoa na organização
            </DialogTitle>
            <DialogDescription>
              Cria uma conta de verdade, com senha temporária. A pessoa nasce sem acesso a nenhum
              módulo — você concede depois, na lista de membros. É aqui também que se cadastra
              gerente de obra.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-4">
            <div className="space-y-1.5">
              <label htmlFor="invite-name" className="block text-sm font-medium text-slate-700">
                Nome completo
              </label>
              <input
                ref={firstFieldRef}
                id="invite-name"
                type="text"
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="invite-email" className="block text-sm font-medium text-slate-700">
                E-mail
              </label>
              <input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="invite-phone" className="block text-sm font-medium text-slate-700">
                Telefone <span className="text-xs font-normal text-slate-400">(opcional)</span>
              </label>
              <input
                id="invite-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="invite-sector" className="block text-sm font-medium text-slate-700">
                Setor <span className="text-xs font-normal text-slate-400">(pode definir depois)</span>
              </label>
              <select
                id="invite-sector"
                value={sector}
                onChange={(event) => setSector(event.target.value as OrgSector | "")}
                className={INPUT_CLASS}
              >
                <option value="">Não definido</option>
                {ORG_SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {ORG_SECTOR_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="invite-password" className="block text-sm font-medium text-slate-700">
                  Senha temporária
                </label>
                <button
                  type="button"
                  onClick={() => setPassword(generateStrongPassword(12))}
                  className="text-xs font-medium text-accent-600 hover:text-accent-700"
                >
                  Gerar outra
                </button>
              </div>
              <input
                id="invite-password"
                type="text"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${INPUT_CLASS} font-mono`}
              />
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <input
                type="checkbox"
                checked={isWorkManager}
                onChange={(event) => setIsWorkManager(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <HardHat className="h-4 w-4 shrink-0 text-slate-400" />
                  Gerente de obra (app de campo)
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  A conta entra no app Android e passa a aparecer no campo Gerente das obras. Em
                  troca, ela não executa as ações de engenheiro aqui no sistema.
                </span>
              </span>
            </label>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
            >
              {pending ? "Criando…" : "Criar conta"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
