'use client';
import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { readApiError } from '@/lib/api-error-read';

/**
 * Download button for the plain-text game-list export. The /data export row
 * is server-rendered and its other exports are plain `<a download>`, but
 * this one walks the whole collection, so it is a client control that
 * disables and shows a {@link Loader2} spinner while the file builds, then
 * saves it via a transient object URL. Errors surface as a toast.
 */
export function ExportGameListButton() {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);
  const exportAbortRef = useRef<AbortController | null>(null);
  const exportInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      exportInFlightRef.current = false;
      exportAbortRef.current?.abort();
      exportAbortRef.current = null;
    };
  }, []);

  async function run() {
    if (exportInFlightRef.current) return;
    const controller = new AbortController();
    exportAbortRef.current?.abort();
    exportAbortRef.current = controller;
    exportInFlightRef.current = true;
    setBusy(true);
    try {
      const r = await fetch('/api/export/game-list', { cache: 'no-store', signal: controller.signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const blob = await r.blob();
      if (!mountedRef.current || exportAbortRef.current !== controller || controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vn-games-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (!mountedRef.current || exportAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
      if (exportAbortRef.current === controller) {
        exportAbortRef.current = null;
        exportInFlightRef.current = false;
        if (mountedRef.current) setBusy(false);
      }
    }
  }

  return (
    <button type="button" className="btn" onClick={run} disabled={busy} aria-busy={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}
      {t.dataMgmt.exportGameList}
    </button>
  );
}
