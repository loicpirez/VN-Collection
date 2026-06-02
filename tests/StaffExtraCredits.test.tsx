import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaffExtraCredits, StaffExtraCreditsSkeleton } from '@/components/StaffExtraCredits';
import { isInCollectionMany } from '@/lib/db';
import { downloadFullStaffInfo, readStaffFullCache, type StaffFullPayload } from '@/lib/staff-full';
import type { StaffVaCredit, StaffVnCredit } from '@/lib/vndb';

vi.mock('@/lib/db', () => ({
  isInCollectionMany: vi.fn(),
}));

vi.mock('@/lib/staff-full', () => ({
  downloadFullStaffInfo: vi.fn(),
  readStaffFullCache: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => (await import('@/lib/i18n/dictionaries')).dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/components/PaginatedGrid', () => ({
  PaginatedGrid: ({
    ariaLabel,
    children,
    resetKey,
  }: {
    ariaLabel: string;
    children: React.ReactNode;
    resetKey: string;
  }) => <ul aria-label={ariaLabel} data-reset-key={resetKey}>{children}</ul>,
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt, src }: { alt: string; src?: string | null }) => <img alt={alt} src={src ?? undefined} />,
}));

vi.mock('@/components/Skeleton', () => ({
  SkeletonCardGrid: ({ count }: { count: number }) => <div data-skeleton-count={count} />,
}));

function production(id: string, overrides: Partial<StaffVnCredit> = {}): StaffVnCredit {
  return {
    id,
    title: `Production ${id}`,
    alttitle: null,
    released: null,
    rating: null,
    image_url: null,
    image_thumb: null,
    roles: [{ role: 'scenario', note: null }],
    ...overrides,
  };
}

function voice(id: string, overrides: Partial<StaffVaCredit> = {}): StaffVaCredit {
  return {
    id,
    title: `Voice ${id}`,
    alttitle: null,
    released: null,
    rating: null,
    image_url: null,
    image_thumb: null,
    characters: [{ id: 'c1', name: 'Character', original: null, image_url: null, note: null }],
    ...overrides,
  };
}

function payload(overrides: Partial<StaffFullPayload> = {}): StaffFullPayload {
  return {
    profile: null,
    productionCredits: [],
    vaCredits: [],
    fetched_at: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(isInCollectionMany).mockReset().mockReturnValue(new Set());
  vi.mocked(readStaffFullCache).mockReset().mockReturnValue(null);
  vi.mocked(downloadFullStaffInfo).mockReset();
});

describe('StaffExtraCredits', () => {
  it('returns no section when a cache miss cannot be downloaded', async () => {
    vi.mocked(downloadFullStaffInfo).mockRejectedValue(new Error('offline'));
    expect(await StaffExtraCredits({ sid: 's1', knownProdVnIds: new Set(), knownVaVnIds: new Set() })).toBeNull();
    expect(isInCollectionMany).not.toHaveBeenCalled();
  });

  it('returns no section when cached credits are empty or already known', async () => {
    vi.mocked(readStaffFullCache)
      .mockReturnValueOnce(payload())
      .mockReturnValueOnce(payload({
        productionCredits: [production('v1')],
        vaCredits: [voice('v2')],
      }));
    expect(await StaffExtraCredits({ sid: 's1', knownProdVnIds: new Set(), knownVaVnIds: new Set() })).toBeNull();
    expect(await StaffExtraCredits({ sid: 's1', knownProdVnIds: new Set(['v1']), knownVaVnIds: new Set(['v2']) })).toBeNull();
    expect(downloadFullStaffInfo).not.toHaveBeenCalled();
  });

  it('downloads a missing cache and renders production-only credits', async () => {
    vi.mocked(downloadFullStaffInfo).mockResolvedValue(payload({
      productionCredits: [production('v1', {
        image_thumb: 'https://example.com/thumb.jpg',
        roles: [{ role: 'scenario', note: null }, { role: 'new-role', note: null }],
      })],
    }));
    const markup = renderToStaticMarkup(await StaffExtraCredits({
      sid: 's1',
      knownProdVnIds: new Set(),
      knownVaVnIds: new Set(),
    }));
    expect(downloadFullStaffInfo).toHaveBeenCalledWith('s1');
    expect(markup).toContain('More credits (outside your collection)');
    expect(markup).toContain('Production credits');
    expect(markup).not.toContain('Voice credits');
    expect(markup).toContain('Scenario / new-role');
    expect(markup).toContain('src="https://example.com/thumb.jpg"');
    expect(markup).toContain('data-reset-key="s1:extra-production"');
  });

  it('renders voice and production metadata with one batched membership lookup', async () => {
    vi.mocked(readStaffFullCache).mockReturnValue(payload({
      productionCredits: [
        production('v1'),
        production('v2', {
          title: 'Production title',
          alttitle: 'Production title',
          image_url: 'https://example.com/full.jpg',
        }),
      ],
      vaCredits: [
        voice('v3', {
          title: 'Voice title',
          alttitle: 'Alternative title',
          released: '2020-01-02',
          rating: 75,
          characters: [
            { id: 'c1', name: 'First character', original: null, image_url: null, note: 'main' },
            { id: 'c2', name: 'Second character', original: null, image_url: null, note: null },
          ],
        }),
      ],
    }));
    vi.mocked(isInCollectionMany).mockReturnValue(new Set(['v3']));
    const markup = renderToStaticMarkup(await StaffExtraCredits({
      sid: 's1',
      knownProdVnIds: new Set(['v1']),
      knownVaVnIds: new Set(),
    }));
    expect(isInCollectionMany).toHaveBeenCalledWith(['v2', 'v3']);
    expect(markup).toContain('Voice credits');
    expect(markup).toContain('Production credits');
    expect(markup).toContain('Alternative title');
    expect(markup).not.toContain('Production title</div>');
    expect(markup).toContain('7.5');
    expect(markup).toContain('2020');
    expect(markup).toContain('Owned');
    expect(markup).toContain('href="/character/c1"');
    expect(markup).toContain('main');
    expect(markup).toContain('src="https://example.com/full.jpg"');
    expect(markup).toContain('data-reset-key="s1:extra-voice"');
  });

  it('renders the streaming skeleton shape', () => {
    expect(renderToStaticMarkup(<StaffExtraCreditsSkeleton />)).toContain('data-skeleton-count="8"');
  });
});
