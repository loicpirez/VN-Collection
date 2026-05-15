'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, ArrowRight, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface Producer {
  id: string;
  name: string;
  original: string | null;
  vn_count: number;
}

/**
 * Two side-by-side producer pickers. Loads the local producer list from
 * /api/producers (which is the developers credited on VNs the user owns)
 * and lets the user select brand A + brand B. Submit navigates to
 * /brand-overlap?a=…&b=…, where the server-side resolver runs.
 */
export function BrandOverlapPicker({ initialA, initialB }: { initialA: string | null; initialB: string | null }) {
  const t = useT();
  const router = useRouter();
  const [list, setList] = useState<Producer[]>([]);
  const [loading, setLoading] = useState(true);
  const [a, setA] = useState(initialA ?? '');
  const [b, setB] = useState(initialB ?? '');

  useEffect(() => {
    fetch('/api/producers', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { producers: [] }))
      .then((d: { producers?: Producer[] }) => setList(d.producers ?? []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!a || !b) return;
    router.push(`/brand-overlap?a=${a}&b=${b}`);
  }

  if (loading) {
    return (
      <div className="mt-4 inline-flex items-center gap-2 text-xs text-muted">
        <Loader2 className="h-3 w-3 animate-spin" /> {t.common.loading}
      </div>
    );
  }

  return (
    <form className="mt-4 grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr_auto]" onSubmit={submit}>
      <select
        className="input"
        value={a}
        onChange={(e) => setA(e.target.value)}
        aria-label={t.brandOverlap.pickPlaceholderA}
      >
        <option value="">{t.brandOverlap.pickPlaceholderA}</option>
        {list.map((p) => (
          <option key={p.id} value={p.id}>{p.name} ({p.vn_count})</option>
        ))}
      </select>
      <span className="inline-flex items-center justify-center text-muted" aria-hidden>
        <ArrowLeftRight className="h-3 w-3" />
      </span>
      <select
        className="input"
        value={b}
        onChange={(e) => setB(e.target.value)}
        aria-label={t.brandOverlap.pickPlaceholderB}
      >
        <option value="">{t.brandOverlap.pickPlaceholderB}</option>
        {list.map((p) => (
          <option key={p.id} value={p.id}>{p.name} ({p.vn_count})</option>
        ))}
      </select>
      <button type="submit" className="btn btn-primary" disabled={!a || !b || a === b}>
        <ArrowRight className="h-4 w-4" aria-hidden /> {t.brandOverlap.compare}
      </button>
    </form>
  );
}
