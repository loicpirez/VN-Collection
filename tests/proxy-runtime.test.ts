import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { csrfGuard } from '@/lib/csrf';
import { config, proxy } from '@/proxy';

vi.mock('@/lib/csrf', () => ({
  csrfGuard: vi.fn(),
}));

const csrfGuardMock = vi.mocked(csrfGuard);

beforeEach(() => {
  csrfGuardMock.mockReset().mockReturnValue(null);
});

describe('root API proxy', () => {
  it('continues requests accepted by the shared CSRF guard', () => {
    const request = new NextRequest('http://localhost:3000/api/settings');
    const response = proxy(request);
    expect(csrfGuardMock).toHaveBeenCalledWith(request);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(config.matcher).toEqual(['/api/:path*']);
  });

  it('returns the denial response from the shared CSRF guard unchanged', () => {
    const denied = NextResponse.json({ error: 'denied' }, { status: 403 });
    csrfGuardMock.mockReturnValueOnce(denied);
    expect(proxy(new NextRequest('http://localhost:3000/api/settings'))).toBe(denied);
  });
});
