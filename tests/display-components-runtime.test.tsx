// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from '@/components/Tooltip';
import { UpcomingCard, type UpcomingCardData } from '@/components/UpcomingCard';
import { VnTagChips } from '@/components/VnTagChips';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { renderWithProviders } from './helpers/render-component';

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('@/components/AddMissingVnButton', () => ({
  AddMissingVnButton: ({ vnId }: { vnId: string }) => <button type="button">add {vnId}</button>,
}));

vi.mock('@/components/MapEgsToVndbButton', () => ({
  MapEgsToVndbButton: ({ egsId }: { egsId: number }) => <button type="button">map {egsId}</button>,
}));

vi.mock('@/components/SpoilerChip', () => ({
  SpoilerChip: ({
    children,
    currentSpoilerLevel,
    href,
    sexual,
  }: {
    children: React.ReactNode;
    currentSpoilerLevel: number;
    href: string;
    sexual: boolean;
  }) => <a data-level={currentSpoilerLevel} data-sexual={sexual} href={href}>{children}</a>,
}));

const t = dictionaries.en;
const baseCard: UpcomingCardData = {
  id: 'v90001',
  vndbId: null,
  egsId: null,
  title: 'Upcoming VN',
  alttitle: null,
  released: null,
  coverUrl: null,
  inCollection: false,
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('Tooltip runtime', () => {
  it('renders disabled children directly and opens or closes on pointer, focus, blur, and Escape', () => {
    const { rerender } = render(<Tooltip content="Hint" disabled><button type="button">Trigger</button></Tooltip>);
    expect(screen.queryByRole('tooltip')).toBeNull();
    rerender(<Tooltip content="Hint" side="right"><button type="button">Trigger</button></Tooltip>);
    const trigger = screen.getByText('Trigger').parentElement as HTMLElement;
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Hint');
    expect(screen.getByRole('tooltip')).toHaveClass('left-full');
    fireEvent.keyDown(window, { key: 'Unidentified' });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('UpcomingCard server rendering', () => {
  it('renders local, VNDB, add, mapping, metadata, alternate title, release, and collection affordances', () => {
    const html = renderToStaticMarkup(
      <UpcomingCard
        t={t}
        locale="en"
        data={{
          ...baseCard,
          egsId: 123,
          alttitle: 'Alternate title',
          released: '2026-06-01',
          inCollection: true,
          variant: 'wide',
        }}
        meta={<span>Metadata</span>}
      />,
    );
    expect(html).toContain('href="/vn/v90001"');
    expect(html).toContain('data-affordance="open-vndb"');
    expect(html).toContain('data-affordance="map-egs-to-vndb"');
    expect(html).not.toContain('data-affordance="add-to-collection"');
    expect(html).toContain('Alternate title');
    expect(html).toContain('Metadata');
    expect(html).toContain('data-variant="wide"');
  });

  it('renders an EGS-only external card and map action', () => {
    const html = renderToStaticMarkup(
      <UpcomingCard
        t={t}
        locale="en"
        data={{ ...baseCard, id: 'egs_123', egsId: 123 }}
      />,
    );
    expect(html).toContain('data-affordance="open-egs"');
    expect(html).toContain('game=123');
    expect(html).not.toContain('data-affordance="add-to-collection"');
  });

  it('renders a bare unmapped card and the add action for mapped VNDB ids', () => {
    let html = renderToStaticMarkup(
      <UpcomingCard t={t} locale="en" data={{ ...baseCard, id: 'unmapped' }} />,
    );
    expect(html).not.toContain('href=');
    html = renderToStaticMarkup(
      <UpcomingCard t={t} locale="en" data={{ ...baseCard, id: 'egs_123', vndbId: 'v90002' }} />,
    );
    expect(html).toContain('data-affordance="add-to-collection"');
    expect(html).toContain('add v90002');
  });

  it('renders the wide title treatment for an unmapped card', () => {
    const html = renderToStaticMarkup(
      <UpcomingCard t={t} locale="en" data={{ ...baseCard, id: 'unmapped', variant: 'wide' }} />,
    );
    expect(html).toContain('line-clamp-2 text-base font-bold');
  });
});

describe('VnTagChips spoiler controls', () => {
  it('does not render an empty set', () => {
    const { container } = renderWithProviders(
      <DisplaySettingsProvider><VnTagChips tags={[]} /></DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('raises and clears the local spoiler override while preserving mapped tag metadata', () => {
    renderWithProviders(
      <DisplaySettingsProvider initial={{ spoilerLevel: 0, showSexualTraits: false }}>
        <VnTagChips
          max={1}
          tags={[
            { id: 'g 1', name: 'Spoiler tag', rating: 1, spoiler: 2, category: 'ero' },
            { id: 'g2', name: 'Trimmed tag', rating: 1, spoiler: 0 },
          ]}
        />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    const chip = screen.getByRole('link', { name: 'Spoiler tag' });
    expect(chip).toHaveAttribute('href', '/tag/g%201');
    expect(chip).toHaveAttribute('data-level', '0');
    expect(chip).toHaveAttribute('data-sexual', 'true');
    fireEvent.click(screen.getByRole('button', { name: t.spoiler.spoilMe }));
    expect(chip).toHaveAttribute('data-level', '2');
    fireEvent.click(screen.getByRole('button', { name: t.spoiler.hideAll }));
    expect(chip).toHaveAttribute('data-level', '0');
  });

  it('renders the seeded override control even when no visible tag is hidden', () => {
    renderWithProviders(
      <DisplaySettingsProvider initial={{ spoilerLevel: 2 }}>
        <VnTagChips tags={[{ id: 'g1', name: 'Visible tag', rating: 1, spoiler: 0 }]} perSectionOverride={2} />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(screen.getByRole('button', { name: t.spoiler.hideAll })).toHaveAttribute('aria-pressed', 'true');
  });
});
