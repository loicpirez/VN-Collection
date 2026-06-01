'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CloudDownload, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { readApiError } from '@/lib/api-error-read';
import { decodeStaffDownloadCreditCount } from '@/lib/operation-client-shape';

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
  const identityRef = useRef<string | null>(sid);
  const inFlightRef = useRef(false);
  const mutationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    identityRef.current = sid;
    inFlightRef.current = false;
    setBusy(false);
    return () => {
      identityRef.current = null;
      inFlightRef.current = false;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, [sid]);

  async function onClick() {
    if (inFlightRef.current) return;
    const ownerSid = sid;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    inFlightRef.current = true;
    setBusy(true);
    try {
      const r = await fetch(`/api/staff/${ownerSid}/download`, { method: 'POST', signal: controller.signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const count = decodeStaffDownloadCreditCount(await r.json());
      if (count === null) throw new Error(t.common.error);
      if (identityRef.current !== ownerSid || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(`${t.staff.downloadDone} (${count})`);
      startTransition(() => router.refresh());
    } catch (e) {
      if (identityRef.current !== ownerSid || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerSid && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        inFlightRef.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <button type="button" onClick={onClick} disabled={busy} className="btn">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CloudDownload className="h-4 w-4" aria-hidden />}
      {t.staff.downloadAction}
    </button>
  );
}
