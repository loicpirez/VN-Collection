'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CloudDownload, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

/**
 * Triggers POST /api/staff/[id]/download which pulls the full credit list
 * from VNDB (every VN this staff worked on, every character voiced) and
 * caches it. router.refresh re-reads the page so the extended credits
 * appear in-line.
 */
export function StaffDownloadButton({ sid }: { sid: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function onClick() {
    setBusy(true);
    try {
      const r = await fetch(`/api/staff/${sid}/download`, { method: 'POST' });
      const data = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        productionCount?: number;
        vaCount?: number;
        error?: string;
      };
      if (!r.ok || !data.ok) throw new Error(data.error ?? t.common.error);
      toast.success(`${t.staff.downloadDone} (${(data.productionCount ?? 0) + (data.vaCount ?? 0)})`);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={onClick} disabled={busy} className="btn">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
      {t.staff.downloadAction}
    </button>
  );
}
