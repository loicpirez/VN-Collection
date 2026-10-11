'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BrainCircuit, Check, Clock, GitCompareArrows, Hourglass, Loader2, Save, Sparkles, Trash2, User as UserIcon } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT, useLocale } from '@/lib/i18n/client';
import { formatMinutes } from '@/lib/format';
import { medianPlaytime } from '@/lib/playtime';
import type { SourceChoice } from '@/lib/source-resolve';
import type { AiPlaytimeEstimate } from '@/lib/types';

import { readApiError } from '@/lib/api-error-read';
interface Props {
  vnId: string;
  /** Persisted raw-source preference; auto uses the four-source median. */
  current: SourceChoice;
  /** VNDB community average length, minutes. */
  vndb: number | null;
  /** ErogameScape user-review median, minutes. */
  egs: number | null;
  /** User's own recorded playtime, minutes. */
  mine: number | null;
  /** Structured AI estimate, independent from the user's recorded time. */
  ai?: AiPlaytimeEstimate | null;
}

type Tab = 'vndb' | 'egs' | 'mine' | 'ai' | 'combined';

/**
 * Numeric variant of FieldCompare for playtime. Four independent
 * sources (VNDB community length / EGS user-review median / user's
 * own recorded time / bounded AI estimate) and a derived "Combined"
 * column equal to the median of every populated positive source.
 * The user can pin any raw source, or the combined value, as canonical
 * via `source_pref.playtime`.
 *
 * The active column drives the inline display on the detail page (see
 * /vn/[id]/page.tsx). Auto uses every populated positive source, including
 * AI without a separate activation action. A raw-source preference does
 * not change the derived median used throughout lists and filters.
 */
export function PlaytimeCompare({ vnId, current, vndb, egs, mine, ai = null }: Props) {
  const t = useT();
  const locale = useLocale();
  const fmt = (min: number | null): string =>
    formatMinutes(min, locale, t.year, { fallback: '-', emptyValue: 'strict_positive' });
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [compareOpen, setCompareOpen] = useState(false);
  const [optimistic, setOptimistic] = useState<SourceChoice>(current);
  const [saving, setSaving] = useState(false);
  const [estimateSaving, setEstimateSaving] = useState(false);
  const [estimate, setEstimate] = useState<AiPlaytimeEstimate | null>(ai);
  const [estimateForm, setEstimateForm] = useState(() => estimateFormFrom(ai));
  const identityRef = useRef<string | null>(vnId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);
  const estimateAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    estimateAbortRef.current?.abort();
    estimateAbortRef.current = null;
    identityRef.current = vnId;
    setCompareOpen(false);
    setOptimistic(current);
    setSaving(false);
    setEstimateSaving(false);
    setEstimate(ai);
    setEstimateForm(estimateFormFrom(ai));
    return () => {
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      mutationInFlightRef.current = false;
      identityRef.current = null;
      estimateAbortRef.current?.abort();
      estimateAbortRef.current = null;
    };
  }, [vnId, current, ai]);

  const vndbHas = vndb != null && vndb > 0;
  const egsHas = egs != null && egs > 0;
  const mineHas = mine != null && mine > 0;
  const aiHas = estimate != null && estimate.minutes > 0;
  const combinedValue = medianPlaytime(vndb, egs, mine, estimate?.minutes);
  const combinedHas = combinedValue != null;

  function pickColumn(pref: SourceChoice): Tab {
    if (pref === 'custom' && mineHas) return 'mine';
    if (pref === 'vndb' && vndbHas) return 'vndb';
    if (pref === 'egs' && egsHas) return 'egs';
    if (pref === 'ai' && aiHas) return 'ai';
    if (combinedHas) return 'combined';
    return 'mine';
  }
  const activeTab: Tab = pickColumn(optimistic);
  const headlineValues: Record<Tab, number | null> = {
    combined: combinedValue,
    egs,
    vndb,
    ai: estimate?.minutes ?? null,
    mine,
  };
  const headlineValue = headlineValues[activeTab];

  async function saveEstimate() {
    if (estimateAbortRef.current) return;
    const minutes = hoursToMinutes(estimateForm.hours);
    const lower = hoursToMinutes(estimateForm.lowerHours);
    const upper = hoursToMinutes(estimateForm.upperHours);
    const confidence = estimateForm.confidence.trim() === '' ? null : Number(estimateForm.confidence) / 100;
    if (
      minutes == null || lower == null || upper == null ||
      lower > minutes || minutes > upper ||
      !estimateForm.model.trim() ||
      (confidence != null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1))
    ) {
      toast.error(t.playtime.aiInvalid);
      return;
    }
    const ownerVnId = vnId;
    const controller = new AbortController();
    estimateAbortRef.current = controller;
    setEstimateSaving(true);
    try {
      const response = await fetch(`/api/collection/${vnId}/ai-playtime`, {
        method: 'PUT',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minutes,
          lower_minutes: lower,
          upper_minutes: upper,
          confidence,
          model: estimateForm.model.trim(),
          rationale: estimateForm.rationale.trim() || null,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response, t.common.error));
      const payload = await response.json() as { estimate?: AiPlaytimeEstimate };
      if (!payload.estimate) throw new Error(t.common.error);
      if (identityRef.current !== ownerVnId || estimateAbortRef.current !== controller || controller.signal.aborted) return;
      setEstimate(payload.estimate);
      setEstimateForm(estimateFormFrom(payload.estimate));
      toast.success(t.toast.saved);
      startTransition(() => router.refresh());
    } catch (error) {
      if (identityRef.current !== ownerVnId || estimateAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((error as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && estimateAbortRef.current === controller) {
        estimateAbortRef.current = null;
        setEstimateSaving(false);
      }
    }
  }

  async function clearEstimate() {
    if (estimateAbortRef.current || !estimate) return;
    const ownerVnId = vnId;
    const controller = new AbortController();
    estimateAbortRef.current = controller;
    setEstimateSaving(true);
    try {
      const response = await fetch(`/api/collection/${vnId}/ai-playtime`, { method: 'DELETE', signal: controller.signal });
      if (!response.ok) throw new Error(await readApiError(response, t.common.error));
      if (identityRef.current !== ownerVnId || estimateAbortRef.current !== controller || controller.signal.aborted) return;
      setEstimate(null);
      setEstimateForm(estimateFormFrom(null));
      if (optimistic === 'ai') setOptimistic('auto');
      toast.success(t.playtime.aiCleared);
      startTransition(() => router.refresh());
    } catch (error) {
      if (identityRef.current !== ownerVnId || estimateAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((error as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && estimateAbortRef.current === controller) {
        estimateAbortRef.current = null;
        setEstimateSaving(false);
      }
    }
  }

  async function persist(next: SourceChoice) {
    if (mutationInFlightRef.current) return;
    const ownerVnId = vnId;
    const previous = optimistic;
    const controller = new AbortController();
    mutationInFlightRef.current = true;
    mutationAbortRef.current = controller;
    setSaving(true);
    setOptimistic(next);
    try {
      const r = await fetch(`/api/collection/${ownerVnId}/source-pref`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playtime: next }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(t.toast.saved);
      startTransition(() => router.refresh());
    } catch (e) {
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setOptimistic(previous);
      toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setSaving(false);
      }
    }
  }

  if (!compareOpen) {
    const IconForTab =
      activeTab === 'mine' ? UserIcon : activeTab === 'ai' ? BrainCircuit : activeTab === 'combined' ? Sparkles : activeTab === 'egs' ? Sparkles : Hourglass;
    return (
      <div className="space-y-2 text-[11px] text-muted">
        <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1">
          <IconForTab className="h-3 w-3" aria-hidden />
          <span className="font-bold uppercase tracking-wider">{t.playtime[activeTab]}</span>
        </span>
        <span className="font-semibold text-white/85">{fmt(headlineValue)}</span>
        <button
          type="button"
          onClick={() => setCompareOpen(true)}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent can-hover:sm:min-h-0"
          title={t.playtime.aiIncludedHint}
        >
          <GitCompareArrows className="h-3 w-3" aria-hidden />
          {t.compare.compareBtn}
        </button>
        <button type="button" onClick={() => setCompareOpen(true)} className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 text-[10px] text-purple-300">
          <BrainCircuit className="h-3 w-3" aria-hidden />
          {t.playtime.aiEstimateTitle}
        </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t.playtime.combined}>
          {[
            { label: t.playtime.vndb, value: vndb },
            { label: t.playtime.egs, value: egs },
            { label: t.playtime.mine, value: mine },
            { label: t.playtime.ai, value: estimate?.minutes ?? null },
          ].map((source) => (
            <div key={source.label} className="rounded-md border border-border bg-bg-card p-2">
              <span className="font-semibold">{source.label}</span>
              <span className="ml-2 font-mono text-white/85">{fmt(source.value)}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] font-normal">{t.playtime.aiIncludedHint}</p>
      </div>
    );
  }

  const cols: Array<{
    key: Tab;
    icon: typeof UserIcon;
    label: string;
    value: number | null;
    onUse?: () => void;
    useLabel?: string;
  }> = [
    { key: 'vndb', icon: Hourglass, label: 'VNDB', value: vndb, onUse: () => persist('vndb'), useLabel: t.compare.useVndb },
    { key: 'egs', icon: Sparkles, label: 'EGS', value: egs, onUse: () => persist('egs'), useLabel: t.compare.useEgs },
    { key: 'ai', icon: BrainCircuit, label: t.playtime.ai, value: estimate?.minutes ?? null },
    {
      key: 'combined',
      icon: Sparkles,
      label: t.playtime.combined,
      value: combinedValue,
      onUse: () => persist('auto'),
      useLabel: t.playtime.useMedian,
    },
    { key: 'mine', icon: Clock, label: t.playtime.mine, value: mine, onUse: () => persist('custom'), useLabel: t.compare.useCustom },
  ];

  return (
    <div className="space-y-2 rounded-lg border border-border bg-bg-elev/30 p-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {cols.map((c) => {
          const active = activeTab === c.key;
          const empty = c.value == null || c.value <= 0;
          return (
            <div
              key={c.key}
              className={`rounded-md border p-2 text-center ${
                active ? 'border-accent bg-accent/5' : 'border-border bg-bg-card'
              }`}
            >
              <div className={`mb-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${
                c.key === 'vndb' ? 'text-muted' : c.key === 'egs' ? 'text-accent' : c.key === 'mine' ? 'text-status-playing' : c.key === 'ai' ? 'text-purple-300' : 'text-accent-blue'
              }`}>
                <c.icon className="h-3 w-3" aria-hidden />
                {c.label}
                {active && <Check className="ml-0.5 inline-block h-3 w-3 text-accent" aria-hidden />}
              </div>
              <div className={`text-sm font-mono ${empty ? 'text-muted/60' : 'text-white/90'}`}>
                {fmt(c.value)}
              </div>
              {c.onUse && <button
                type="button"
                onClick={c.onUse}
                disabled={saving || empty || (active && optimistic !== 'auto')}
                className={`mt-1 inline-flex min-h-[44px] w-full items-center justify-center gap-1 rounded px-1.5 py-0.5 text-[10px] can-hover:sm:min-h-0 ${
                  active
                    ? 'bg-accent/20 text-accent cursor-default'
                    : empty
                      ? 'border border-border bg-bg-elev/30 text-muted/40 cursor-not-allowed'
                      : 'border border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
                }`}
              >
                {(saving || pending) && optimistic === (c.key === 'combined' ? 'auto' : c.key === 'mine' ? 'custom' : c.key) && (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                )}
                {c.useLabel}
              </button>}
            </div>
          );
        })}
      </div>
      <div className="space-y-2 rounded-md border border-border bg-bg-card p-3">
        <div>
          <div className="inline-flex items-center gap-1 text-xs font-semibold text-white">
            <BrainCircuit className="h-3.5 w-3.5 text-purple-300" aria-hidden />
            {t.playtime.aiEstimateTitle}
          </div>
          <p className="mt-0.5 text-[11px] text-muted">{t.playtime.aiEstimateHint}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <EstimateInput label={t.playtime.aiHours} value={estimateForm.hours} onChange={(value) => setEstimateForm((current) => ({ ...current, hours: value }))} />
          <EstimateInput label={t.playtime.aiLowerHours} value={estimateForm.lowerHours} onChange={(value) => setEstimateForm((current) => ({ ...current, lowerHours: value }))} />
          <EstimateInput label={t.playtime.aiUpperHours} value={estimateForm.upperHours} onChange={(value) => setEstimateForm((current) => ({ ...current, upperHours: value }))} />
          <EstimateInput label={t.playtime.aiConfidence} value={estimateForm.confidence} onChange={(value) => setEstimateForm((current) => ({ ...current, confidence: value }))} max="100" />
        </div>
        <label className="block text-[11px] text-muted">
          <span className="mb-1 block">{t.playtime.aiModel}</span>
          <input className="input w-full" maxLength={200} value={estimateForm.model} onChange={(event) => setEstimateForm((current) => ({ ...current, model: event.target.value }))} />
        </label>
        <label className="block text-[11px] text-muted">
          <span className="mb-1 block">{t.playtime.aiRationale}</span>
          <textarea className="input min-h-20 w-full resize-y" maxLength={2000} value={estimateForm.rationale} onChange={(event) => setEstimateForm((current) => ({ ...current, rationale: event.target.value }))} />
        </label>
        {estimate && (
          <p className="text-[10px] text-muted">
            {t.playtime.aiProvenance.replace('{model}', estimate.model).replace('{date}', new Date(estimate.generated_at).toLocaleString(locale))}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-xs" disabled={estimateSaving || !estimate} onClick={clearEstimate}>
            <Trash2 className="h-3 w-3" aria-hidden /> {t.playtime.aiClear}
          </button>
          <button type="button" className="btn btn-primary btn-xs" disabled={estimateSaving} onClick={saveEstimate}>
            {estimateSaving ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Save className="h-3 w-3" aria-hidden />}
            {t.playtime.aiSave}
          </button>
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCompareOpen(false)}
          className="min-h-[44px] rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent can-hover:sm:min-h-0"
        >
          {t.common.close}
        </button>
      </div>
    </div>
  );
}

interface EstimateFormState {
  hours: string;
  lowerHours: string;
  upperHours: string;
  confidence: string;
  model: string;
  rationale: string;
}

function estimateFormFrom(estimate: AiPlaytimeEstimate | null): EstimateFormState {
  const hours = (minutes: number): string => String(Math.round((minutes / 60) * 100) / 100);
  return estimate
    ? {
        hours: hours(estimate.minutes),
        lowerHours: hours(estimate.lower_minutes),
        upperHours: hours(estimate.upper_minutes),
        confidence: estimate.confidence == null ? '' : String(Math.round(estimate.confidence * 100)),
        model: estimate.model,
        rationale: estimate.rationale ?? '',
      }
    : { hours: '', lowerHours: '', upperHours: '', confidence: '', model: '', rationale: '' };
}

function hoursToMinutes(value: string): number | null {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  const minutes = Math.round(hours * 60);
  return Number.isSafeInteger(minutes) && minutes > 0 && minutes <= 10_000_000 ? minutes : null;
}

function EstimateInput({ label, value, onChange, max }: { label: string; value: string; onChange: (value: string) => void; max?: string }) {
  return (
    <label className="block text-[11px] text-muted">
      <span className="mb-1 block">{label}</span>
      <input type="number" inputMode="decimal" min="0" max={max} step={max ? '1' : 'any'} className="input w-full" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
