import Link from 'next/link';
import { Users } from 'lucide-react';
import { getDict } from '@/lib/i18n/server';

interface StaffEntry {
  eid?: number | null;
  role?: string;
  note?: string | null;
  id?: string;
  aid?: number;
  name?: string;
  original?: string | null;
  lang?: string | null;
}

const ROLE_ORDER = ['scenario', 'chardesign', 'art', 'music', 'songs', 'director', 'producer', 'staff'] as const;
const ROLE_KEY: Record<string, keyof Awaited<ReturnType<typeof getDict>>['staff']> = {
  scenario: 'role_scenario',
  chardesign: 'role_chardesign',
  art: 'role_art',
  music: 'role_music',
  songs: 'role_songs',
  director: 'role_director',
  producer: 'role_producer',
  staff: 'role_staff',
};

export async function StaffSection({ staff }: { staff: StaffEntry[] }) {
  const t = await getDict();
  if (!staff?.length) return null;
  const buckets = new Map<string, StaffEntry[]>();
  for (const s of staff) {
    if (!s?.id || !s.name) continue;
    const key = ROLE_KEY[s.role ?? ''] ? (s.role as string) : 'staff';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(s);
  }
  const groups = ROLE_ORDER
    .map((role) => ({ role, entries: buckets.get(role) ?? [] }))
    .filter((g) => g.entries.length > 0);
  if (groups.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-bg-card p-6">
      <h3 className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
        <Users className="h-4 w-4 text-accent" /> {t.staff.section}
      </h3>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <div key={g.role}>
            <dt className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">
              {t.staff[ROLE_KEY[g.role]]}
            </dt>
            <dd className="flex flex-wrap gap-1.5">
              {g.entries.map((s, i) => (
                <Link
                  key={`${s.id}-${s.eid ?? 'base'}-${i}`}
                  href={`/staff/${s.id}`}
                  className="inline-flex items-baseline gap-1 rounded-md border border-border bg-bg-elev px-2 py-1 text-xs text-white/85 transition-colors hover:border-accent hover:text-accent"
                  title={s.note ?? undefined}
                >
                  <span>{s.name}</span>
                  {s.original && s.original !== s.name && (
                    <span className="text-[10px] text-muted">{s.original}</span>
                  )}
                </Link>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
