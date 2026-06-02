// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MatchBadges } from '@/components/MatchBadges';
import type { EgsRow } from '@/lib/db';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { render } from '@testing-library/react';

const t = dictionaries.en;

function egs(source: EgsRow['source']): EgsRow {
  return {
    vn_id: 'v90001',
    egs_id: 90001,
    gamename: 'Matched title',
    gamename_furigana: null,
    brand_id: null,
    brand_name: null,
    model: null,
    description: null,
    image_url: null,
    local_image: null,
    okazu: null,
    erogame: null,
    raw_json: null,
    median: null,
    average: null,
    dispersion: null,
    count: null,
    sellday: null,
    playtime_median_minutes: null,
    source,
    fetched_at: 1,
  };
}

afterEach(cleanup);

describe('MatchBadges', () => {
  it('shows VNDB plus each supported EGS match source', () => {
    const { rerender } = render(<MatchBadges egsOnly={false} egs={egs('extlink')} t={t} />);
    expect(screen.getByText(`/ ${t.matchBadges.viaExtlink}`)).toBeInTheDocument();

    rerender(<MatchBadges egsOnly={false} egs={egs('search')} t={t} />);
    expect(screen.getByText(`/ ${t.matchBadges.viaSearch}`)).toBeInTheDocument();

    rerender(<MatchBadges egsOnly={false} egs={egs('manual')} t={t} />);
    expect(screen.getByText(`/ ${t.matchBadges.viaManual}`)).toBeInTheDocument();
  });

  it('shows unlinked VNDB and EGS-only states without a source suffix', () => {
    const { rerender } = render(<MatchBadges egsOnly={false} egs={null} t={t} />);
    expect(screen.getByText(`/ ${t.matchBadges.noEgsMatch}`)).toBeInTheDocument();

    rerender(<MatchBadges egsOnly egs={egs(null)} t={t} />);
    expect(screen.getByText(`/ ${t.matchBadges.egsOnlyEntry}`)).toBeInTheDocument();
    expect(screen.queryByText(`/ ${t.matchBadges.noEgsMatch}`)).toBeNull();
  });

  it('does not render a suffix for a linked row without a recorded source', () => {
    render(<MatchBadges egsOnly={false} egs={egs(null)} t={t} />);
    expect(screen.queryByText(`/ ${t.matchBadges.viaExtlink}`)).toBeNull();
    expect(screen.queryByText(`/ ${t.matchBadges.viaSearch}`)).toBeNull();
    expect(screen.queryByText(`/ ${t.matchBadges.viaManual}`)).toBeNull();
  });
});
