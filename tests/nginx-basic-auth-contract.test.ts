import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const publicIcons = readFileSync('ops/nginx/vndb-public-icons.conf', 'utf8');

describe('Nginx Basic Auth public icon contract', () => {
  it('exempts only browser icon discovery routes from Basic Auth', () => {
    expect(publicIcons).toContain('auth_basic off;');
    expect(publicIcons).toContain('return 204;');
    expect(publicIcons).toContain('favicon\\.ico');
    expect(publicIcons).toContain('apple-touch-icon');
    expect(publicIcons).not.toMatch(/location\s+\/?\s*\{/);
    expect(publicIcons).not.toContain('/api');
    expect(publicIcons).not.toContain('/_next');
    expect(publicIcons.match(/auth_basic off;/g)).toHaveLength(1);
  });

  it('documents the iOS credential-context reason and authenticated fallback', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain('NetworkingExtension');
    expect(readme).toContain('include /etc/nginx/snippets/vndb-public-icons.conf;');
    expect(readme).toContain('All pages, Next.js assets, and API routes remain behind Basic Auth.');
  });
});
