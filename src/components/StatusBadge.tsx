'use client';
import { useT } from '@/lib/i18n/client';
import { StatusIcon } from './StatusIcon';
import type { Status } from '@/lib/types';

const COLOR_BY_STATUS: Record<Status, string> = {
  planning: 'bg-status-planning text-white',
  playing: 'bg-status-playing text-bg',
  completed: 'bg-status-completed text-bg',
  on_hold: 'bg-status-on_hold text-bg',
  dropped: 'bg-status-dropped text-bg',
};

export function StatusBadge({ status, className = '' }: { status: Status; className?: string }) {
  const t = useT();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${COLOR_BY_STATUS[status]} ${className}`}
    >
      <StatusIcon status={status} className="h-3 w-3" />
      <span>{t.status[status]}</span>
    </span>
  );
}
