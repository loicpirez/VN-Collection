'use client';
import { useId, useMemo } from 'react';
import { useLocale } from '@/lib/i18n/client';

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  ariaLabel?: string;
}

export function DateInput({ value, onChange, className = 'input', ariaLabel }: Props) {
  const locale = useLocale();
  const id = useId();
  const localeMap: Record<string, string> = { fr: 'fr-FR', en: 'en-GB', ja: 'ja-JP' };
  const tag = localeMap[locale] ?? 'fr-FR';

  const pretty = useMemo(() => {
    if (!value) return '';
    try {
      const d = new Date(`${value}T00:00:00`);
      if (Number.isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat(tag, { dateStyle: 'long' }).format(d);
    } catch {
      return '';
    }
  }, [value, tag]);

  return (
    <>
      <input
        id={id}
        type="date"
        lang={tag}
        aria-label={ariaLabel}
        className={className}
        value={value}
        style={{ colorScheme: 'dark' }}
        onChange={(e) => onChange(e.target.value)}
      />
      {pretty && (
        <span className="text-[10px] text-muted/70" aria-hidden>
          {pretty}
        </span>
      )}
    </>
  );
}
