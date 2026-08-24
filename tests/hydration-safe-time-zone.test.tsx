// @vitest-environment jsdom
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fmtDate } from '@/lib/locale-number';
import { formatHydrationSafeDate, useHydrationSafeTimeZone } from '@/lib/use-hydration-safe-time-zone';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TIMESTAMP = Date.UTC(2026, 5, 2, 0, 20);

function TimestampProbe() {
  const timeZone = useHydrationSafeTimeZone();
  return (
    <time dateTime={new Date(TIMESTAMP).toISOString()}>
      {formatHydrationSafeDate(
        new Date(TIMESTAMP),
        'en',
        { dateStyle: 'medium', timeStyle: 'short' },
        timeZone,
        'date-time',
      )}
    </time>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('hydration-safe browser timezone', () => {
  it('hydrates the UTC server text before switching to the browser timezone', async () => {
    const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function resolvedOptions(this: Intl.DateTimeFormat) {
      return { ...originalResolvedOptions.call(this), timeZone: 'Asia/Tokyo' };
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const host = document.createElement('div');
    host.innerHTML = renderToString(<TimestampProbe />);
    document.body.append(host);

    const utcText = '2026-06-02 00:20 UTC';
    const tokyoText = fmtDate(new Date(TIMESTAMP), 'en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Tokyo',
    });
    expect(host.textContent).toBe(utcText);

    let root: Root | null = null;
    await act(async () => {
      root = hydrateRoot(host, <TimestampProbe />);
    });

    expect(host.textContent).toBe(tokyoText);
    expect(consoleError).not.toHaveBeenCalled();
    await act(async () => root?.unmount());
  });

  it('uses stable UTC date and time labels before hydration', () => {
    const date = new Date(TIMESTAMP);
    expect(formatHydrationSafeDate(date, 'en', { dateStyle: 'medium' }, null, 'date')).toBe('2026-06-02');
    expect(formatHydrationSafeDate(date, 'en', { timeStyle: 'short' }, null, 'time')).toBe('00:20 UTC');
  });
});
