// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { PrintButton } from '@/components/PrintButton';
import { OpenSettingsButton } from '@/components/OpenSettingsButton';
import { SourceTag } from '@/components/SourceTag';
import { StatusBadge } from '@/components/StatusBadge';
import { TitleLine, useResolvedTitle } from '@/components/TitleLine';
import { ErrorAlert } from '@/components/ErrorAlert';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';
import type { Status } from '@/lib/types';

const t = dictionaries[DEFAULT_LOCALE];

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('small presentational UI runtime contracts', () => {
  it('prints from the labels action button', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderWithProviders(<PrintButton label="Print labels" />);
    fireEvent.click(screen.getByRole('button', { name: 'Print labels' }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('dispatches an open-settings event carrying the requested tab', () => {
    const listener = vi.fn<(event: Event) => void>();
    window.addEventListener('vn:open-settings', listener);
    renderWithProviders(<OpenSettingsButton tab="integrations" label="Open integrations" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open integrations' }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent<{ tab: string }>).detail).toEqual({ tab: 'integrations' });
    window.removeEventListener('vn:open-settings', listener);
  });

  it('renders source badges only for non-default or fallback source states', () => {
    const { rerender } = renderWithProviders(<SourceTag used={null} fellBack={false} />);
    expect(screen.queryByText('VNDB')).toBeNull();
    rerender(<SourceTag used="vndb" fellBack={false} />);
    expect(screen.queryByText('VNDB')).toBeNull();
    rerender(<SourceTag used="vndb" fellBack />);
    expect(screen.getByText('VNDB')).toHaveAttribute('title', expect.stringContaining('VNDB'));
    rerender(<SourceTag used="egs" fellBack={false} />);
    expect(screen.getByText('EGS')).toHaveAttribute('title', 'EGS');
  });

  it('renders every collection status label and icon mapping', () => {
    const statuses: Status[] = ['planning', 'playing', 'completed', 'on_hold', 'dropped'];
    for (const status of statuses) {
      const { unmount } = renderWithProviders(<StatusBadge status={status} className="extra-class" />);
      expect(screen.getByText(t.status[status]).parentElement).toHaveClass('extra-class');
      unmount();
    }
  });

  it('renders error and warning alerts with optional secondary content and roles', () => {
    const { rerender } = renderWithProviders(<ErrorAlert title="Failure" className="extra-class" />);
    expect(screen.getByRole('alert')).toHaveClass('extra-class');
    expect(screen.queryByText('Details')).toBeNull();
    rerender(<ErrorAlert title="Warning" tone="warning" role="status">Details</ErrorAlert>);
    expect(screen.getByRole('status')).toHaveTextContent('Details');
  });

  it('resolves title order, heading level, subtitle visibility, and the title hook', async () => {
    localStorage.setItem('vn_display_settings_v1', JSON.stringify({ preferNativeTitle: true }));

    function HookProbe() {
      const pair = useResolvedTitle('Translated title', 'Native title');
      return <span>{pair.main} / {pair.sub}</span>;
    }

    const { rerender } = renderWithProviders(
      <DisplaySettingsProvider initial={{ preferNativeTitle: true }}>
        <TitleLine title="Translated title" alttitle="Native title" as="h3" mainClassName="main" subClassName="sub" />
        <HookProbe />
      </DisplaySettingsProvider>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { level: 3, name: 'Native title' })).toBeInTheDocument());
    expect(screen.getByText('Translated title', { selector: 'div.sub' })).toBeInTheDocument();
    expect(screen.getByText('Native title / Translated title')).toBeInTheDocument();

    rerender(
      <DisplaySettingsProvider initial={{ preferNativeTitle: false }}>
        <TitleLine title="Same title" alttitle="Same title" showSub={false} />
      </DisplaySettingsProvider>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Same title' })).toBeInTheDocument();
    expect(screen.queryByText('Same title', { selector: 'div' })).toBeNull();

    function UndefinedHookProbe() {
      const pair = useResolvedTitle('Solo title', undefined);
      return <span>{pair.main} / {String(pair.sub)}</span>;
    }

    rerender(
      <DisplaySettingsProvider>
        <TitleLine title="Solo title" alttitle={undefined} />
        <UndefinedHookProbe />
      </DisplaySettingsProvider>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Solo title' })).toBeInTheDocument();
    expect(screen.getByText('Solo title / null')).toBeInTheDocument();
  });
});
