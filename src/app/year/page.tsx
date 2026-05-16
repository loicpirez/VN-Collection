import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Award, ChevronLeft, ChevronRight, Clock, Sparkles, Star } from 'lucide-react';
import { getReadingGoal, yearReview } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { ActivityHeatmap } from '@/components/ActivityHeatmap';

export const dynamic = 'force-dynamic';

function pickYear(raw: string | undefined): number {
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1980 && n <= 2100) return n;
  return new Date().getFullYear();
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ y?: string }>;
}): Promise<Metadata> {
  const { y } = await searchParams;
  const dict = await getDict();
  return { title: dict.year.title.replace('{year}', String(pickYear(y))) };
}

export default async function YearPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string }>;
}) {
  const { y } = await searchParams;
  const year = pickYear(y);
  const t = await getDict();
  const review = yearReview(year);
  const goal = getReadingGoal(year);
  const progress = goal?.target ? Math.min(100, Math.round((review.completed / goal.target) * 100)) : null;

  const navYear = (delta: number) => `/year?y=${year + delta}`;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 rounded-md border border-transparent text-sm text-muted hover:text-white md:mb-2 md:border-border md:bg-bg-elev/30 md:px-1.5 md:py-1 md:text-[11px] md:opacity-70 md:hover:border-accent md:hover:opacity-100">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>

      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-4 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <div>
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
            <Award className="h-6 w-6 text-accent" /> {t.year.title.replace('{year}', String(year))}
          </h1>
          <p className="mt-1 text-sm text-muted">{t.year.subtitle}</p>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <Link
            href={navYear(-1)}
            className="btn"
            aria-label={t.year.previousYear}
            title={t.year.previousYear}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
          <span className="rounded-md bg-bg-elev px-2 py-1 font-mono">{year}</span>
          <Link
            href={navYear(+1)}
            className="btn"
            aria-label={t.year.nextYear}
            title={t.year.nextYear}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </header>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Stat label={t.year.completed} value={String(review.completed)} icon={<Sparkles className="h-4 w-4" />} />
        <Stat
          label={t.year.hours}
          value={`${review.hours}${t.year.hoursUnit}`}
          icon={<Clock className="h-4 w-4" />}
        />
        <Stat
          label={t.year.avgRating}
          value={review.avgUserRating != null ? (review.avgUserRating / 10).toFixed(1) : '—'}
          icon={<Star className="h-4 w-4" />}
        />
      </div>

      {progress != null && (
        <section className="mb-6 rounded-xl border border-accent/40 bg-accent/5 p-5">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-bold text-accent">
              {t.year.goalProgress.replace('{n}', String(review.completed)).replace('{m}', String(goal!.target))}
            </span>
            <span className="font-mono text-xs text-muted">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg-elev">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </section>
      )}

      <div className="mb-6">
        <ActivityHeatmap year={year} />
      </div>

      {review.topTags.length > 0 && (
        <section className="mb-6 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t.year.topTags}</h3>
          <div className="flex flex-wrap gap-1.5">
            {review.topTags.map((tag) => (
              <Link
                key={tag.id}
                href={`/?tag=${encodeURIComponent(tag.id)}`}
                className="rounded-md border border-border bg-bg-elev px-2 py-1 text-xs text-white/85 hover:border-accent hover:text-accent"
              >
                {tag.name}
                <span className="ml-1 text-[10px] text-muted">{tag.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {review.best.length > 0 && (
        <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t.year.best}</h3>
          <ol className="space-y-1.5 text-sm">
            {review.best.map((b, i) => (
              <li key={b.id} className="flex items-baseline justify-between gap-3">
                <span>
                  <span className="mr-2 text-[10px] text-muted">#{i + 1}</span>
                  <Link href={`/vn/${b.id}`} className="font-semibold hover:text-accent">{b.title}</Link>
                </span>
                <span className="font-mono text-accent">{(b.rating / 10).toFixed(1)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 sm:p-5">
      <div className="mb-1 inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted">
        {icon}
        {label}
      </div>
      <div className="text-3xl font-bold text-accent">{value}</div>
    </div>
  );
}
