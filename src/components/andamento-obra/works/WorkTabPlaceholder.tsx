import { Construction } from 'lucide-react';

interface WorkTabPlaceholderProps {
  title: string;
  description?: string;
}

export function WorkTabPlaceholder({ title, description }: WorkTabPlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <Construction className="h-6 w-6" />
      </div>
      <h2 className="text-base font-semibold text-[#1D3140]">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-gray-500">
        {description ?? 'Em construção. Esta aba será habilitada em uma fase futura do roadmap.'}
      </p>
    </div>
  );
}
