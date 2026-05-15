'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pause, Play, Square, Timer } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';

interface Props {
  vnId: string;
  /** Current playtime in minutes; used as the base when adding the elapsed value. */
  currentMinutes: number;
  /**
   * Called whenever the live elapsed-minute count changes so a sibling
   * component (e.g. <GameLog/>) can offer to stamp a new note with the
   * running session length. Receives 0 when the timer is idle.
   */
  onElapsedChange?: (minutes: number) => void;
}

/**
 * Compact reading-session timer. Defaults to 25 minutes; user can adjust
 * the target. When the session ends (auto or manual stop), prompts to add
 * the elapsed minutes to `playtime_minutes` on the collection row. The
 * existing updateCollection helper writes an activity row in the same
 * transaction so the journal stays accurate.
 *
 * Time is tracked via Date.now() deltas (not setInterval increments) so
 * the timer stays correct even if the tab is throttled in the background.
 */
export function PomodoroTimer({ vnId, currentMinutes, onElapsedChange }: Props) {
  const t = useT();
  const toast = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [targetMin, setTargetMin] = useState(25);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedMs, setPausedMs] = useState(0);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (startedAt != null && pausedAt == null) {
      tickRef.current = setInterval(() => setNow(Date.now()), 1000);
      return () => {
        if (tickRef.current) clearInterval(tickRef.current);
      };
    }
  }, [startedAt, pausedAt]);

  const elapsedMs = startedAt == null
    ? 0
    : pausedAt != null
      ? pausedAt - startedAt - pausedMs
      : now - startedAt - pausedMs;
  const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const elapsedMin = Math.floor(elapsedSec / 60);

  useEffect(() => {
    onElapsedChange?.(elapsedMin);
  }, [elapsedMin, onElapsedChange]);
  const totalSec = targetMin * 60;
  const remainingSec = Math.max(0, totalSec - elapsedSec);
  const done = startedAt != null && remainingSec === 0;

  function start() {
    setStartedAt(Date.now());
    setPausedAt(null);
    setPausedMs(0);
  }
  function pause() {
    setPausedAt(Date.now());
  }
  function resume() {
    if (pausedAt != null) {
      setPausedMs((p) => p + (Date.now() - pausedAt));
      setPausedAt(null);
    }
  }
  function reset() {
    setStartedAt(null);
    setPausedAt(null);
    setPausedMs(0);
  }

  async function logElapsed() {
    const min = Math.round(elapsedSec / 60);
    if (min <= 0) return;
    const ok = await confirm({ message: t.pomodoro.confirm.replace('{n}', String(min)) });
    if (!ok) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/collection/${vnId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playtime_minutes: currentMinutes + min }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.saved);
      reset();
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const mm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const ss = String(remainingSec % 60).padStart(2, '0');
  const pct = startedAt == null ? 0 : Math.min(100, (elapsedSec / totalSec) * 100);

  return (
    <div className="rounded-lg border border-border bg-bg-elev/30 p-3 text-xs">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="inline-flex items-center gap-1 font-bold uppercase tracking-wider text-muted">
          <Timer className="h-3 w-3 text-accent" /> {t.pomodoro.label}
        </span>
        <input
          type="number"
          min={1}
          max={120}
          value={targetMin}
          disabled={startedAt != null}
          onChange={(e) => setTargetMin(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
          className="input w-16 py-0.5 text-xs"
        />
      </div>
      <div className="mb-2 font-mono text-2xl text-white">{mm}:{ss}</div>
      <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-bg-elev">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {startedAt == null ? (
          <button type="button" onClick={start} className="btn btn-primary text-xs">
            <Play className="h-3 w-3" /> {t.pomodoro.start}
          </button>
        ) : pausedAt == null ? (
          <button type="button" onClick={pause} className="btn text-xs">
            <Pause className="h-3 w-3" /> {t.pomodoro.pause}
          </button>
        ) : (
          <button type="button" onClick={resume} className="btn btn-primary text-xs">
            <Play className="h-3 w-3" /> {t.pomodoro.resume}
          </button>
        )}
        {startedAt != null && (
          <button type="button" onClick={reset} className="btn text-xs" disabled={saving}>
            <Square className="h-3 w-3" /> {t.pomodoro.reset}
          </button>
        )}
        {(elapsedSec >= 60 || done) && (
          <button type="button" onClick={logElapsed} disabled={saving} className="btn btn-primary text-xs">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : '+'}
            {t.pomodoro.logTo} ({Math.round(elapsedSec / 60)}m)
          </button>
        )}
      </div>
    </div>
  );
}
