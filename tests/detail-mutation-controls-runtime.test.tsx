// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FavoriteToggleButton } from '@/components/FavoriteToggleButton';
import { VnListMemberships } from '@/components/VnListMemberships';
import {
  OWNED_EDITIONS_EVENT,
  ReleaseOwnedToggle,
} from '@/components/ReleaseOwnedToggle';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: navigationMocks.refresh }),
}));

const t = dictionaries.en;

function jsonResponse(payload: unknown = { ok: true }, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  navigationMocks.refresh.mockReset();
  global.fetch = vi.fn().mockResolvedValue(jsonResponse());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FavoriteToggleButton', () => {
  it('optimistically favorites and unfavorites inline or overlay controls', async () => {
    const { rerender } = renderWithProviders(
      <FavoriteToggleButton vnId="v90001" initial={false} variant="inline" />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(navigationMocks.refresh).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith('/api/collection/v90001', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ favorite: true }),
    }));
    expect(screen.getByRole('button', { pressed: true })).toHaveAttribute('aria-pressed', 'true');

    rerender(<FavoriteToggleButton vnId="v90001" initial variant="overlay" />);
    fireEvent.click(screen.getByRole('button', { pressed: true }));
    await waitFor(() => expect(navigationMocks.refresh).toHaveBeenCalledTimes(2));
    expect(global.fetch).toHaveBeenLastCalledWith('/api/collection/v90001', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ favorite: false }),
    }));
  });

  it('adds an out-of-collection VN before favoriting it', async () => {
    renderWithProviders(
      <FavoriteToggleButton vnId="v90001" initial={false} inCollection={false} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/collection/v90001', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ status: 'planning' }),
    }));
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/collection/v90001', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ favorite: true }),
    }));
  });

  it('reports an auto-add failure before attempting to favorite an out-of-collection VN', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'auto-add failed' }, 500));
    renderWithProviders(
      <FavoriteToggleButton vnId="v90001" initial={false} inCollection={false} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('auto-add failed')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale completion between auto-add and favorite patch', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    const { rerender } = renderWithProviders(
      <FavoriteToggleButton vnId="v90001" initial={false} inCollection={false} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button'));
    rerender(<FavoriteToggleButton vnId="v90002" initial={false} inCollection={false} />);
    await act(async () => {
      resolveFetch(jsonResponse());
      await Promise.resolve();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });

  it('rolls back the optimistic state and reports an API failure', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'favorite failed' }, 500));
    renderWithProviders(<FavoriteToggleButton vnId="v90001" initial={false} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('favorite failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { pressed: false })).toHaveAttribute('aria-pressed', 'false');
  });

  it('suppresses duplicate clicks and ignores a stale completion after identity change', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    const { rerender } = renderWithProviders(
      <FavoriteToggleButton vnId="v90001" initial={false} />,
      { locale: 'en' },
    );
    const button = screen.getByRole('button');
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    rerender(<FavoriteToggleButton vnId="v90002" initial={false} />);
    await act(async () => {
      resolveFetch(jsonResponse());
      await Promise.resolve();
    });
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });

  it('ignores abort rejections from canceled mutations', async () => {
    const abortError = new Error('request canceled');
    abortError.name = 'AbortError';
    global.fetch = vi.fn().mockRejectedValue(abortError);
    renderWithProviders(<FavoriteToggleButton vnId="v90001" initial={false} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('request canceled')).toBeNull();
  });

  it('allows click propagation when the caller opts out of interception', () => {
    const parentClick = vi.fn();
    renderWithProviders(
      <div onClick={parentClick}>
        <FavoriteToggleButton vnId="v90001" initial={false} stopPropagation={false} />
      </div>,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button'));
    expect(parentClick).toHaveBeenCalledTimes(1);
  });
});

describe('VnListMemberships', () => {
  it('renders nothing for an empty list and renders colored membership links', () => {
    const { container, rerender } = renderWithProviders(
      <VnListMemberships vnId="v90001" lists={[]} />,
      { locale: 'en' },
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<VnListMemberships vnId="v90001" lists={[{ id: 1, name: 'Favorites', color: '#ff0000' }]} />);
    expect(screen.getByRole('link', { name: 'Favorites' })).toHaveAttribute('href', '/lists/1');
  });

  it('removes a membership, reports success, and refreshes', async () => {
    renderWithProviders(
      <VnListMemberships vnId="v90001" lists={[{ id: 1, name: 'Favorites', color: null }]} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.lists.removeFromList }));
    await waitFor(() => expect(navigationMocks.refresh).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith('/api/lists/1/items?vn=v90001', expect.objectContaining({ method: 'DELETE' }));
    expect(await screen.findByText(t.lists.removedFrom.replace('{name}', 'Favorites'))).toBeInTheDocument();
  });

  it('reports failures and suppresses a duplicate removal while busy', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    renderWithProviders(
      <VnListMemberships vnId="v90001" lists={[{ id: 1, name: 'Favorites', color: null }]} />,
      { locale: 'en' },
    );
    const button = screen.getByRole('button', { name: t.lists.removeFromList });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFetch(jsonResponse({ error: 'remove failed' }, 500));
      await Promise.resolve();
    });
    expect(await screen.findByText('remove failed')).toBeInTheDocument();
  });

  it('ignores a stale completion after the VN identity changes', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    const lists = [{ id: 1, name: 'Favorites', color: null }];
    const { rerender } = renderWithProviders(<VnListMemberships vnId="v90001" lists={lists} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.lists.removeFromList }));
    rerender(<VnListMemberships vnId="v90002" lists={lists} />);
    await act(async () => {
      resolveFetch(jsonResponse());
      await Promise.resolve();
    });
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });

  it('ignores a stale rejection after the VN identity changes', async () => {
    let rejectFetch: (error: Error) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((_resolve, reject) => {
      rejectFetch = reject;
    }));
    const lists = [{ id: 1, name: 'Favorites', color: null }];
    const { rerender } = renderWithProviders(<VnListMemberships vnId="v90001" lists={lists} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.lists.removeFromList }));
    rerender(<VnListMemberships vnId="v90002" lists={lists} />);
    await act(async () => {
      rejectFetch(new Error('stale failure'));
      await Promise.resolve();
    });
    expect(screen.queryByText('stale failure')).toBeNull();
  });
});

describe('ReleaseOwnedToggle', () => {
  it('adds the VN before recording a newly owned release and broadcasts the change', async () => {
    const listener = vi.fn<(event: Event) => void>();
    window.addEventListener(OWNED_EDITIONS_EVENT, listener);
    renderWithProviders(
      <ReleaseOwnedToggle
        vnId="v90001"
        vnTitle="VN title"
        vnRelation="complete"
        releaseId="r90001"
        initialInCollection={false}
        initialOwned={false}
      />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { pressed: false }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/collection/v90001', expect.objectContaining({ method: 'POST' }));
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/collection/v90001/owned-releases', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ release_id: 'r90001' }),
    }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
      vnId: 'v90001',
      releaseId: 'r90001',
      isNowOwned: true,
    });
    window.removeEventListener(OWNED_EDITIONS_EVENT, listener);
  });

  it('removes an owned release and renders edit inventory affordances', async () => {
    renderWithProviders(
      <ReleaseOwnedToggle
        vnId="v90001"
        vnTitle="VN title"
        vnRelation="trial"
        releaseId="r90001"
        initialInCollection
        initialOwned
      />,
      { locale: 'en' },
    );
    expect(screen.getByRole('link', { name: new RegExp(t.releases.editInventory) })).toHaveAttribute(
      'href',
      '/vn/v90001?edit_release=r90001#my-editions',
    );
    fireEvent.click(screen.getByRole('button', { name: t.releases.removeMyEdition }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith('/api/collection/v90001/owned-releases?release_id=r90001', expect.objectContaining({
      method: 'DELETE',
    }));
  });

  it('reports failures and suppresses duplicate clicks while busy', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    renderWithProviders(
      <ReleaseOwnedToggle
        vnId="v90001"
        vnTitle="VN title"
        vnRelation="partial"
        releaseId="r90001"
        initialInCollection
        initialOwned={false}
      />,
      { locale: 'en' },
    );
    const button = screen.getByRole('button', { pressed: false });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFetch(jsonResponse({ error: 'owned failed' }, 500));
      await Promise.resolve();
    });
    expect(await screen.findByText('owned failed')).toBeInTheDocument();
  });

  it('ignores a stale completion after the release identity changes', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    const { rerender } = renderWithProviders(
      <ReleaseOwnedToggle
        vnId="v90001"
        vnTitle="VN title"
        vnRelation="complete"
        releaseId="r90001"
        initialInCollection
        initialOwned={false}
      />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { pressed: false }));
    rerender(
      <ReleaseOwnedToggle
        vnId="v90001"
        vnTitle="VN title"
        vnRelation="complete"
        releaseId="r90002"
        initialInCollection
        initialOwned={false}
      />,
    );
    await act(async () => {
      resolveFetch(jsonResponse());
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { pressed: false })).not.toBeDisabled();
  });
});
