'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createCrew, updateCrew } from '@/actions/people';
import { onPortalPrimaryButtonSmClass } from '@/lib/branding';
import type { CrewMemberRow } from '@/types/people';

interface CrewFormDialogProps {
  mode: 'create' | 'edit';
  member?: CrewMemberRow;
  onClose: () => void;
  onCreated: (member: CrewMemberRow) => void;
  onUpdated: (member: CrewMemberRow) => void;
}

export function CrewFormDialog({
  mode,
  member,
  onClose,
  onCreated,
  onUpdated,
}: CrewFormDialogProps) {
  const [fullName, setFullName] = useState(member?.fullName ?? '');
  const [role, setRole] = useState(member?.role ?? '');
  const [phone, setPhone] = useState(member?.phone ?? '');
  const [documentId, setDocumentId] = useState(member?.documentId ?? '');
  const [notes, setNotes] = useState(member?.notes ?? '');
  const [isActive, setIsActive] = useState(member?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'create') {
      startTransition(async () => {
        const result = await createCrew({
          fullName,
          role,
          phone,
          documentId,
          notes,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        if (result.data) onCreated(result.data);
        toast.success('Membro de equipe cadastrado.');
        onClose();
      });
      return;
    }

    if (!member) return;
    startTransition(async () => {
      const result = await updateCrew({
        id: member.id,
        fullName,
        role,
        phone,
        documentId,
        notes,
        isActive,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (result.data) onUpdated(result.data);
      toast.success('Membro atualizado.');
      onClose();
    });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? 'Novo Membro de Equipe' : 'Editar Membro'}
            </DialogTitle>
            <DialogDescription>
              Cadastro interno. Membros de equipe não acessam o sistema; apenas figuram em obras.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-4">
            <div className="space-y-1.5">
              <label htmlFor="crew-name" className="block text-sm font-medium text-gray-700">
                Nome completo
              </label>
              <input
                ref={firstFieldRef}
                id="crew-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="crew-role" className="block text-sm font-medium text-gray-700">
                Função
              </label>
              <input
                id="crew-role"
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ex.: Eletricista, Encarregado..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="crew-phone" className="block text-sm font-medium text-gray-700">
                  Telefone
                </label>
                <input
                  id="crew-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="crew-doc" className="block text-sm font-medium text-gray-700">
                  RG / CPF
                </label>
                <input
                  id="crew-doc"
                  type="text"
                  value={documentId}
                  onChange={(e) => setDocumentId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="crew-notes" className="block text-sm font-medium text-gray-700">
                Observações
              </label>
              <textarea
                id="crew-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
              />
            </div>

            {mode === 'edit' && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#64ABDE] focus:ring-[#64ABDE]"
                />
                Cadastro ativo
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
              {pending ? 'Salvando...' : mode === 'create' ? 'Cadastrar' : 'Salvar alterações'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
