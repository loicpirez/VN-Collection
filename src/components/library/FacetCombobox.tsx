'use client';
import { Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface FacetOption {
  value: string;
  label: string;
  count?: number;
}

const MAX_VISIBLE_OPTIONS = 60;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Searchable bounded selector for high-cardinality library facets.
 *
 * @param props Facet options, active URL value, localized labels, and change handler.
 * @returns Accessible combobox with a bounded listbox and visible result count.
 */
export function FacetCombobox({
  value,
  options,
  label,
  searchPlaceholder,
  clearLabel,
  resultLabel,
  noResultsLabel,
  onChange,
}: {
  value: string;
  options: FacetOption[];
  label: string;
  searchPlaceholder: string;
  clearLabel: string;
  resultLabel: string;
  noResultsLabel: string;
  onChange: (value: string) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = useMemo(() => options.find((option) => option.value === value), [options, value]);
  const matching = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return options;
    return options.filter((option) => normalize(`${option.label} ${option.value}`).includes(needle));
  }, [options, query]);
  const visible = matching.slice(0, MAX_VISIBLE_OPTIONS);
  const selectable = [{ value: '', label: clearLabel }, ...visible];

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => window.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function choose(nextValue: string) {
    onChange(nextValue);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={open ? `${listboxId}-${activeIndex}` : undefined}
          className="input min-h-[44px] w-full pl-8 pr-8"
          placeholder={searchPlaceholder}
          value={open ? query : selected?.label ?? value}
          onFocus={() => {
            setQuery('');
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, selectable.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter' && open) {
              event.preventDefault();
              const option = selectable[activeIndex];
              if (option) choose(option.value);
            } else if (event.key === 'Escape' || event.key === 'Tab') {
              setOpen(false);
            }
          }}
        />
        {value && (
          <button
            type="button"
            className="absolute right-0 top-0 inline-flex h-11 w-10 items-center justify-center text-muted hover:text-white"
            aria-label={clearLabel}
            title={clearLabel}
            onClick={() => choose('')}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[14rem] rounded-md border border-border bg-bg-card p-1 shadow-card">
          <p className="px-2 py-1 text-[10px] text-muted">
            {resultLabel
              .replace('{shown}', String(visible.length))
              .replace('{total}', String(matching.length))}
          </p>
          <ul id={listboxId} role="listbox" className="max-h-64 overflow-y-auto">
            {selectable.map((option, index) => (
              <li key={option.value || '__all__'} role="presentation">
                <button
                  id={`${listboxId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs ${
                    index === activeIndex ? 'bg-accent/15 text-white' : 'text-muted hover:bg-bg-elev hover:text-white'
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option.value)}
                >
                  <span className="truncate">{option.label}</span>
                  {option.count != null && <span className="shrink-0 text-[10px] opacity-70">{option.count}</span>}
                </button>
              </li>
            ))}
          </ul>
          {matching.length === 0 && <p className="px-2 py-3 text-xs text-muted">{noResultsLabel}</p>}
        </div>
      )}
    </div>
  );
}
