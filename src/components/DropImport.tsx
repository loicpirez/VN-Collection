'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

/**
 * Page-wide drag-and-drop receiver. Mounts a fixed overlay that only
 * appears while the user is dragging a file over the document. Drop forwards
 * to the existing /api/collection/import endpoint (JSON merge) or to
 * /api/backup/restore for .db replacements.
 *
 * Picks the route by inspecting the file extension — no MIME sniffing,
 * matches how the existing ImportPanel branches.
 */
export function DropImport() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const counter = useRef(0);

  useEffect(() => {
    function onEnter(e: DragEvent) {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
      counter.current += 1;
      setOver(true);
    }
    function onLeave() {
      counter.current = Math.max(0, counter.current - 1);
      if (counter.current === 0) setOver(false);
    }
    function onOver(e: DragEvent) {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
      }
    }
    async function onDrop(e: DragEvent) {
      counter.current = 0;
      setOver(false);
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const lower = file.name.toLowerCase();
      const isDb = lower.endsWith('.db') || lower.endsWith('.sqlite');
      if (!lower.endsWith('.json') && !isDb) {
        toast.error(t.dropImport.unsupported);
        return;
      }
      if (isDb && !confirm(t.dropImport.dbConfirm.replace('{name}', file.name))) return;
      setBusy(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const url = isDb ? '/api/backup/restore' : '/api/collection/import';
        const r = await fetch(url, { method: 'POST', body: fd });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
        toast.success(t.dropImport.ok);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    }

    document.addEventListener('dragenter', onEnter);
    document.addEventListener('dragleave', onLeave);
    document.addEventListener('dragover', onOver);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragenter', onEnter);
      document.removeEventListener('dragleave', onLeave);
      document.removeEventListener('dragover', onOver);
      document.removeEventListener('drop', onDrop);
    };
  }, [router, t, toast]);

  if (!over && !busy) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-bg/80 backdrop-blur">
      <div className="rounded-2xl border-2 border-dashed border-accent bg-bg-card px-8 py-6 text-center">
        <UploadCloud className="mx-auto h-10 w-10 text-accent" />
        <h2 className="mt-2 text-lg font-bold">{busy ? t.dropImport.importing : t.dropImport.title}</h2>
        <p className="mt-1 text-xs text-muted">{t.dropImport.hint}</p>
      </div>
    </div>
  );
}
