'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, Check } from 'lucide-react';
import { toast } from 'sonner';
import { updateWork } from '@/actions/works';
import { STATUS_LABELS, type WorkStatus } from '@/types/works';

interface StatusDropdownProps {
  workId: string;
  current: WorkStatus;
}

const ALL_STATUSES: WorkStatus[] = ['planned', 'in_progress', 'paused', 'completed', 'cancelled'];

const STATUS_DOT: Record<WorkStatus, string> = {
  planned: 'bg-blue-500',
  in_progress: 'bg-emerald-500',
  paused: 'bg-amber-500',
  completed: 'bg-gray-500',
  cancelled: 'bg-red-500',
};

export function StatusDropdown({ workId, current }: StatusDropdownProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleSelect = (next: WorkStatus) => {
    if (next === current) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await updateWork({ id: workId, status: next });
      setOpen(false);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Status atualizado.');
      router.refresh();
    });
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-[#1D3140] hover:bg-gray-50 disabled:opacity-60"
        >
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[current]}`} aria-hidden />
          {STATUS_LABELS[current]}
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="z-50 w-52 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
        >
          {ALL_STATUSES.map((status) => {
            const active = status === current;
            return (
              <button
                key={status}
                type="button"
                onClick={() => handleSelect(status)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm text-[#1D3140] hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
                  {STATUS_LABELS[status]}
                </span>
                {active && <Check className="h-3.5 w-3.5 text-[#64ABDE]" />}
              </button>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
