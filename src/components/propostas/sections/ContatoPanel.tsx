"use client";

import { EditorCard, Notice } from '../shared';
import type { PanelProps } from './types';

/**
 * Contato — leitura pura.
 *
 * Os dados vêm de `company_settings`, uma linha por usuário. Editá-los aqui
 * criaria duas fontes de verdade para o mesmo cadastro; a tela certa é
 * Configurações › Empresa, que é de outra frente.
 */
export function ContatoPanel({ context, origin }: PanelProps) {
  const { company } = context.record;

  const fields: Array<[string, string | null]> = [
    ['Razão social', company.legalName || null],
    ['Nome fantasia', company.tradeName],
    ['CNPJ', company.cnpj || null],
    ['Endereço', company.address || null],
    ['Telefone', company.phonePrimary || null],
    ['Telefone secundário', company.phoneSecondary],
    ['E-mail', company.email || null],
    ['Site', company.website],
    ['Instagram', company.instagram],
    ['WhatsApp', company.whatsappNumber || null],
  ];

  const missing = fields.filter(([label]) =>
    ['Razão social', 'CNPJ', 'Telefone', 'E-mail', 'WhatsApp'].includes(label),
  ).filter(([, value]) => !value);

  return (
    <EditorCard title="Contato" origin={origin}>
      <dl className="grid gap-3 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className={value ? 'text-sm text-slate-700' : 'text-sm italic text-slate-300'}>
              {value ?? 'não informado'}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 space-y-2">
        {company.logoUrl ? null : (
          <Notice tone="warning">Sem logo cadastrado: a capa do PDF sai sem a marca.</Notice>
        )}
        {missing.length > 0 ? (
          <Notice tone="warning">
            Faltam dados obrigatórios da empresa: {missing.map(([label]) => label).join(', ')}.
            Preencha em Configurações › Empresa — o WhatsApp é o do botão da página pública.
          </Notice>
        ) : (
          <Notice>Cadastro da empresa completo. Editar em Configurações › Empresa.</Notice>
        )}
      </div>
    </EditorCard>
  );
}
