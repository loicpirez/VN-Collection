'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Gamepad2,
  Loader2,
  PackageCheck,
  Upload,
} from 'lucide-react';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastProvider';
import { useLocale, useT } from '@/lib/i18n/client';
import { fmtNum } from '@/lib/locale-number';
import {
  decodeVndbLocalImportResponse,
  type VndbLocalImportApplyClient,
  type VndbLocalImportCandidateClient,
  type VndbLocalImportErrorClient,
  type VndbLocalImportPreviewClient,
} from '@/lib/vndb-local-import-client-shape';

const PAGE_SIZE = 25;
const APPLY_BATCH_SIZE = 25;
const RELEASE_STATUS_KEYS = ['unknown', 'pending', 'obtained', 'onLoan', 'deleted'] as const;

interface ImportIssue {
  key: string;
  label: string;
  kind: 'conflict' | 'failure';
  detail: string;
}

function selectionFor(candidate: VndbLocalImportCandidateClient): Record<string, unknown> {
  return candidate.kind === 'vn'
    ? { kind: 'vn', vn_id: candidate.vn_id, local_status: candidate.local_status }
    : {
        kind: 'release',
        vn_id: candidate.vn_id,
        release_id: candidate.release_id,
        remote_status: candidate.remote_status,
      };
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

/** Review and explicitly import local collection membership and owned editions into VNDB. */
export function VndbLocalImportPanel() {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { confirm } = useConfirm();
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<VndbLocalImportPreviewClient | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(1);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [issues, setIssues] = useState<ImportIssue[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const pageCount = Math.max(1, Math.ceil((preview?.candidates.length ?? 0) / PAGE_SIZE));
  const visibleCandidates = preview?.candidates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? [];
  const candidateByKey = useMemo(
    () => new Map(preview?.candidates.map((candidate) => [candidate.key, candidate]) ?? []),
    [preview],
  );

  function errorMessage(code: VndbLocalImportErrorClient['errorCode']): string {
    if (code === 'vndb_token_required') return t.apiErrors.vndbTokenRequired;
    if (code === 'vndb_list_read_permission_required') return t.settings.vndbImportReadPermission;
    return t.settings.vndbImportWritePermission;
  }

  async function request(
    body: Record<string, unknown>,
    controller: AbortController,
  ): Promise<VndbLocalImportPreviewClient | VndbLocalImportApplyClient> {
    const response = await fetch('/api/vndb/import-local-library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const decoded = decodeVndbLocalImportResponse(await response.json().catch(() => null));
    if (!decoded) throw new Error(t.common.error);
    if (!decoded.ok) throw new Error(errorMessage(decoded.errorCode));
    if (!response.ok) throw new Error(t.common.error);
    return decoded;
  }

  async function compare(): Promise<void> {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setIssues([]);
    try {
      const result = await request({ action: 'preview' }, controller);
      if (result.action !== 'preview') throw new Error(t.common.error);
      if (controller.signal.aborted) return;
      setPreview(result);
      setSelectedKeys(new Set());
      setPage(1);
      toast.success(t.settings.vndbImportPreviewReady.replace('{count}', fmtNum(result.candidates.length, locale)));
    } catch (error) {
      if (!isAbortError(error) && mountedRef.current) {
        toast.error(error instanceof Error ? error.message : t.common.error);
      }
    } finally {
      abortRef.current = null;
      if (mountedRef.current) setBusy(false);
    }
  }

  function issueDetail(issue: VndbLocalImportApplyClient['conflicts'][number] | VndbLocalImportApplyClient['failures'][number]): string {
    if ('reason' in issue) {
      if (issue.reason === 'local_missing') return t.settings.vndbImportConflictLocalMissing;
      if (issue.reason === 'local_changed') return t.settings.vndbImportConflictLocalChanged;
      return t.settings.vndbImportConflictRemoteChanged;
    }
    return issue.code === 'vndb_token_required'
      ? t.apiErrors.vndbTokenRequired
      : t.settings.vndbImportWriteFailed;
  }

  async function applySelected(currentPreview: VndbLocalImportPreviewClient): Promise<void> {
    const selected = currentPreview.candidates.filter((candidate) => selectedKeys.has(candidate.key));
    const approved = await confirm({
      message: t.settings.vndbImportConfirm.replace('{count}', fmtNum(selected.length, locale)),
      tone: 'danger',
    });
    if (!approved || !mountedRef.current) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setIssues([]);
    setProgress({ done: 0, total: selected.length });
    const appliedKeys = new Set<string>();
    const nextIssues: ImportIssue[] = [];
    try {
      for (let offset = 0; offset < selected.length; offset += APPLY_BATCH_SIZE) {
        const batch = selected.slice(offset, offset + APPLY_BATCH_SIZE);
        const result = await request({ action: 'apply', selections: batch.map(selectionFor) }, controller);
        if (result.action !== 'apply') throw new Error(t.common.error);
        for (const key of result.applied) appliedKeys.add(key);
        for (const issue of result.conflicts) {
          nextIssues.push({
            key: issue.key,
            label: candidateByKey.get(issue.key)?.title ?? issue.key,
            kind: 'conflict',
            detail: issueDetail(issue),
          });
        }
        for (const issue of result.failures) {
          nextIssues.push({
            key: issue.key,
            label: candidateByKey.get(issue.key)?.title ?? issue.key,
            kind: 'failure',
            detail: issueDetail(issue),
          });
        }
        if (controller.signal.aborted) return;
        setProgress({ done: Math.min(offset + batch.length, selected.length), total: selected.length });
      }

      const refreshed = await request({ action: 'preview' }, controller);
      if (refreshed.action !== 'preview') throw new Error(t.common.error);
      if (controller.signal.aborted) return;
      setPreview(refreshed);
      setIssues(nextIssues);
      const remainingKeys = new Set(nextIssues.map((issue) => issue.key));
      setSelectedKeys(new Set(refreshed.candidates.filter((candidate) => remainingKeys.has(candidate.key)).map((candidate) => candidate.key)));
      setPage(1);
      toast.success(t.settings.vndbImportDone
        .replace('{applied}', fmtNum(appliedKeys.size, locale))
        .replace('{issues}', fmtNum(nextIssues.length, locale)));
    } catch (error) {
      if (!isAbortError(error) && mountedRef.current) {
        toast.error(error instanceof Error ? error.message : t.common.error);
        setIssues(nextIssues);
      }
    } finally {
      abortRef.current = null;
      if (mountedRef.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  }

  const progressPercent = progress
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <section className="mt-3 rounded-md border border-border bg-bg-elev/30 p-3 text-xs" aria-labelledby="vndb-local-import-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[180px] flex-1">
          <div id="vndb-local-import-title" className="font-bold">{t.settings.vndbImportTitle}</div>
          <div className="text-[10px] text-muted">{t.settings.vndbImportDesc}</div>
        </div>
        <button type="button" className="btn btn-secondary min-h-[44px] shrink-0" onClick={() => void compare()} disabled={busy}>
          {busy && !progress ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
          {t.settings.vndbImportCompare}
        </button>
      </div>

      {progress && (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-muted">
            <span>{t.settings.vndbImportProgress}</span>
            <span>{fmtNum(progress.done, locale)} / {fmtNum(progress.total, locale)} ({progressPercent}%)</span>
          </div>
          <div className="h-2 overflow-hidden rounded-sm bg-bg-deep" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      {preview && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <p className="text-[10px] text-muted">
            {t.settings.vndbImportSummary
              .replace('{vns}', fmtNum(preview.summary.scanned_vns, locale))
              .replace('{releases}', fmtNum(preview.summary.scanned_releases, locale))
              .replace('{candidates}', fmtNum(preview.candidates.length, locale))
              .replace('{aligned}', fmtNum(preview.summary.already_in_vndb + preview.summary.already_obtained, locale))
              .replace('{ineligible}', fmtNum(preview.summary.ineligible, locale))}
          </p>

          {!preview.canApply && (
            <div className="flex items-start gap-2 rounded-md border border-status-on-hold/40 bg-status-on-hold/10 p-2 text-status-on-hold">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{t.settings.vndbImportWritePermission}</span>
            </div>
          )}

          {preview.candidates.length === 0 ? (
            <p className="rounded-md border border-border/60 p-3 text-center text-muted">{t.settings.vndbImportNoChanges}</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] text-muted">
                  {t.settings.vndbImportSelected.replace('{count}', fmtNum(selectedKeys.size, locale))}
                </span>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="btn btn-sm min-h-[44px]"
                    onClick={() => setSelectedKeys(new Set(preview.candidates.map((candidate) => candidate.key)))}
                    disabled={busy || selectedKeys.size === preview.candidates.length}
                  >
                    {t.settings.vndbImportSelectAll}
                  </button>
                  <button type="button" className="btn btn-sm min-h-[44px]" onClick={() => setSelectedKeys(new Set())} disabled={busy || selectedKeys.size === 0}>
                    {t.settings.vndbImportClear}
                  </button>
                  <button type="button" className="btn btn-primary btn-sm min-h-[44px]" onClick={() => void applySelected(preview)} disabled={busy || selectedKeys.size === 0 || !preview.canApply}>
                    <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                    {t.settings.vndbImportApply}
                  </button>
                </div>
              </div>

              <ul className="divide-y divide-border/50">
                {visibleCandidates.map((candidate) => (
                  <li key={candidate.key} className="flex min-h-[52px] items-center gap-2 py-1.5">
                    <label className="tap-target inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-bg-elev">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-accent"
                        checked={selectedKeys.has(candidate.key)}
                        onChange={(event) => setSelectedKeys((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(candidate.key);
                          else next.delete(candidate.key);
                          return next;
                        })}
                        aria-label={t.settings.vndbImportSelectItem.replace('{title}', candidate.title)}
                      />
                    </label>
                    {candidate.kind === 'vn'
                      ? <Gamepad2 className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                      : <PackageCheck className="h-4 w-4 shrink-0 text-status-completed" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <Link href={`/vn/${candidate.vn_id}`} target="_blank" rel="noopener noreferrer" className="block truncate font-medium hover:text-accent">
                        {candidate.title}
                      </Link>
                      <div className="truncate text-[10px] text-muted">
                        {candidate.kind === 'vn'
                          ? `${t.settings.vndbImportGame}: ${t.status[candidate.local_status]}`
                          : `${t.settings.vndbImportEdition}: ${candidate.edition_label || candidate.release_id}`}
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted">
                      {candidate.kind === 'vn'
                        ? t.settings.vndbImportMissing
                        : candidate.remote_status === null
                          ? t.releases.vndbListNotListed
                          : t.releases.vndbListStatuses[RELEASE_STATUS_KEYS[candidate.remote_status]]}
                    </span>
                  </li>
                ))}
              </ul>

              {pageCount > 1 && (
                <div className="flex items-center justify-center gap-2 border-t border-border/60 pt-2">
                  <button type="button" className="tap-target inline-flex items-center justify-center rounded-md border border-border" aria-label={t.common.prev} disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <span className="text-[10px] text-muted">{page} / {pageCount}</span>
                  <button type="button" className="tap-target inline-flex items-center justify-center rounded-md border border-border" aria-label={t.common.next} disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              )}
            </div>
          )}

          {preview.ineligible.length > 0 && (
            <details className="rounded-md border border-border/60 p-2 text-[10px] text-muted">
              <summary className="min-h-[44px] cursor-pointer py-3 font-semibold text-fg">
                {t.settings.vndbImportIneligible.replace('{count}', fmtNum(preview.ineligible.length, locale))}
              </summary>
              <ul className="space-y-1 border-t border-border/50 pt-2">
                {preview.ineligible.map((entry) => (
                  <li key={entry.key} className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate">{entry.title}</span>
                    <span className="shrink-0">
                      {entry.reason === 'unmapped_vn' ? t.settings.vndbImportUnmapped : t.settings.vndbImportSyntheticRelease}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {issues.length > 0 && (
        <details open className="mt-3 rounded-md border border-status-on-hold/40 bg-status-on-hold/10 p-2 text-[10px]">
          <summary className="min-h-[44px] cursor-pointer py-3 font-semibold text-status-on-hold">
            {t.settings.vndbImportIssues.replace('{count}', fmtNum(issues.length, locale))}
          </summary>
          <ul className="space-y-1 border-t border-status-on-hold/20 pt-2">
            {issues.map((issue) => (
              <li key={`${issue.kind}:${issue.key}`} className="flex flex-wrap justify-between gap-2">
                <span>{issue.label}</span>
                <span className="text-muted">{issue.detail}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
