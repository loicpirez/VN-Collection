'use client';
import { useEffect, useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Image as ImageIcon, Loader2, Save, Trash2, Upload, X } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';

import { readApiError } from '@/lib/api-error-read';
import { decodeSeriesImagePath } from '@/lib/organizer-client-shape';
interface Props {
  seriesId: number;
  initialName: string;
  initialDescription: string | null;
  initialCoverPath: string | null;
  initialBannerPath: string | null;
}

/** Resolve a stored relative path (eg "series/foo.png") to the public URL. */
function toUrl(p: string | null): string | null {
  if (!p) return null;
  if (/^https?:\/\//i.test(p) || p.startsWith('/api/')) return p;
  return `/api/files/${p}`;
}

/**
 * Inline editor for series metadata: name, description, cover, and banner.
 * Save runs PATCH /api/series/{id}; uploads go through the existing
 * `/api/files/upload?kind=series-{cover|banner}` flow.
 */
export function SeriesMetaEditor({ seriesId, initialName, initialDescription, initialCoverPath, initialBannerPath }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [coverPath, setCoverPath] = useState(initialCoverPath);
  const [bannerPath, setBannerPath] = useState(initialBannerPath);
  const [saving, setSaving] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<'cover' | 'banner' | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const identityRef = useRef<number | null>(seriesId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    identityRef.current = seriesId;
    setName(initialName);
    setDescription(initialDescription ?? '');
    setCoverPath(initialCoverPath);
    setBannerPath(initialBannerPath);
    setSaving(false);
    setUploadingKind(null);
    return () => {
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      mutationInFlightRef.current = false;
      identityRef.current = null;
    };
  }, [seriesId, initialName, initialDescription, initialCoverPath, initialBannerPath]);

  const dirty =
    name.trim() !== initialName.trim() ||
    (description.trim() || null) !== (initialDescription?.trim() ?? null) ||
    coverPath !== initialCoverPath ||
    bannerPath !== initialBannerPath;

  function startMutation(): AbortController | null {
    if (mutationInFlightRef.current) return null;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    mutationInFlightRef.current = true;
    return controller;
  }

  function ownsMutation(ownerSeriesId: number, controller: AbortController): boolean {
    return identityRef.current === ownerSeriesId
      && mutationAbortRef.current === controller
      && !controller.signal.aborted;
  }

  function finishMutation(ownerSeriesId: number, controller: AbortController) {
    if (mutationAbortRef.current !== controller) return;
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    if (identityRef.current === ownerSeriesId) {
      setSaving(false);
      setUploadingKind(null);
    }
  }

  async function onUpload(kind: 'cover' | 'banner', file: File) {
    const ownerSeriesId = seriesId;
    const controller = startMutation();
    if (!controller) return;
    setUploadingKind(kind);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', kind);
      const r = await fetch(`/api/series/${ownerSeriesId}/image`, { method: 'POST', body: form, signal: controller.signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const path = decodeSeriesImagePath(await r.json());
      if (!path) throw new Error(t.common.error);
      if (!ownsMutation(ownerSeriesId, controller)) return;
      if (kind === 'cover') setCoverPath(path);
      else setBannerPath(path);
    } catch (e) {
      if (!ownsMutation(ownerSeriesId, controller)) return;
      toast.error((e as Error).message);
    } finally {
      finishMutation(ownerSeriesId, controller);
    }
  }

  async function onSave() {
    const ownerSeriesId = seriesId;
    const controller = startMutation();
    if (!controller) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/series/${ownerSeriesId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          cover_path: coverPath,
          banner_path: bannerPath,
        }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!ownsMutation(ownerSeriesId, controller)) return;
      toast.success(t.toast.saved);
      startTransition(() => router.refresh());
    } catch (e) {
      if (!ownsMutation(ownerSeriesId, controller)) return;
      toast.error((e as Error).message);
    } finally {
      finishMutation(ownerSeriesId, controller);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <div className="grid gap-4 md:grid-cols-[140px_1fr]">
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted">{t.series.cover}</label>
          <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-border bg-bg-elev">
            {coverPath ? (
              <SafeImage
                src={toUrl(coverPath) ?? ''}
                alt={t.series.cover}
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted">
                <ImageIcon className="h-8 w-8" aria-hidden />
              </div>
            )}
            {uploadingKind === 'cover' && (
              <div className="absolute inset-0 flex items-center justify-center bg-bg/70">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              </div>
            )}
          </div>
          <div className="flex gap-1">
            <input
              ref={coverRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload('cover', f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="btn flex-1"
              onClick={() => coverRef.current?.click()}
              disabled={saving || uploadingKind !== null}
            >
              <Upload className="h-3 w-3" aria-hidden /> {t.series.upload}
            </button>
            {coverPath && (
              <button
                type="button"
                className="btn"
                onClick={() => setCoverPath(null)}
                disabled={saving || uploadingKind !== null}
                aria-label={t.common.cancel}
                title={t.common.cancel}
              >
                <Trash2 className="h-3 w-3" aria-hidden />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{t.series.nameField}</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{t.series.descriptionField}</span>
            <textarea
              className="input min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.series.descriptionPlaceholder}
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{t.series.banner}</span>
            <div className="relative h-28 overflow-hidden rounded-lg border border-border bg-bg-elev">
              {bannerPath ? (
                <SafeImage
                  src={toUrl(bannerPath) ?? ''}
                  alt={t.series.banner}
                  className="h-full w-full"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted">
                  <ImageIcon className="h-8 w-8" aria-hidden />
                </div>
              )}
              {uploadingKind === 'banner' && (
                <div className="absolute inset-0 flex items-center justify-center bg-bg/70">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                </div>
              )}
            </div>
            <div className="flex gap-1">
              <input
                ref={bannerRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload('banner', f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="btn"
                onClick={() => bannerRef.current?.click()}
                disabled={saving || uploadingKind !== null}
              >
                <Upload className="h-3 w-3" aria-hidden /> {t.series.upload}
              </button>
              {bannerPath && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setBannerPath(null)}
                  disabled={saving || uploadingKind !== null}
                  aria-label={t.common.cancel}
                  title={t.common.cancel}
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setName(initialName);
              setDescription(initialDescription ?? '');
              setCoverPath(initialCoverPath);
              setBannerPath(initialBannerPath);
            }}
            disabled={saving || uploadingKind !== null}
            className="btn"
          >
            <X className="h-3 w-3" aria-hidden /> {t.common.cancel}
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving || uploadingKind !== null || !name.trim()}
          className="btn btn-primary"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Save className="h-3 w-3" aria-hidden />}
          {t.common.save}
        </button>
      </div>
    </div>
  );
}
