import { CheckCircle2, CircleDashed, PauseCircle, PlayCircle, XCircle, type LucideIcon } from 'lucide-react';
import type { Status } from '@/lib/types';

export const STATUS_ICON: Record<Status, LucideIcon> = {
  planning: CircleDashed,
  playing: PlayCircle,
  completed: CheckCircle2,
  on_hold: PauseCircle,
  dropped: XCircle,
};

export function StatusIcon({ status, className = 'h-4 w-4' }: { status: Status; className?: string }) {
  const Icon = STATUS_ICON[status];
  return <Icon className={className} aria-hidden />;
}
