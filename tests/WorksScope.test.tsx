// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorksScopeProvider, WorksScopeLink, WorksScopeGrid, WorksScopeSection, WorksScopeCount } from '@/components/WorksScope';
import { renderWithProviders } from './helpers/render-component';

beforeEach(() => { window.history.replaceState(null, '', '/staff/s90001?density=260'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function credits(initialScope: 'all' | 'collection' = 'all') {
  return <WorksScopeProvider initialScope={initialScope}>
    <WorksScopeLink scope="all" href="/staff/s90001" className="scope-link">All</WorksScopeLink>
    <WorksScopeLink scope="collection" href="/staff/s90001?scope=collection">Collection</WorksScopeLink>
    <p data-testid="count"><WorksScopeCount all={125} owned={2} /></p>
    <WorksScopeCount all={125} owned={0} empty={<p>Collection empty</p>} />
    <WorksScopeSection ownedCount={0}><p>Unowned section</p></WorksScopeSection>
    <WorksScopeSection ownedCount={2}>
      <WorksScopeGrid ariaLabel="Credits" resetKey="s90001" owned={Array.from({ length: 125 }, (_, index) => index === 1 || index === 124)}>
        {Array.from({ length: 125 }, (_, index) => <li key={index}>Work {index}</li>)}
      </WorksScopeGrid>
    </WorksScopeSection>
  </WorksScopeProvider>;
}

describe('local credit scope', () => {
  it('switches a prolific credit list locally, resets pagination, and preserves the URL filters', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    renderWithProviders(credits(), { locale: 'en' });
    expect(screen.getAllByRole('listitem')).toHaveLength(60);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Work 124')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Collection' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Work 124')).toBeInTheDocument();
    expect(screen.queryByText('Unowned section')).not.toBeInTheDocument();
    expect(screen.getByText('Collection empty')).toBeInTheDocument();
    expect(screen.getByTestId('count')).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: 'Collection' })).toHaveAttribute('aria-current', 'page');
    expect(window.location.search).toBe('?density=260&scope=collection');
    fireEvent.click(screen.getByRole('link', { name: 'Collection' }));
    expect(push).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('link', { name: 'All' }));
    expect(screen.getByText('Work 0')).toBeInTheDocument();
    expect(screen.getByTestId('count')).toHaveTextContent('125');
    expect(screen.queryByText('Collection empty')).not.toBeInTheDocument();
    expect(window.location.search).toBe('?density=260');
    expect(push).toHaveBeenCalledTimes(2);
    expect(request).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('supports direct collection URLs, external scope props, Back/Forward, and cleanup', () => {
    const view = renderWithProviders(credits('collection'));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    act(() => { window.history.replaceState(null, '', '/staff/s90001'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(screen.getAllByRole('listitem')).toHaveLength(60);
    act(() => { window.history.replaceState(null, '', '/staff/s90001?scope=collection'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    view.rerender(credits('all'));
    expect(screen.getAllByRole('listitem')).toHaveLength(60);
    const remove = vi.spyOn(window, 'removeEventListener');
    view.unmount();
    expect(remove).toHaveBeenCalledWith('popstate', expect.any(Function));
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])('retains native link behavior for %o', (options) => {
    const push = vi.spyOn(window.history, 'pushState');
    const preventNavigation = (event: MouseEvent) => event.preventDefault();
    document.addEventListener('click', preventNavigation);
    renderWithProviders(credits());
    fireEvent.click(screen.getByRole('link', { name: 'Collection' }), options);
    document.removeEventListener('click', preventNavigation);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByTestId('count')).toHaveTextContent('125');
  });

  it('keeps an unwrapped scope link navigable', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const preventNavigation = (event: MouseEvent) => event.preventDefault();
    document.addEventListener('click', preventNavigation);
    renderWithProviders(<WorksScopeLink scope="collection" href="/staff/s90001?scope=collection">Collection</WorksScopeLink>);
    fireEvent.click(screen.getByRole('link', { name: 'Collection' }));
    document.removeEventListener('click', preventNavigation);
    expect(push).not.toHaveBeenCalled();
  });
});
