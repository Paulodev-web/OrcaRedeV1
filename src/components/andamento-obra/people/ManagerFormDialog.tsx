'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Copy, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createManager, updateManager } from '@/actions/people';
import { onPortalPrimaryButtonSmClass } from '@/lib/branding';
import type { ManagerRow } from '@/types/people';

interface ManagerFormDialogProps {
  mode: 'create' | 'edit';
  manager?: ManagerRow;
  onClose: () => void;
  onCreated: (manager: ManagerRow) => void;
  onUpdated: (manager: ManagerRow) => void;
}

const PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';

function generateStrongPassword(length = 12): string {
  if (typeof window === 'undefined' || !window.crypto?.getRandomValues) {
    let pwd = '';
    for (let i = 0; i < length; i += 1) {
      pwd += PASSWORD_ALPHABET[Math.floor(Math.random() * PASSWORD_ALPHABET.length)];
    }
    return pwd;
  }
  const bytes = new Uint32Array(length);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
}

export function ManagerFormDialog({
  mode,
  manager,
  onClose,
  onCreated,
  onUpdated,
}: ManagerFormDialogProps) {
  const [fullName, setFullName] = useState(manager?.fullName ?? '');
  const [email, setEmail] = useState(manager?.email ?? '');
  const [phone, setPhone] = useState(manager?.phone ?? '');
  const [isActive, setIsActive] = useState(manager?.isActive ?? true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const handleGeneratePassword = () => {
    setPassword(generateStrongPassword(12));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'create') {
      if (password.length < 8) {
        setError('A senha temporária precisa ter pelo menos 8 caracteres.');
        return;
      }
      startTransition(async () => {
        const result = await createManager({
          fullName,
          email,
          phone,
          temporaryPassword: password,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        const data = result.data;
        if (!data) return;
        onCreated(data.manager);
        setCreatedPassword(data.temporaryPassword);
      });
      return;
    }

    if (!manager) return;
    startTransition(async () => {
      const result = await updateManager({
        id: manager.id,
        fullName,
        phone,
        isActive,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (result.data) onUpdated(result.data);
      toast.success('Gerente atualizado.');
      onClose();
    });
  };

  const handleCopy = async () => {
    if (!createdPassword) return;
    try {
      await navigator.clipboard.writeText(createdPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Não foi possível copiar. Anote a senha manualmente.');
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  if (createdPassword) {
    return (
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Conta criada com sucesso</DialogTitle>
            <DialogDescription>
              Anote ou copie a senha temporária. Por segurança, ela <strong>não será exibida
              novamente</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>
                  Compartilhe a senha com o gerente por um canal seguro. Após fechar este modal, ela
                  não estará mais acessível no sistema.
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                Senha temporária
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-base text-[#1D3140]">
                  {createdPassword}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  aria-label="Copiar senha"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className={`${onPortalPrimaryButtonSmClass} rounded-lg px-4 py-2 text-sm`}
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
            <DialogTitle>
              {mode === 'create' ? 'Novo Gerente de Obra' : 'Editar Gerente'}
            </DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? 'O gerente recebe uma conta com login no sistema. E-mail e senha não poderão ser alterados pela UI depois.'
                : 'Edite nome, telefone e status. E-mail e senha não são alterados aqui.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-4">
            <div className="space-y-1.5">
              <label htmlFor="manager-name" className="block text-sm font-medium text-gray-700">
                Nome completo
              </label>
              <input
                ref={firstFieldRef}
                id="manager-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="manager-email" className="block text-sm font-medium text-gray-700">
                E-mail {mode === 'edit' && <span className="text-xs text-gray-400">(não editável)</span>}
              </label>
              <input
                id="manager-email"
                type="email"
                required={mode === 'create'}
                disabled={mode === 'edit'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="manager-phone" className="block text-sm font-medium text-gray-700">
                Telefone
              </label>
              <input
                id="manager-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
              />
            </div>

            {mode === 'create' && (
              <div className="space-y-1.5">
                <label htmlFor="manager-password" className="block text-sm font-medium text-gray-700">
                  Senha temporária
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="manager-password"
                    type="text"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
                  />
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Gerar
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Você verá esta senha apenas uma vez após salvar.
                </p>
              </div>
            )}

            {mode === 'edit' && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#64ABDE] focus:ring-[#64ABDE]"
                />
                Conta ativa
              </label>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className={`${onPortalPrimaryButtonSmClass} rounded-lg px-4 py-2 text-sm disabled:opacity-60`}
            >
              {pending ? 'Salvando...' : mode === 'create' ? 'Criar gerente' : 'Salvar alterações'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
