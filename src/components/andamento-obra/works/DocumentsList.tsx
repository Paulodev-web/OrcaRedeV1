import { Download, FileText } from 'lucide-react';

export interface DocumentRow {
  id: string;
  name: string;
  uploadedAt: string;
  signedUrl: string | null;
  unavailableReason?: string;
}

interface DocumentsListProps {
  documents: DocumentRow[];
  emptyHint: string;
}

/**
 * Lista mínima de documentos da obra. Nesta fase, exibe apenas o "Projeto importado"
 * (PDF copiado do orçamento) quando existir. Upload manual entra em fase futura.
 */
export function DocumentsList({ documents, emptyHint }: DocumentsListProps) {
  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-12 text-center">
        <p className="text-sm text-gray-500">{emptyHint}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {documents.map((doc) => (
        <li
          key={doc.id}
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[#1D3140]">{doc.name}</p>
            <p className="text-[11px] text-gray-500">{formatDate(doc.uploadedAt)}</p>
            {doc.unavailableReason && (
              <p className="mt-0.5 text-[11px] text-amber-700">{doc.unavailableReason}</p>
            )}
          </div>
          {doc.signedUrl ? (
            <a
              href={doc.signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-[#1D3140] hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" /> Baixar
            </a>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-400">
              Indisponível
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
