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

describe('root request proxy', () => {
  it('continues API requests accepted by the shared CSRF guard', () => {
    const request = new NextRequest('http://localhost:3000/api/settings');
    const response = proxy(request);
    expect(csrfGuardMock).toHaveBeenCalledWith(request);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('content-security-policy')).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/]+=*' 'strict-dynamic'/);
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(
      response.headers.get('content-security-policy'),
    );
    expect(response.headers.get('x-middleware-request-x-nonce')).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(config.matcher).toEqual(['/:path*']);
  });

  it('does not apply the API CSRF guard to page navigation', () => {
    const response = proxy(new NextRequest('http://localhost:3000/vn/v90001'));
    expect(csrfGuardMock).not.toHaveBeenCalled();
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('content-security-policy')).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('overwrites spoofed nonce headers and generates a fresh nonce per request', () => {
    const headers = {
      'content-security-policy': "script-src 'unsafe-inline' *",
      'x-nonce': 'attacker-controlled',
    };
    const first = proxy(new NextRequest('http://localhost:3000/', { headers }));
    const second = proxy(new NextRequest('http://localhost:3000/', { headers }));
    const firstNonce = first.headers.get('x-middleware-request-x-nonce');
    const secondNonce = second.headers.get('x-middleware-request-x-nonce');
    expect(first.status).toBe(200);
    expect(firstNonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(secondNonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(firstNonce).not.toBe('attacker-controlled');
    expect(firstNonce).not.toBe(secondNonce);
    const scriptDirective = first.headers.get('content-security-policy')
      ?.split('; ')
      .find((directive) => directive.startsWith('script-src'));
    expect(scriptDirective).not.toContain("'unsafe-inline'");
  });

  it('returns the denial response from the shared CSRF guard unchanged', () => {
    const denied = NextResponse.json({ error: 'denied' }, { status: 403 });
    csrfGuardMock.mockReturnValueOnce(denied);
    const response = proxy(new NextRequest('http://localhost:3000/api/settings'));
    expect(response).toBe(denied);
    expect(response.headers.get('content-security-policy')).toContain("script-src 'self' 'nonce-");
  });
});
