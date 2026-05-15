'use client';
import { CornerDownRight } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface Props {
  used: 'vndb' | 'egs' | null;
  fellBack: boolean;
}

/**
 * Tiny badge that says where a particular displayed value came from.
 * Hidden when the value came from VNDB (the default) — only surfaces the
 * info when something interesting happened (EGS source or auto-fallback).
 */
export function SourceTag({ used, fellBack }: Props) {
  const t = useT();
  if (!used) return null;
  if (used === 'vndb' && !fellBack) return null;
  const label = used === 'egs' ? 'EGS' : 'VNDB';
  const titleText = fellBack ? `${label} · ${t.sourcePref.autoFallback}` : label;
  return (
    <span
      className="ml-2 inline-flex items-center gap-1 rounded bg-bg-elev/60 px-1.5 py-0.5 align-middle text-[9px] font-normal normal-case tracking-normal text-muted"
      title={titleText}
    >
      {fellBack && <CornerDownRight className="h-2.5 w-2.5" aria-hidden />}
      {label}
    </span>
  );
}
