// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { AnniversaryFeedView, type AnniversaryEntry } from '@/components/AnniversaryFeedView';
import { SessionPanel } from '@/components/SessionPanel';

const mocks = vi.hoisted(() => ({
  homeState: {
    state: { hidden: false, collapsed: false },
    busy: false,
    isHidden: false,
    isCollapsed: false,
    toggleCollapsed: vi.fn(),
    hide: vi.fn(),
  },
}));

vi.mock('@/components/HomeSectionMenu', () => ({
  useHomeSection: () => mocks.homeState,
  HomeSectionControls: ({ onCollapseToggle }: { onCollapseToggle: () => void }) => (
    <button type="button" onClick={onCollapseToggle}>Controls</button>
  ),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt, localSrc, src }: { alt: string; localSrc?: string | null; src?: string | null }) => (
    <span data-alt={alt} data-local-src={localSrc ?? ''} data-src={src ?? ''} />
  ),
}));

vi.mock('@/components/GameLog', () => ({
  GameLog: ({ liveSessionMinutes, vnId }: { liveSessionMinutes: number; vnId: string }) => (
    <span data-testid="game-log">{vnId}:{liveSessionMinutes}</span>
  ),
}));

vi.mock('@/components/PomodoroTimer', () => ({
  PomodoroTimer: ({ onElapsedChange, vnId }: { onElapsedChange: (minutes: number) => void; vnId: string }) => (
    <button type="button" onClick={() => onElapsedChange(7)}>Timer {vnId}</button>
  ),
}));

const entry: AnniversaryEntry = {
  id: 'v90001',
  title: 'Anniversary Title',
  years: 3,
  image_url: null,
  image_thumb: 'https://example.test/thumb.jpg',
  local_image_thumb: '/local/thumb.jpg',
  image_sexual: null,
};

beforeEach(() => {
  mocks.homeState.state = { hidden: false, collapsed: false };
  mocks.homeState.busy = false;
  mocks.homeState.isHidden = false;
  mocks.homeState.isCollapsed = false;
  mocks.homeState.toggleCollapsed.mockReset();
  mocks.homeState.hide.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('client detail helpers', () => {
  it('hides anniversaries for hidden sections and empty days', () => {
    mocks.homeState.isHidden = true;
    const { container, rerender } = renderWithProviders(
      <AnniversaryFeedView title="Anniversaries" yearsAgoTemplate="{n} years" entries={[entry]} />,
    );
    expect(container.querySelector('aside')).toBeNull();
    mocks.homeState.isHidden = false;
    rerender(<AnniversaryFeedView title="Anniversaries" yearsAgoTemplate="{n} years" entries={[]} />);
    expect(container.querySelector('aside')).toBeNull();
  });

  it('renders collapsed and expanded anniversary states with artwork fallback', () => {
    mocks.homeState.isCollapsed = true;
    const { container, rerender } = renderWithProviders(
      <AnniversaryFeedView title="Anniversaries" yearsAgoTemplate="{n} years" entries={[entry]} />,
    );
    expect(screen.getByText('Anniversaries')).toBeInTheDocument();
    expect(screen.queryByText('Anniversary Title')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Controls' }));
    expect(mocks.homeState.toggleCollapsed).toHaveBeenCalledTimes(1);

    mocks.homeState.isCollapsed = false;
    rerender(<AnniversaryFeedView title="Anniversaries" yearsAgoTemplate="{n} years" entries={[entry]} />);
    expect(screen.getByText('Anniversary Title')).toBeInTheDocument();
    expect(screen.getByText('3 years')).toBeInTheDocument();
    const image = container.querySelector('[data-alt="Anniversary Title"]');
    expect(image).toHaveAttribute('data-src', 'https://example.test/thumb.jpg');
    expect(image).toHaveAttribute('data-local-src', '/local/thumb.jpg');
  });

  it('lifts timer elapsed minutes into the game log and resets them when the VN changes', async () => {
    const { rerender } = renderWithProviders(<SessionPanel vnId="v90001" currentMinutes={0} initialLog={[]} />);
    expect(screen.getByTestId('game-log')).toHaveTextContent('v90001:0');
    fireEvent.click(screen.getByRole('button', { name: 'Timer v90001' }));
    expect(screen.getByTestId('game-log')).toHaveTextContent('v90001:7');
    rerender(<SessionPanel vnId="v90002" currentMinutes={0} initialLog={[]} />);
    await waitFor(() => expect(screen.getByTestId('game-log')).toHaveTextContent('v90002:0'));
  });
});
