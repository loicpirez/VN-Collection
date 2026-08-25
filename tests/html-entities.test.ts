import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from '@/lib/html-entities';

describe('decodeHtmlEntities', () => {
  it('decodes named, decimal, and hexadecimal references once', () => {
    expect(decodeHtmlEntities('&eacute; &#937; &#x3A9; &nbsp; &amp;eacute;')).toBe('é Ω Ω   &eacute;');
  });

  it('leaves ordinary text unchanged', () => {
    expect(decodeHtmlEntities('Synthetic title')).toBe('Synthetic title');
  });
});
