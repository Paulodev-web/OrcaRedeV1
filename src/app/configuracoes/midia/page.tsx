import type { Metadata } from "next";

import { ConfigShell } from "../_components/ConfigShell";
import { MediaLibraryManager } from "../_components/MediaLibraryManager";
import { getMediaLibrary } from "../_data/media";

export const metadata: Metadata = {
  title: "Biblioteca de mídia — OrcaRede",
  description: "Fotos com tags, reutilizáveis em qualquer proposta comercial.",
};

export default async function MidiaPage() {
  const { items, allTags, error } = await getMediaLibrary();

  return (
    <ConfigShell
      title="Biblioteca de mídia"
      description="Fotos de obras, equipe e estruturas, reutilizáveis em qualquer proposta"
      sectionId="midia"
      breadcrumb={[{ label: "Biblioteca de mídia" }]}
      contentClassName="px-4 py-6 sm:px-6 lg:px-8"
    >
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <MediaLibraryManager items={items} allTags={allTags} />
      )}
    </ConfigShell>
  );
}
