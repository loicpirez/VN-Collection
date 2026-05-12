'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Award, Bookmark, ChevronDown, Quote, Sparkles, Tags, Trophy } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

/**
 * Single "More" dropdown that consolidates the less-frequently-visited
 * nav entries. The top bar keeps Library / Wishlist / Search / For you /
 * Upcoming / Stats / Data; everything else moves in here so the bar
 * doesn't wrap on smaller screens.
 */
export function MoreNavMenu() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      window.addEventListener('mousedown', outside);
      window.addEventListener('keydown', escape);
      return () => {
        window.removeEventListener('mousedown', outside);
        window.removeEventListener('keydown', escape);
      };
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:bg-bg-card hover:text-white"
      >
        {t.nav.more}
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-52 rounded-lg border border-border bg-bg-card p-1 text-sm shadow-card">
          <MoreLink href="/producers" icon={<Trophy className="h-4 w-4" />} label={t.nav.producers} onClick={() => setOpen(false)} />
          <MoreLink href="/series" icon={<Bookmark className="h-4 w-4" />} label={t.nav.series} onClick={() => setOpen(false)} />
          <MoreLink href="/tags" icon={<Tags className="h-4 w-4" />} label={t.nav.tags} onClick={() => setOpen(false)} />
          <MoreLink href="/traits" icon={<Sparkles className="h-4 w-4" />} label={t.nav.traits} onClick={() => setOpen(false)} />
          <MoreLink
            href={`/year?y=${new Date().getFullYear()}`}
            icon={<Award className="h-4 w-4" />}
            label={t.nav.year}
            onClick={() => setOpen(false)}
          />
          <MoreLink href="/quotes" icon={<Quote className="h-4 w-4" />} label={t.nav.quotes} onClick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function MoreLink({ href, icon, label, onClick }: { href: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted hover:bg-bg-elev hover:text-white"
    >
      {icon}
      {label}
    </Link>
  );
}
