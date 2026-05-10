'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  ariaLabel?: string;
}

const LOCALE_TAG: Record<string, string> = { fr: 'fr-FR', en: 'en-GB', ja: 'ja-JP' };

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseIso(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function DateInput({ value, onChange, className = '', ariaLabel }: Props) {
  const t = useT();
  const locale = useLocale();
  const tag = LOCALE_TAG[locale] ?? 'fr-FR';
  const id = useId();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(() => parseIso(value) ?? new Date());
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // When value changes externally, snap the view to that month.
  useEffect(() => {
    const parsed = parseIso(value);
    if (parsed) setView(startOfMonth(parsed));
  }, [value]);

  const formatted = useMemo(() => {
    const d = parseIso(value);
    if (!d) return '';
    try {
      return new Intl.DateTimeFormat(tag, { dateStyle: 'long' }).format(d);
    } catch {
      return value;
    }
  }, [value, tag]);

  const monthLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' }).format(view);
    } catch {
      return `${view.getFullYear()}-${pad(view.getMonth() + 1)}`;
    }
  }, [view, tag]);

  const weekdayHeaders = useMemo(() => {
    // Build 7 weekday labels starting from the locale's first day of week.
    // We don't have Intl.Locale.weekInfo on all engines, so we just use Monday
    // for fr/ja and Sunday for en.
    const first = locale === 'en' ? 0 : 1;
    const labels: string[] = [];
    const fmt = new Intl.DateTimeFormat(tag, { weekday: 'narrow' });
    // Pick a known week (Sun 2024-01-07 = day 0)
    const ref = new Date(2024, 0, 7);
    for (let i = 0; i < 7; i++) {
      const d = new Date(ref);
      d.setDate(ref.getDate() + ((first + i) % 7));
      labels.push(fmt.format(d));
    }
    return { labels, first };
  }, [tag, locale]);

  const cells = useMemo(() => {
    const month = view.getMonth();
    const year = view.getFullYear();
    const first = startOfMonth(view);
    const offset = (first.getDay() - weekdayHeaders.first + 7) % 7;
    const total = 6 * 7;
    const arr: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(year, month, 1 - offset + i);
      arr.push({ date: d, inMonth: d.getMonth() === month });
    }
    return arr;
  }, [view, weekdayHeaders.first]);

  const today = new Date();
  const todayIso = toIso(today);
  const selectedIso = value;

  function setSelected(date: Date) {
    onChange(toIso(date));
    setOpen(false);
  }

  function setToday() {
    onChange(todayIso);
    setOpen(false);
  }

  function clear() {
    onChange('');
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    setView(new Date(view.getFullYear(), view.getMonth() + delta, 1));
  }
  function shiftYear(delta: number) {
    setView(new Date(view.getFullYear() + delta, view.getMonth(), 1));
  }

  return (
    <div ref={wrapperRef} className="relative flex flex-col gap-1">
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center justify-between gap-2 ${className || 'input'}`}
      >
        <span className="inline-flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted" aria-hidden />
          <span className={value ? 'text-white' : 'text-muted/60'}>
            {formatted || t.dateInput.empty}
          </span>
        </span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              clear();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                clear();
              }
            }}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-bg-elev hover:text-white"
            aria-label={t.dateInput.clear}
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[280px] rounded-xl border border-border bg-bg-card p-3 shadow-card">
          <div className="mb-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftYear(-1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-bg-elev hover:text-white"
              aria-label={t.dateInput.prevYear}
              title={t.dateInput.prevYear}
            >
              <ChevronLeft className="h-3 w-3" />
              <ChevronLeft className="-ml-2 h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-bg-elev hover:text-white"
              aria-label={t.dateInput.prevMonth}
              title={t.dateInput.prevMonth}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex-1 text-center text-xs font-bold uppercase tracking-wider text-white">
              {monthLabel}
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-bg-elev hover:text-white"
              aria-label={t.dateInput.nextMonth}
              title={t.dateInput.nextMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => shiftYear(1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-bg-elev hover:text-white"
              aria-label={t.dateInput.nextYear}
              title={t.dateInput.nextYear}
            >
              <ChevronRight className="h-3 w-3" />
              <ChevronRight className="-ml-2 h-3 w-3" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-muted/70">
            {weekdayHeaders.labels.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map(({ date, inMonth }) => {
              const iso = toIso(date);
              const isSelected = iso === selectedIso;
              const isToday = iso === todayIso;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelected(date)}
                  className={`h-8 rounded text-xs tabular-nums transition-colors ${
                    !inMonth ? 'text-muted/30' : 'text-white'
                  } ${
                    isSelected
                      ? 'bg-accent text-bg font-bold'
                      : isToday
                        ? 'border border-accent/60 bg-bg-elev'
                        : 'hover:bg-bg-elev'
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={setToday}
              className="text-accent hover:underline"
            >
              {t.dateInput.today}
            </button>
            {value && (
              <button
                type="button"
                onClick={clear}
                className="text-muted hover:text-status-dropped"
              >
                {t.dateInput.clear}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
