import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '@/lib/content-security-policy';

describe('per-request content security policy', () => {
  it('authorizes scripts only with the request nonce in production', () => {
    const policy = contentSecurityPolicy('dGVzdC1ub25jZQ==', { NODE_ENV: 'production' });
    const scriptDirective = policy.split('; ').find((directive) => directive.startsWith('script-src'));
    expect(scriptDirective).toBe("script-src 'self' 'nonce-dGVzdC1ub25jZQ==' 'strict-dynamic'");
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(scriptDirective).not.toContain("'unsafe-eval'");
    expect(policy).toContain('upgrade-insecure-requests');
  });

  it('adds only the development allowance required by React debugging', () => {
    const policy = contentSecurityPolicy('dGVzdA==', { NODE_ENV: 'development' });
    expect(policy).toContain("script-src 'self' 'nonce-dGVzdA==' 'strict-dynamic' 'unsafe-eval'");
    expect(policy).not.toContain('upgrade-insecure-requests');
  });

  it('keeps interaction QA on HTTP and rejects injectable nonce values', () => {
    expect(contentSecurityPolicy('dGVzdA==', { NODE_ENV: 'production', VNCOLL_QA: '1' }))
      .not.toContain('upgrade-insecure-requests');
    expect(() => contentSecurityPolicy("bad'; script-src *", { NODE_ENV: 'production' })).toThrow('Invalid CSP nonce');
  });
});
