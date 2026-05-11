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
  if (!used) return null;
  if (used === 'vndb' && !fellBack) return null;
  const label = used === 'egs' ? 'EGS' : 'VNDB';
  return (
    <span
      className="ml-2 rounded bg-bg-elev/60 px-1.5 py-0.5 align-middle text-[9px] font-normal normal-case tracking-normal text-muted"
      title={fellBack ? `${label} (auto-fallback)` : label}
    >
      {fellBack ? `↪ ${label}` : label}
    </span>
  );
}
