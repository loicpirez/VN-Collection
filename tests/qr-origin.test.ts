import { describe, expect, it } from 'vitest';
import { qrOriginFromHeaders } from '@/lib/qr-origin';

describe('qrOriginFromHeaders', () => {
  it('uses normalized reverse-proxy headers when they are valid', () => {
    expect(qrOriginFromHeaders({
      forwardedProto: 'https',
      forwardedHost: 'library.example.test:8443',
      host: '127.0.0.1:3000',
    })).toBe('https://library.example.test:8443');
  });

  it('takes the first value from comma-separated forwarding headers', () => {
    expect(qrOriginFromHeaders({
      forwardedProto: 'https, http',
      forwardedHost: 'library.example.test, internal.example.test',
      host: '127.0.0.1:3000',
    })).toBe('https://library.example.test');
  });

  it('falls back to the direct host when forwarded host input is malformed', () => {
    expect(qrOriginFromHeaders({
      forwardedProto: 'javascript',
      forwardedHost: 'user:pass@library.example.test',
      host: '127.0.0.1:3000',
    })).toBe('http://127.0.0.1:3000');
  });

  it('uses localhost when neither host header is valid', () => {
    expect(qrOriginFromHeaders({
      forwardedProto: null,
      forwardedHost: '/bad',
      host: '/bad',
    })).toBe('http://localhost:3000');
  });

  it('falls back when URL parsing rejects an authority-shaped host', () => {
    expect(qrOriginFromHeaders({
      forwardedProto: 'https',
      forwardedHost: ':3000',
      host: 'localhost:3000',
    })).toBe('https://localhost:3000');
  });
});
