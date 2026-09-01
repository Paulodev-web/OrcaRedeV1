import type { Metadata } from "next";
import { ConfigShell } from "../_components/ConfigShell";
import { SegmentosManager } from "../_components/SegmentosManager";
import { getConfigSection } from "../_components/sections";
import { listWorkSegmentsForSettings } from "../_data/segments";

const SECTION = getConfigSection("segmentos")!;

export const metadata: Metadata = {
  title: "Segmentos de obra — Configurações — OrcaRede",
  description: SECTION.description,
};

export default async function SegmentosPage() {
  const segments = await listWorkSegmentsForSettings();

  return (
    <ConfigShell
      title={SECTION.label}
      description={SECTION.description}
      sectionId={SECTION.id}
      breadcrumb={[{ label: SECTION.label }]}
    >
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <SegmentosManager segments={segments} />
      </div>
    </ConfigShell>
  );
}
