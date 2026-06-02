// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { HomeSectionControls, useHomeSection } from '@/components/HomeSectionMenu';
import { DEFAULT_HOME_LAYOUT, HOME_LAYOUT_EVENT, type HomeSectionState } from '@/lib/home-section-layout';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: refreshMock, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function okFetch() {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
}

const OPTIONS_LABEL = 'Options de la section';

describe('HomeSectionControls', () => {
  beforeEach(() => {
    refreshMock.mockClear();
    global.fetch = okFetch() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const expanded: HomeSectionState = { visible: true, collapsed: false };

  it('renders the chevron and options trigger', () => {
    renderWithProviders(
      <HomeSectionControls
        state={expanded}
        busy={false}
        onCollapseToggle={vi.fn()}
        onHide={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: OPTIONS_LABEL })).toBeTruthy();
    // Collapse chevron present and announced as expandable.
    const chevron = screen.getByRole('button', { name: /Réduire|Collapse/i });
    expect(chevron.getAttribute('aria-expanded')).toBe('true');
  });

  it('appends the section label to aria-labels when sectionLabel is provided', () => {
    renderWithProviders(
      <HomeSectionControls
        state={expanded}
        busy={false}
        onCollapseToggle={vi.fn()}
        onHide={vi.fn()}
        sectionLabel="Title Y"
      />,
    );
    expect(screen.getByRole('button', { name: /Réduire.*Title Y|Collapse.*Title Y/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Options.*Title Y/i })).toBeTruthy();
  });

  it('invokes onCollapseToggle from the chevron', () => {
    const onCollapseToggle = vi.fn();
    renderWithProviders(
      <HomeSectionControls state={expanded} busy={false} onCollapseToggle={onCollapseToggle} onHide={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Réduire|Collapse/i }));
    expect(onCollapseToggle).toHaveBeenCalledTimes(1);
  });

  it('opens the menu and fires hide', () => {
    const onHide = vi.fn();
    renderWithProviders(
      <HomeSectionControls state={expanded} busy={false} onCollapseToggle={vi.fn()} onHide={onHide} />,
    );
    fireEvent.click(screen.getByRole('button', { name: OPTIONS_LABEL }));
    const menu = screen.getByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Masquer|Hide/i }));
    expect(onHide).toHaveBeenCalledTimes(1);
    // Menu closes after action.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('fires onCollapseToggle from the menu collapse item', () => {
    const onCollapseToggle = vi.fn();
    renderWithProviders(
      <HomeSectionControls state={expanded} busy={false} onCollapseToggle={onCollapseToggle} onHide={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: OPTIONS_LABEL }));
    const menu = screen.getByRole('menu');
    // The menu's first item is the collapse/expand toggle.
    fireEvent.click(within(menu).getAllByRole('menuitem')[0]);
    expect(onCollapseToggle).toHaveBeenCalledTimes(1);
  });

  it('renders and fires the optional clear-data menu entry', () => {
    const onClearData = vi.fn();
    renderWithProviders(
      <HomeSectionControls
        state={expanded}
        busy={false}
        onCollapseToggle={vi.fn()}
        onHide={vi.fn()}
        onClearData={onClearData}
        clearLabel="Clear history"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: OPTIONS_LABEL }));
    const menu = screen.getByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Clear history' }));
    expect(onClearData).toHaveBeenCalledTimes(1);
  });

  it('navigates menu items with ArrowDown / ArrowUp', () => {
    renderWithProviders(
      <HomeSectionControls
        state={expanded}
        busy={false}
        onCollapseToggle={vi.fn()}
        onHide={vi.fn()}
        onClearData={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: OPTIONS_LABEL }));
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    // First item focused on open.
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('closes the menu on Escape and restores focus to the trigger', () => {
    renderWithProviders(
      <HomeSectionControls state={expanded} busy={false} onCollapseToggle={vi.fn()} onHide={vi.fn()} />,
    );
    const trigger = screen.getByRole('button', { name: OPTIONS_LABEL });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes the menu on outside click', () => {
    renderWithProviders(
      <div>
        <HomeSectionControls state={expanded} busy={false} onCollapseToggle={vi.fn()} onHide={vi.fn()} />
        <button type="button">outside</button>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: OPTIONS_LABEL }));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows the expand chevron when collapsed', () => {
    renderWithProviders(
      <HomeSectionControls
        state={{ visible: true, collapsed: true }}
        busy={false}
        onCollapseToggle={vi.fn()}
        onHide={vi.fn()}
      />,
    );
    const chevron = screen.getByRole('button', { name: /Développer|Expand/i });
    expect(chevron.getAttribute('aria-expanded')).toBe('false');
  });

  it('disables both buttons while busy', () => {
    renderWithProviders(
      <HomeSectionControls state={expanded} busy onCollapseToggle={vi.fn()} onHide={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: OPTIONS_LABEL }).hasAttribute('disabled')).toBe(true);
  });
});

/** Minimal probe that surfaces the hook's API as clickable buttons. */
function HookProbe({ initialState }: { initialState?: HomeSectionState }) {
  const { state, busy, isHidden, isCollapsed, toggleCollapsed, hide } = useHomeSection('recently-viewed', initialState);
  return (
    <div>
      <span data-testid="state">{JSON.stringify(state)}</span>
      <span data-testid="flags">{`${busy}|${isHidden}|${isCollapsed}`}</span>
      <button type="button" onClick={toggleCollapsed}>toggle</button>
      <button type="button" onClick={hide}>hide</button>
    </div>
  );
}

describe('useHomeSection', () => {
  beforeEach(() => {
    refreshMock.mockClear();
    global.fetch = okFetch() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('seeds from the default layout when no initial state is given', () => {
    renderWithProviders(<HookProbe />);
    expect(screen.getByTestId('state').textContent).toBe(
      JSON.stringify(DEFAULT_HOME_LAYOUT.sections['recently-viewed']),
    );
    expect(screen.getByTestId('flags').textContent).toBe('false|false|false');
  });

  it('persists a collapse toggle via PATCH and refreshes the router', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<HookProbe initialState={{ visible: true, collapsed: false }} />);
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.home_section_layout_v1.sections['recently-viewed'].collapsed).toBe(true);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('reverts optimistic state and toasts on a failed hide', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'hide-failed' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<HookProbe initialState={{ visible: true, collapsed: false }} />);
    fireEvent.click(screen.getByRole('button', { name: 'hide' }));
    await waitFor(() => expect(document.body.textContent).toContain('hide-failed'));
    // Reverted: still visible.
    expect(screen.getByTestId('flags').textContent).toBe('false|false|false');
  });

  it('syncs from a HOME_LAYOUT_EVENT for this section', () => {
    renderWithProviders(<HookProbe initialState={{ visible: true, collapsed: false }} />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(HOME_LAYOUT_EVENT, {
          detail: { sections: { 'recently-viewed': { visible: true, collapsed: true } } },
        }),
      );
    });
    expect(screen.getByTestId('flags').textContent).toBe('false|false|true');
  });

  it('resets to the default on a reset event', () => {
    renderWithProviders(<HookProbe initialState={{ visible: false, collapsed: true }} />);
    expect(screen.getByTestId('flags').textContent).toBe('false|true|true');
    act(() => {
      window.dispatchEvent(new CustomEvent(HOME_LAYOUT_EVENT, { detail: { reset: true } }));
    });
    expect(screen.getByTestId('flags').textContent).toBe('false|false|false');
  });
});
