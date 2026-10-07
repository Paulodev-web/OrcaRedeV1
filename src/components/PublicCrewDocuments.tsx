'use client';
import { useEffect, useState } from 'react';
interface PublicDocument { id: string; title: string; kind: string; memberName: string }
export function PublicCrewDocuments({ publicId }: { publicId: string }) {
  const [documents, setDocuments] = useState<PublicDocument[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/obra/${encodeURIComponent(publicId)}/documentos`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((data) => { if (!controller.signal.aborted) { setDocuments(data); setError(false); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [publicId]);
  if (error) return <p className="text-xs text-slate-500">Documentos da equipe temporariamente indisponíveis.</p>;
  if (documents.length === 0) return null;
  return <section className="max-h-48 flex-shrink-0 overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-3 shadow-sm">
    <h3 className="mb-2 text-sm font-semibold text-slate-900">Documentos da equipe</h3>
    <ul className="space-y-2">{documents.map((doc) => <li key={doc.id}>
      <a href={`/api/obra/${encodeURIComponent(publicId)}/documentos/${doc.id}`} target="_blank" rel="noopener noreferrer" className="block text-xs text-blue-700 underline">
        {doc.memberName} — {doc.title} ({doc.kind})
      </a>
    </li>)}</ul>
  </section>;
}
