// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { SchemaEgsSummary } from '@/lib/schema-egs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/schema',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

// SchemaEgsSection is an async server component: stub its server-only data
// sources so it can resolve in jsdom without next/headers or a real DB.
const summaryMock = vi.fn<() => SchemaEgsSummary>();
vi.mock('@/lib/schema-egs', () => ({
  getSchemaEgsSummary: () => summaryMock(),
}));
vi.mock('@/lib/i18n/server', () => ({
  getDict: async () => dictionaries.en,
  getLocale: async () => 'en',
}));

import { SchemaEgsSection } from '@/components/SchemaEgsSection';

const t = dictionaries.en;

function allTables(rowCount: number, lastFetchedAt: number | null): SchemaEgsSummary['tables'] {
  return [
    { key: 'egs_game', rowCount, lastFetchedAt },
    { key: 'vndb_cache_egs', rowCount, lastFetchedAt },
    { key: 'vn_egs_link', rowCount, lastFetchedAt },
    { key: 'egs_vn_link', rowCount, lastFetchedAt },
  ];
}

/** Await the async server component then render its element tree. */
async function renderSection() {
  const element = await SchemaEgsSection();
  return render(element);
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

describe('SchemaEgsSection branches', () => {
  it('renders the empty state when every table is empty and no username is set', async () => {
    summaryMock.mockReturnValue({
      tables: allTables(0, null),
      staleWhileError: false,
      egsUsernameSet: false,
    });
    await renderSection();
    expect(screen.getByText(t.schemaEgs.empty)).toBeInTheDocument();
    // The stale-while-error badge is hidden when the flag is false.
    expect(screen.queryByText(t.schemaEgs.staleWhileError)).not.toBeInTheDocument();
    // No table tiles render in the empty state.
    expect(screen.queryByText(t.schemaEgs.tableEgsGame)).not.toBeInTheDocument();
  });

  it('renders one tile per table with row counts and labels for every key', async () => {
    summaryMock.mockReturnValue({
      tables: allTables(7, 1_700_000_000_000),
      staleWhileError: false,
      egsUsernameSet: false,
    });
    await renderSection();
    // labelFor covers all four key branches.
    expect(screen.getByText(t.schemaEgs.tableEgsGame)).toBeInTheDocument();
    expect(screen.getByText(t.schemaEgs.tableEgsCache)).toBeInTheDocument();
    expect(screen.getByText(t.schemaEgs.tableVnEgsLink)).toBeInTheDocument();
    expect(screen.getByText(t.schemaEgs.tableEgsVnLink)).toBeInTheDocument();
    // rowCount template renders the count for each of the four tiles.
    expect(screen.getAllByText(t.schemaEgs.rowCount.replace('{n}', '7'))).toHaveLength(4);
  });

  it('shows the stale-while-error badge when the cache reports a stale fallback', async () => {
    summaryMock.mockReturnValue({
      tables: allTables(3, 1_700_000_000_000),
      staleWhileError: true,
      egsUsernameSet: false,
    });
    await renderSection();
    // The badge text appears (title + visible label).
    expect(screen.getAllByText(t.schemaEgs.staleWhileError).length).toBeGreaterThan(0);
  });

  it('renders the never-fetched label for tables with a null last-fetch', async () => {
    summaryMock.mockReturnValue({
      tables: allTables(2, null),
      staleWhileError: false,
      egsUsernameSet: true,
    });
    await renderSection();
    // fmt() returns the neverLabel for each null lastFetchedAt.
    expect(screen.getAllByText(new RegExp(t.schemaEgs.neverFetched)).length).toBeGreaterThanOrEqual(4);
  });

  it('marks the username row as set with a check when egsUsernameSet is true', async () => {
    summaryMock.mockReturnValue({
      tables: allTables(1, 1_700_000_000_000),
      staleWhileError: false,
      egsUsernameSet: true,
    });
    await renderSection();
    const usernameRow = screen.getByText(t.schemaEgs.settingsEgsUsername).closest('li') as HTMLElement;
    expect(within(usernameRow).getByText(t.schemaEgs.set)).toBeInTheDocument();
  });

  it('marks the username row as not set with a dash when egsUsernameSet is false', async () => {
    // A populated table keeps isEmpty false so the username tile renders.
    summaryMock.mockReturnValue({
      tables: allTables(1, 1_700_000_000_000),
      staleWhileError: false,
      egsUsernameSet: false,
    });
    await renderSection();
    const usernameRow = screen.getByText(t.schemaEgs.settingsEgsUsername).closest('li') as HTMLElement;
    expect(within(usernameRow).getByLabelText(t.schemaEgs.notSet)).toBeInTheDocument();
  });

  it('keeps the data tiles visible when a username is set even though all tables are empty', async () => {
    // isEmpty requires both empty tables AND no username; a set username
    // alone keeps the populated branch.
    summaryMock.mockReturnValue({
      tables: allTables(0, null),
      staleWhileError: false,
      egsUsernameSet: true,
    });
    await renderSection();
    expect(screen.queryByText(t.schemaEgs.empty)).not.toBeInTheDocument();
    expect(screen.getByText(t.schemaEgs.tableEgsGame)).toBeInTheDocument();
  });
});
