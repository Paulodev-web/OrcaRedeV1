"use client";

import { useState, useTransition } from "react";
import {
  Building2,
  Check,
  HardHat,
  Loader2,
  ShieldCheck,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { APP_MODULES } from "@/components/layout/modules";
import { InviteMemberDialog } from "./InviteMemberDialog";
import {
  setMemberActiveAction,
  setMemberFieldAccessAction,
  setMemberRoleAction,
  setMemberSectorAction,
  setModulePermissionAction,
  switchActiveOrgAction,
  updateWorkManagerAction,
} from "../_actions/organization";
import {
  ORG_ROLE_LABELS,
  ORG_SECTOR_LABELS,
  ORG_SECTORS,
  type OrgMemberRow,
  type OrganizationScreenData,
  type OrgRole,
  type OrgSector,
} from "@/types/organization";

const SELECT_CLASS =
  "rounded-lg border border-slate-300 bg-surface px-2.5 py-1.5 text-sm text-slate-900 transition-colors focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/30 disabled:cursor-not-allowed disabled:opacity-60";

/** Módulos que fazem sentido conceder: o Portal é a casa de todos. */
const GRANTABLE_MODULES = APP_MODULES.filter(
  (mod) => mod.id !== "portal" && mod.status === "active",
);

export function OrganizacaoManager({ data }: { data: OrganizationScreenData }) {
  const [isPending, startTransition] = useTransition();
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { organizations, activeOrgId, members, canManage, canInvite, viewerUserId } = data;
  const activeOrg = organizations.find((org) => org.id === activeOrgId) ?? null;

  const run = (action: () => Promise<{ success: boolean; error?: string }>, okMessage: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.success) toast.success(okMessage);
      else toast.error(result.error ?? "Não foi possível concluir a alteração.");
    });
  };

  if (!activeOrgId) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-surface p-8 text-center">
        <Building2 className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-4 text-lg font-semibold text-brand-navy">
          Você ainda não pertence a nenhuma organização
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Peça a quem administra a empresa para incluir o seu acesso.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-brand-navy">
              <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
              Organização ativa
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Todo dado que você vê e cria pertence a esta organização.
            </p>
          </div>

          {organizations.length > 1 ? (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">Trabalhando em</span>
              <select
                className={SELECT_CLASS}
                value={activeOrgId}
                disabled={isPending}
                onChange={(event) =>
                  run(
                    () => switchActiveOrgAction(event.target.value),
                    "Organização ativa alterada.",
                  )
                }
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                    {org.isActive ? "" : " (inativa)"}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
              {activeOrg?.name ?? "—"}
            </span>
          )}
        </div>

        {organizations.length > 1 && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Uma organização por vez: ao trocar, você deixa de ver os dados da anterior.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-brand-navy">Equipe</h2>
            <p className="mt-1 text-sm text-slate-500">
              {canManage
                ? "Defina o setor de cada pessoa, a quais módulos ela tem acesso e quem é gerente de obra no app de campo."
                : "Somente o administrador da organização pode alterar acessos."}
            </p>
          </div>
          {canInvite && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700"
            >
              <UserPlus className="h-4 w-4" />
              Cadastrar pessoa
            </button>
          )}
        </div>

        {members.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-500">
            Nenhum membro nesta organização.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                canManage={canManage}
                canInvite={canInvite}
                isSelf={member.userId === viewerUserId}
                isPending={isPending}
                expanded={expandedUserId === member.userId}
                onToggleExpand={() =>
                  setExpandedUserId((current) =>
                    current === member.userId ? null : member.userId,
                  )
                }
                onRun={run}
              />
            ))}
          </ul>
        )}
      </section>

      {inviteOpen && <InviteMemberDialog onClose={() => setInviteOpen(false)} />}
    </div>
  );
}

interface MemberRowProps {
  member: OrgMemberRow;
  canManage: boolean;
  /** Mexer em conta de campo é privilégio de owner, igual ao cadastro. */
  canInvite: boolean;
  isSelf: boolean;
  isPending: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onRun: (
    action: () => Promise<{ success: boolean; error?: string }>,
    okMessage: string,
  ) => void;
}

function MemberRow({
  member,
  canManage,
  canInvite,
  isSelf,
  isPending,
  expanded,
  onToggleExpand,
  onRun,
}: MemberRowProps) {
  const moduleState = new Map(member.modules.map((mod) => [mod.moduleKey, mod]));

  // O banco impede editar o próprio vínculo (anti-escalada de privilégio), então
  // a tela não oferece o controle em vez de deixar o erro estourar depois.
  const editable = canManage && !isSelf && member.isActive;

  return (
    <li className={member.isActive ? "" : "bg-slate-50/60"}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-100 text-sm font-semibold text-accent-700">
          {(member.email ?? "?").charAt(0).toUpperCase()}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">
            {member.fullName?.trim() || member.email || "Sem e-mail cadastrado"}
            {isSelf && <span className="ml-2 text-xs font-normal text-slate-400">(você)</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
            {member.fullName?.trim() && member.email && (
              <>
                <span className="truncate">{member.email}</span>
                <span aria-hidden>·</span>
              </>
            )}
            {member.role === "owner" && <ShieldCheck className="h-3 w-3 text-accent-600" />}
            {ORG_ROLE_LABELS[member.role]}
            {member.isWorkManager && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                <HardHat className="h-3 w-3" />
                Gerente de obra
              </span>
            )}
            {!member.isActive && <span>· acesso desativado</span>}
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-500">
          Setor
          <select
            className={SELECT_CLASS}
            value={member.sector ?? ""}
            disabled={!editable || isPending}
            onChange={(event) =>
              onRun(
                () =>
                  setMemberSectorAction(
                    member.userId,
                    (event.target.value || null) as OrgSector | null,
                  ),
                "Setor atualizado.",
              )
            }
          >
            <option value="">Não definido</option>
            {ORG_SECTORS.map((sector) => (
              <option key={sector} value={sector}>
                {ORG_SECTOR_LABELS[sector]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-500">
          Papel
          <select
            className={SELECT_CLASS}
            value={member.role}
            disabled={!editable || isPending}
            onChange={(event) =>
              onRun(
                () => setMemberRoleAction(member.userId, event.target.value as OrgRole),
                "Papel atualizado.",
              )
            }
          >
            {(Object.keys(ORG_ROLE_LABELS) as OrgRole[]).map((role) => (
              <option key={role} value={role}>
                {ORG_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onToggleExpand}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          Acessos ({member.modules.filter((mod) => mod.canView).length})
        </button>

        {canManage && !isSelf && (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              onRun(
                () => setMemberActiveAction(member.userId, !member.isActive),
                member.isActive ? "Acesso desativado." : "Acesso reativado.",
              )
            }
            title={member.isActive ? "Desativar acesso" : "Reativar acesso"}
            className={`rounded-lg border px-2.5 py-1.5 transition-colors disabled:opacity-50 ${
              member.isActive
                ? "border-slate-300 text-slate-500 hover:bg-red-50 hover:text-red-700"
                : "border-slate-300 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
            }`}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : member.isActive ? (
              <UserMinus className="h-4 w-4" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {expanded && (
        <div className="space-y-5 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <FieldAccessPanel
            // Os campos de nome e telefone são estado local; a chave os remonta
            // quando a action revalida, para não segurarem o valor antigo.
            key={`${member.fullName ?? ""}|${member.phone ?? ""}`}
            member={member}
            canInvite={canInvite}
            isSelf={isSelf}
            isPending={isPending}
            onRun={onRun}
          />

          <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Módulos do sistema
          </p>
          <p className="mb-3 text-xs text-slate-500">
            Ver dá acesso de leitura; editar inclui ver.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {GRANTABLE_MODULES.map((mod) => {
              const state = moduleState.get(mod.id);
              const canView = state?.canView ?? false;
              const canEdit = state?.canEdit ?? false;

              return (
                <li
                  key={mod.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-surface px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-slate-700">{mod.label}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Toggle
                      label="Ver"
                      checked={canView}
                      disabled={!editable || isPending}
                      onChange={(next) =>
                        onRun(
                          () =>
                            setModulePermissionAction(member.userId, mod.id, next, next && canEdit),
                          next ? "Acesso concedido." : "Acesso removido.",
                        )
                      }
                    />
                    <Toggle
                      label="Editar"
                      checked={canEdit}
                      disabled={!editable || isPending}
                      onChange={(next) =>
                        onRun(
                          () => setModulePermissionAction(member.userId, mod.id, true, next),
                          next ? "Permissão de edição concedida." : "Permissão de edição removida.",
                        )
                      }
                    />
                  </span>
                </li>
              );
            })}
          </ul>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Acesso ao app de campo — o que antes era a aba "Gerentes de Obra" de
 * Andamento de Obra → Pessoas.
 *
 * Fica dentro do painel expandido, junto dos módulos, porque é a mesma pergunta
 * feita de outro jeito: o que esta pessoa alcança. Nome e telefone só aparecem
 * aqui porque só no gerente eles saem do sistema (cabeçalho da obra, chat, e o
 * telefone que o engenheiro usa para ligar para o campo).
 */
function FieldAccessPanel({
  member,
  canInvite,
  isSelf,
  isPending,
  onRun,
}: {
  member: OrgMemberRow;
  canInvite: boolean;
  isSelf: boolean;
  isPending: boolean;
  onRun: MemberRowProps["onRun"];
}) {
  const [fullName, setFullName] = useState(member.fullName ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");

  const dirty =
    fullName.trim() !== (member.fullName ?? "").trim() ||
    phone.trim() !== (member.phone ?? "").trim();

  const isGovernance = member.role === "owner" || member.role === "admin";
  const canToggle = canInvite && !isSelf && (member.isWorkManager || !isGovernance);

  return (
    <div className="rounded-lg border border-slate-200 bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            <HardHat className="h-3.5 w-3.5 text-slate-400" />
            App de campo
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {member.isWorkManager
              ? "Entra no app Android e pode ser escolhida no campo Gerente de uma obra."
              : "Sem acesso ao app Android."}
          </p>
        </div>

        {canToggle ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              onRun(
                () => setMemberFieldAccessAction(member.userId, !member.isWorkManager),
                member.isWorkManager
                  ? "Acesso ao app de campo removido."
                  : "Agora esta pessoa é gerente de obra.",
              )
            }
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              member.isWorkManager
                ? "border-slate-300 text-slate-600 hover:bg-red-50 hover:text-red-700"
                : "border-accent-600 text-accent-700 hover:bg-accent-50"
            }`}
          >
            {member.isWorkManager ? "Remover acesso de campo" : "Tornar gerente de obra"}
          </button>
        ) : (
          <p className="max-w-xs shrink-0 text-xs text-slate-400">
            {isSelf
              ? "Você não pode transformar a própria conta em conta de campo."
              : !canInvite
                ? "Só o dono da organização altera isto."
                : "Rebaixe para Membro antes: quem administra a organização não vira conta de campo."}
          </p>
        )}
      </div>

      {member.isWorkManager && (
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
          <label className="min-w-[12rem] flex-1 text-xs text-slate-500">
            Nome
            <input
              type="text"
              value={fullName}
              disabled={!canInvite || isPending}
              onChange={(event) => setFullName(event.target.value)}
              className={`mt-1 w-full ${SELECT_CLASS}`}
            />
          </label>
          <label className="min-w-[10rem] flex-1 text-xs text-slate-500">
            Telefone
            <input
              type="tel"
              value={phone}
              disabled={!canInvite || isPending}
              onChange={(event) => setPhone(event.target.value)}
              className={`mt-1 w-full ${SELECT_CLASS}`}
            />
          </label>
          <button
            type="button"
            disabled={!canInvite || isPending || !dirty || fullName.trim().length === 0}
            onClick={() =>
              onRun(
                () =>
                  updateWorkManagerAction({
                    userId: member.userId,
                    fullName,
                    phone: phone || null,
                  }),
                "Dados do gerente atualizados.",
              )
            }
            className="rounded-lg bg-accent-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-40"
          >
            Salvar
          </button>
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center gap-1.5 text-xs ${
        disabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-600"
      }`}
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
          checked ? "border-accent-600 bg-accent-600 text-white" : "border-slate-300 bg-surface"
        }`}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      {label}
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
