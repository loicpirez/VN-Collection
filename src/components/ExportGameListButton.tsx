'use client';
import { useState } from 'react';
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

  async function run() {
    setBusy(true);
    try {
      const r = await fetch('/api/export/game-list', { cache: 'no-store' });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vn-games-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn" onClick={run} disabled={busy} aria-busy={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}
      {t.dataMgmt.exportGameList}
    </button>
  );
}
