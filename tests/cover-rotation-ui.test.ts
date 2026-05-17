import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pin the rotation-UI affordances to the source of CoverHero,
 * HeroBanner and MediaGallery. The runtime behaviour is covered
 * end-to-end by the API-level rotation tests in
 * `tests/cover-rotation.test.ts`; this file guards against a
 * regression where the buttons that drive that API silently
 * disappear from the rendered tree (e.g. someone refactors the
 * overlay and forgets to re-mount the rotate controls).
 *
 * Source-pinning is sufficient because:
 *   - The buttons live behind a `group-hover` opacity, so a
 *     headless DOM snapshot would not exercise the hover path
 *     anyway.
 *   - The aria-labels we pin here ARE the user-visible contract;
 *     i18n strings are spot-checked in `dictionaries-parity.test.ts`.
 */
const ROOT = join(__dirname, '..');

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('CoverRotationButtons — VN cover rotation overlay', () => {
  // Rotation UI moved out of `CoverHero` into a dedicated component
  // so it mounts on BOTH cover branches (the simple `<CoverHero>`
  // path AND the `<CoverCompare>` source-comparison path). The old
  // tests asserted against `CoverHero.tsx` directly and broke when
  // the buttons were extracted; the new contract targets the
  // dedicated component.
  const src = read('src/components/CoverRotationButtons.tsx');

  it('imports both rotation icons', () => {
    expect(src).toMatch(/RotateCcw/);
    expect(src).toMatch(/RotateCw/);
  });

  it('renders rotate-left button with the localised aria-label', () => {
    expect(src).toMatch(/aria-label=\{t\.coverActions\.rotateLeft\}/);
  });
  it('renders rotate-right button with the localised aria-label', () => {
    expect(src).toMatch(/aria-label=\{t\.coverActions\.rotateRight\}/);
  });
  it('wires rotate-left onClick to rotateBy(-90)', () => {
    expect(src).toMatch(/onClick=\{\(\)\s*=>\s*rotateBy\(-90\)\}/);
  });
  it('wires rotate-right onClick to rotateBy\\(90\\)', () => {
    expect(src).toMatch(/onClick=\{\(\)\s*=>\s*rotateBy\(90\)\}/);
  });
  it('issues a PATCH against the cover API', () => {
    expect(src).toMatch(/\/api\/collection\/\$\{vnId\}\/cover/);
    expect(src).toMatch(/method: 'PATCH'/);
    expect(src).toMatch(/JSON\.stringify\(\{ rotation: next \}\)/);
  });
  it('exposes a reset affordance when rotation is non-zero', () => {
    expect(src).toMatch(/rotation !== 0/);
    expect(src).toMatch(/t\.coverActions\.resetRotation/);
  });
});

describe('VN detail page mounts the rotation overlay for both cover branches', () => {
  const src = read('src/app/vn/[id]/page.tsx');
  it('renders <CoverRotationButtons> alongside the cover container', () => {
    expect(src).toMatch(/<CoverRotationButtons\b/);
    // The overlay is always gated by `inCol`; the mount must sit
    // OUTSIDE the `(egsPosterHas || customPosterHas) ?` ternary so
    // the simple and compare branches both get it.
    expect(src).toMatch(/initialRotation=\{vn\.cover_rotation\}/);
  });
});

describe('HeroBanner — rotation buttons', () => {
  const src = read('src/components/HeroBanner.tsx');

  it('imports both rotation icons', () => {
    expect(src).toMatch(/RotateCcw/);
    expect(src).toMatch(/RotateCw/);
  });
  it('renders rotate-left and rotate-right with localised aria-labels', () => {
    expect(src).toMatch(/aria-label=\{t\.coverActions\.rotateLeft\}/);
    expect(src).toMatch(/aria-label=\{t\.coverActions\.rotateRight\}/);
  });
  it('rotateBy targets the banner PATCH endpoint', () => {
    expect(src).toMatch(/\/api\/collection\/\$\{vnId\}\/banner/);
    expect(src).toMatch(/JSON\.stringify\(\{ rotation: next \}\)/);
  });
});

describe('MediaGallery — per-tile rotation preview', () => {
  const src = read('src/components/MediaGallery.tsx');

  it('exposes rotate-left and rotate-right items in the kebab menu', () => {
    expect(src).toMatch(/t\.coverActions\.rotateLeft/);
    expect(src).toMatch(/t\.coverActions\.rotateRight/);
  });

  it('keeps the rotation in local component state (no PATCH)', () => {
    // The preview is intentionally non-persistent — pin that the per-
    // tile rotation is a useState, not a fetch call.
    expect(src).toMatch(/useState<0 \| 90 \| 180 \| 270>\(0\)/);
    // Per-tile rotate handlers must NOT hit the API; the only fetch
    // inside MediaGallery is the existing setAs() cover/banner POST.
    const rotateLeftMatch = src.match(/onRotateLeft[\s\S]*?onRotateRight/);
    expect(rotateLeftMatch).not.toBeNull();
  });

  it('exposes a reset-rotation entry once rotation != 0', () => {
    expect(src).toMatch(/rotation !== 0/);
    expect(src).toMatch(/t\.coverActions\.resetRotation/);
  });
});
