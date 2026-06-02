import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = readFileSync('src/app/layout.tsx', 'utf8');

describe('root Basic Auth URL scrub', () => {
  it('removes embedded URL credentials before client islands issue relative fetches', () => {
    expect(layout).toContain('const BASIC_AUTH_URL_SCRUB_SCRIPT');
    expect(layout).toContain('if (!current.username && !current.password) return');
    expect(layout).toContain("current.username = ''");
    expect(layout).toContain("current.password = ''");
    expect(layout).toContain("window.history.replaceState(null, '', current.href)");
    expect(layout).toContain('dangerouslySetInnerHTML={{ __html: BASIC_AUTH_URL_SCRUB_SCRIPT }}');
  });
});
