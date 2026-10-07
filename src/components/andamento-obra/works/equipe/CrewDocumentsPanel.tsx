'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setCrewDocumentPublication, uploadCrewDocument } from '@/actions/workCrewDocuments';
import type { WorkTeamMember } from '@/types/works';
import type { CrewDocument } from '@/services/works/getCrewDocuments';

export function CrewDocumentsPanel({ workId, team, documents }: {
  workId: string; team: WorkTeamMember[]; documents: CrewDocument[];
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const names = new Map(team.map((member) => [member.crewMemberId, member.crewMemberName]));
  function publish(doc: CrewDocument) {
    if (!doc.published && !confirm(`Publicar “${doc.title}” de ${names.get(doc.crewMemberId)} para qualquer pessoa com o link desta obra?`)) return;
    setError(null); setMessage(null);
    start(async () => {
      try {
        const result = await setCrewDocumentPublication(workId, doc.id, !doc.published);
        if (!result.success) setError(result.error);
        else { setMessage(doc.published ? 'Documento retirado do portal. Links já emitidos expiram em até um minuto.' : 'Documento publicado nesta obra.'); router.refresh(); }
      } catch { setError('Falha de conexão. Atualize e confira o estado da publicação.'); }
    });
  }
  return <section className="mt-8 space-y-3 rounded-xl border border-gray-200 bg-surface p-4" aria-busy={pending}>
    <h3 className="font-semibold text-neutral-900">Documentos da equipe</h3>
    <p className="text-sm text-gray-600">NR, CNH e outros comprovantes ficam privados até você publicar. A escolha vale somente para esta obra. Publique dados pessoais apenas quando necessário e autorizado.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
    {team.length > 0 ? <form ref={form} className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); data.set('workId', workId);
      setError(null); setMessage(null);
      start(async () => {
        try {
          const result = await uploadCrewDocument(data);
          if (!result.success) setError(result.error);
          else { form.current?.reset(); setMessage('Documento enviado. Continua privado até você publicar.'); router.refresh(); }
        } catch { setError('Falha de conexão ao enviar documento.'); }
      });
    }}>
      <label className="text-xs font-medium">Pessoa
        <select name="crewMemberId" required disabled={pending} className="mt-1 block min-h-11 w-full rounded border p-2 text-sm">
          {team.filter((member) => member.crewMemberIsActive).map((member) => <option key={member.crewMemberId} value={member.crewMemberId}>{member.crewMemberName}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium">Tipo
        <select name="kind" required disabled={pending} className="mt-1 block min-h-11 w-full rounded border p-2 text-sm">
          <option value="NR">NR / treinamento</option><option value="CNH">CNH</option><option value="OTHER">Outro</option>
        </select>
      </label>
      <label className="text-xs font-medium">Título do documento
        <input name="title" required maxLength={120} disabled={pending} className="mt-1 block min-h-11 w-full rounded border p-2 text-sm" placeholder="Ex.: NR-10 — certificado" />
      </label>
      <label className="text-xs font-medium">Arquivo (PDF, JPG ou PNG, até 8 MB)
        <input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png" disabled={pending} className="mt-1 block w-full text-sm" />
      </label>
      <button type="submit" disabled={pending} className="min-h-11 rounded bg-neutral-900 px-3 text-sm text-white disabled:opacity-50">{pending ? 'Processando…' : 'Enviar documento privado'}</button>
    </form> : <p className="text-sm text-gray-500">Aloque uma pessoa à equipe para anexar documentos.</p>}
    <ul className="divide-y divide-gray-100">
      {documents.map((doc) => <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div><p className="text-sm font-medium">{names.get(doc.crewMemberId)} — {doc.title}</p>
          <p className="text-xs text-gray-600">{doc.kind} · {doc.published ? 'Publicado nesta obra' : 'Privado nesta obra'}</p></div>
        <div className="flex items-center gap-3">
          <a href={`/api/works/${workId}/documentos/${doc.id}`} target="_blank" rel="noopener noreferrer" className="text-sm underline">Baixar</a>
          <button type="button" disabled={pending} onClick={() => publish(doc)} className="min-h-11 rounded border px-3 text-sm disabled:opacity-50">{doc.published ? 'Retirar do portal' : 'Publicar nesta obra'}</button>
        </div>
      </li>)}
    </ul>
  </section>;
}
