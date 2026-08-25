import { decodeHTML } from 'entities';

/**
 * Decode one layer of HTML character references without recursively decoding
 * text that was intentionally escaped by the upstream source.
 *
 * @param value Raw text received from an HTML document.
 * @returns Text with named and numeric HTML character references decoded once.
 */
export function decodeHtmlEntities(value: string): string {
  return decodeHTML(value).replace(/\u00a0/g, ' ');
}
