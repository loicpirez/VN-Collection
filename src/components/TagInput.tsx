'use client';
import { useId, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface Props {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Suggestions shown when the input is focused. Click to add. */
  suggestions?: string[];
  maxValues?: number;
  maxLength?: number;
  className?: string;
}

export function TagInput({
  values,
  onChange,
  placeholder,
  suggestions = [],
  maxValues = 32,
  maxLength = 200,
  className = '',
}: Props) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const filteredSuggestions = useMemo(() => {
    const lower = draft.trim().toLowerCase();
    return suggestions
      .filter((s) => !values.includes(s))
      .filter((s) => !lower || s.toLowerCase().includes(lower))
      .slice(0, 12);
  }, [draft, suggestions, values]);

  function commit(raw: string) {
    const clean = raw.trim().slice(0, maxLength);
    if (!clean || values.includes(clean) || values.length >= maxValues) return;
    onChange([...values, clean]);
    setDraft('');
  }

  function remove(idx: number) {
    onChange(values.filter((_, i) => i !== idx));
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (draft.trim()) commit(draft);
    } else if (e.key === 'Backspace' && !draft && values.length > 0) {
      remove(values.length - 1);
    }
  }

  return (
    <div
      className={`flex flex-col gap-1.5 ${className}`}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-bg-card px-2 py-1.5 focus-within:border-accent">
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 rounded-md bg-bg-elev px-2 py-0.5 text-xs"
          >
            {v}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(i);
              }}
              className="-mr-1 inline-flex h-4 w-4 items-center justify-center rounded text-muted hover:bg-status-dropped hover:text-bg"
              aria-label={t.tagInput.removeTag.replace('{v}', v)}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          list={suggestions.length > 0 ? listId : undefined}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            // Commit on blur so the user doesn't lose what they typed
            if (draft.trim()) commit(draft);
          }}
          placeholder={values.length === 0 ? placeholder : ''}
          className="min-w-[120px] flex-1 bg-transparent text-sm text-white outline-none placeholder:text-muted/60"
          maxLength={maxLength}
        />
      </div>

      {focused && filteredSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-bg-elev/40 p-1.5">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                // mousedown so it fires before the input's onBlur
                e.preventDefault();
                commit(s);
              }}
              className="rounded-md bg-bg px-2 py-0.5 text-[11px] text-muted hover:bg-accent hover:text-bg"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
