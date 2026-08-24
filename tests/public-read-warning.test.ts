import { describe, expect, it } from 'vitest';
import { shouldShowPublicReadWarning } from '@/lib/public-read-warning';

describe('public read deployment warning', () => {
  it('stays hidden when read protection is configured', () => {
    expect(shouldShowPublicReadWarning({ host: 'collection.example.test', readsProtected: true })).toBe(false);
  });

  it('stays hidden when no host information is available', () => {
    expect(shouldShowPublicReadWarning({ host: null, forwardedHost: undefined })).toBe(false);
  });

  it('stays hidden when header values only contain empty first candidates', () => {
    expect(shouldShowPublicReadWarning({ host: ' , collection.example.test', forwardedHost: '   ' })).toBe(false);
  });

  it('stays hidden for loopback hosts', () => {
    expect(shouldShowPublicReadWarning({ host: 'localhost:3000' })).toBe(false);
    expect(shouldShowPublicReadWarning({ host: '127.12.0.4:3000' })).toBe(false);
    expect(shouldShowPublicReadWarning({ host: '[::1]:3000' })).toBe(false);
  });

  it('shows for public direct hosts', () => {
    expect(shouldShowPublicReadWarning({ host: 'collection.example.test:443' })).toBe(true);
  });

  it('shows when any forwarded host candidate is public', () => {
    expect(shouldShowPublicReadWarning({ host: 'localhost:3000', forwardedHost: 'collection.example.test, proxy.local' })).toBe(true);
  });

  it('shows when a public host is paired with a loopback forwarded host', () => {
    expect(shouldShowPublicReadWarning({ host: 'collection.example.test', forwardedHost: '127.0.0.1:3000' })).toBe(true);
  });

  it('treats malformed bracket hosts as non-loopback public candidates', () => {
    expect(shouldShowPublicReadWarning({ host: '[collection.example.test' })).toBe(true);
  });
});
