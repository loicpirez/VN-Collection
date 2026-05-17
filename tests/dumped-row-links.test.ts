/**
 * Pin the URL shape of every link helper used by the /dumped page.
 *
 * Drift between the layout-editor deep-link, the VN page link, and
 * the "My editions" anchor used to mean the dump tracker silently
 * pointed to slightly wrong locations across page revisions. The
 * shelf deep-link in particular must always use `?view=layout` so
 * the page renders the editor (not the read-only spatial view) and
 * carry `highlight=<vn_id>` so the editor can scroll the slot into
 * view.
 *
 * Synthetic vn ids only — never reference real titles.
 */
import { describe, expect, it } from 'vitest';
import {
  dumpedEditionsAnchor,
  dumpedShelfHref,
  dumpedVnHref,
} from '@/lib/dumped-links';

describe('dumped row link helpers', () => {
  it('VN link points to /vn/<id>', () => {
    expect(dumpedVnHref('v90400')).toBe('/vn/v90400');
    expect(dumpedVnHref('egs_777')).toBe('/vn/egs_777');
  });

  it('My-editions anchor uses #my-editions matching the section id', () => {
    expect(dumpedEditionsAnchor('v90401')).toBe('/vn/v90401#my-editions');
  });

  it('Shelf deep-link uses /shelf?view=layout and encodes highlight=<id>', () => {
    expect(dumpedShelfHref('v90402')).toBe('/shelf?view=layout&highlight=v90402');
  });

  it('Shelf deep-link percent-encodes synthetic ids that include underscores', () => {
    // egs_NNN ids are valid (synthetic). Underscore is unreserved
    // per RFC 3986 §2.3 so the encoded form equals the input — but
    // the encoder still runs to defend against ids with reserved
    // characters in the future.
    expect(dumpedShelfHref('egs_12345')).toBe('/shelf?view=layout&highlight=egs_12345');
  });
});
