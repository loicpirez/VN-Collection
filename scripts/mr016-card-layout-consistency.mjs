/**
 * MR-016 / MR-005 evidence: Unified Discover/Browse card layout.
 *
 * Checks all discover pages use the unified card shell:
 *   - bg-bg-card on card root (not bg-bg-elev variants)
 *   - rounded-xl on card root
 *   - gap-4 grid (discover pages; wishlist baseline uses gap-5)
 *   - 2/3 aspect ratio cover
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';

const PAGES = [
  { url: '/wishlist',                 label: 'wishlist (baseline)',    checkGrid: false },
  { url: '/recommendations',          label: 'recommendations',        checkGrid: true  },
  { url: '/similar?vn=v17',           label: 'similar',                checkGrid: true  },
  { url: '/top-ranked',               label: 'top-ranked (vndb)',      checkGrid: true  },
  { url: '/top-ranked?tab=egs',       label: 'top-ranked (egs)',       checkGrid: true  },
  { url: '/upcoming',                 label: 'upcoming (all)',         checkGrid: true  },
  { url: '/upcoming?tab=anticipated', label: 'upcoming (anticipated)', checkGrid: true  },
];

// Selector for result cards — excludes skeleton-only divs and UI panels
// by requiring the hover translate class that only real cards have.
const REAL_CARD_SEL = '[class*="rounded-xl"][class*="bg-bg-card"][class*="hover:border-accent"]';

let pass = 0;
let fail = 0;

const log = (ok, msg) => {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${msg}`);
  if (ok) pass++; else fail++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

for (const { url, label, checkGrid } of PAGES) {
  try {
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Wait for at least one real card (post-hydration, not skeleton)
    await page.waitForSelector(REAL_CARD_SEL, { timeout: 12_000 });

    // All checks run as fresh page.evaluate to avoid stale handles
    const result = await page.evaluate(({ realCardSel, checkGrid: doGrid }) => {
      const card = document.querySelector(realCardSel);
      if (!card) return { found: false };

      const cls = card.className ?? '';
      const hasBgCard = cls.includes('bg-bg-card') && !cls.includes('bg-bg-elev');
      const hasRoundedXl = cls.includes('rounded-xl');

      // Grid gap-4 check
      let hasGap4 = null;
      if (doGrid) {
        const grids = [...document.querySelectorAll('ul.grid, ol.grid')].filter(
          (el) => el.className.includes('gap-')
        );
        hasGap4 = grids.length > 0 && grids.every((g) => g.className.includes('gap-4'));
      }

      // Cover aspect ratio — search all descendants of the card
      const hasCover = [...card.querySelectorAll('*')].some((el) => {
        const c = typeof el.className === 'string' ? el.className : (el.className?.baseVal ?? '');
        const s = el.getAttribute?.('style') ?? '';
        return c.includes('aspect-[2/3]') || s.includes('2 / 3');
      });

      return { found: true, hasBgCard, hasRoundedXl, hasGap4, hasCover };
    }, { realCardSel: REAL_CARD_SEL, checkGrid });

    if (!result.found) {
      console.log(`[SKIP] ${label}: no real card found`);
      continue;
    }

    log(result.hasBgCard,   `${label}: card uses bg-bg-card`);
    log(result.hasRoundedXl, `${label}: card uses rounded-xl`);
    if (checkGrid) log(result.hasGap4,    `${label}: grid uses gap-4`);
    log(result.hasCover,    `${label}: cover has 2/3 aspect ratio`);

  } catch (err) {
    console.log(`[ERROR] ${label}: ${err.message}`);
    fail++;
  }
}

await browser.close();

console.log('');
console.log(`PASS=${pass}  FAIL=${fail}`);
if (fail > 0) process.exit(1);
