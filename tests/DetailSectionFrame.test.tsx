// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DetailSectionFrame, SectionCountReport, useSectionCount } from '@/components/vn-detail/DetailSectionFrame';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const labels = { expandLabel: 'Expand section', collapseLabel: 'Collapse section' };

describe('DetailSectionFrame', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders an expanded section with its title and body', () => {
    renderWithProviders(
      <DetailSectionFrame id="notes" title="Notes" defaultCollapsed={false} {...labels}>
        <p>body content</p>
      </DetailSectionFrame>,
    );
    expect(screen.getByRole('heading', { name: /Notes/ })).toBeTruthy();
    expect(screen.getByText('body content')).toBeTruthy();
    // With a title present, the toggle's accessible name is the title text.
    const toggle = screen.getByRole('button', { name: 'Notes' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('title')).toBe('Collapse section');
  });

  it('keeps the body unmounted when it starts collapsed (lazy)', () => {
    renderWithProviders(
      <DetailSectionFrame id="releases" title="Releases" defaultCollapsed {...labels}>
        <p>lazy body</p>
      </DetailSectionFrame>,
    );
    expect(screen.queryByText('lazy body')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Releases' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('title')).toBe('Expand section');
  });

  it('mounts the body on first expand and persists collapsed state to localStorage', () => {
    renderWithProviders(
      <DetailSectionFrame id="quotes" title="Quotes" defaultCollapsed {...labels}>
        <p>quote body</p>
      </DetailSectionFrame>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Quotes' }));
    expect(screen.getByText('quote body')).toBeTruthy();
    expect(localStorage.getItem('vn-section-collapsed:quotes')).toBe('0');
    // Collapse again: persists '1' and the body stays mounted but hidden.
    fireEvent.click(screen.getByRole('button', { name: 'Quotes' }));
    expect(localStorage.getItem('vn-section-collapsed:quotes')).toBe('1');
  });

  it('reads a persisted expanded preference on mount even when defaultCollapsed is true', () => {
    localStorage.setItem('vn-section-collapsed:cast', '0');
    renderWithProviders(
      <DetailSectionFrame id="cast" title="Cast" defaultCollapsed {...labels}>
        <p>cast body</p>
      </DetailSectionFrame>,
    );
    expect(screen.getByText('cast body')).toBeTruthy();
  });

  it('reads a persisted collapsed preference on mount even when defaultCollapsed is false', () => {
    localStorage.setItem('vn-section-collapsed:notes', '1');
    renderWithProviders(
      <DetailSectionFrame id="notes" title="Notes" defaultCollapsed={false} {...labels}>
        <p>notes body</p>
      </DetailSectionFrame>,
    );
    expect(screen.getByText('notes body').parentElement?.hidden).toBe(true);
    expect(screen.getByRole('button', { name: 'Notes' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('renders only the chevron toggle (no title text) when title is empty', () => {
    renderWithProviders(
      <DetailSectionFrame id="staff" title="" defaultCollapsed={false} {...labels}>
        <p>staff body</p>
      </DetailSectionFrame>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    // With no title, the toggle carries the aria-label instead.
    const toggle = screen.getByRole('button', { name: /Collapse section/ });
    expect(toggle.getAttribute('aria-label')).toBe('Collapse section');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /Expand section/ }).getAttribute('aria-label')).toBe('Expand section');
  });

  it('renders the actions node beside the header', () => {
    renderWithProviders(
      <DetailSectionFrame
        id="notes"
        title="Notes"
        defaultCollapsed={false}
        actions={<button type="button">action btn</button>}
        {...labels}
      >
        <p>body</p>
      </DetailSectionFrame>,
    );
    expect(screen.getByRole('button', { name: 'action btn' })).toBeTruthy();
  });

  it('reveals a collapsed section when the location hash matches and on hashchange', () => {
    window.location.hash = '#section-routes';
    renderWithProviders(
      <DetailSectionFrame id="routes" title="Routes" defaultCollapsed {...labels}>
        <p>routes body</p>
      </DetailSectionFrame>,
    );
    // Initial reveal() runs on mount because the hash already matches.
    expect(screen.getByText('routes body')).toBeTruthy();
  });

  it('reveals on a later hashchange event', () => {
    renderWithProviders(
      <DetailSectionFrame id="similar" title="Similar" defaultCollapsed {...labels}>
        <p>similar body</p>
      </DetailSectionFrame>,
    );
    expect(screen.queryByText('similar body')).toBeNull();
    window.location.hash = '#section-similar';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByText('similar body')).toBeTruthy();
  });

  it('surfaces a child-reported count badge via useSectionCount', () => {
    function CountingChild() {
      useSectionCount(7);
      return <p>counted child</p>;
    }
    renderWithProviders(
      <DetailSectionFrame id="characters" title="Characters" defaultCollapsed={false} {...labels}>
        <CountingChild />
      </DetailSectionFrame>,
    );
    expect(screen.getByText('counted child')).toBeTruthy();
    expect(screen.getByText('/ 7')).toBeTruthy();
  });

  it('surfaces a static count via SectionCountReport and renders nothing itself', () => {
    renderWithProviders(
      <DetailSectionFrame id="releases" title="Releases" defaultCollapsed={false} {...labels}>
        <SectionCountReport count={3} />
        <p>release list</p>
      </DetailSectionFrame>,
    );
    expect(screen.getByText('/ 3')).toBeTruthy();
  });

  it('no-ops useSectionCount when rendered outside a frame', () => {
    function Lonely() {
      useSectionCount(5);
      return <p>lonely</p>;
    }
    expect(() => renderWithProviders(<Lonely />)).not.toThrow();
    expect(screen.getByText('lonely')).toBeTruthy();
  });
});
