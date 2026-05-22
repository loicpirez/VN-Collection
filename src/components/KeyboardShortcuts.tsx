'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Keyboard, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { Dialog } from './Dialog';

const ROUTES: Record<string, string> = {
  h: '/',
  s: '/search',
  w: '/wishlist',
  r: '/recommendations',
  u: '/upcoming',
  q: '/quotes',
  y: `/year?y=${new Date().getFullYear()}`,
  d: '/data',
  t: '/stats',
};

/**
 * Global keyboard shortcuts. Two patterns:
 *
 *   - "/" focuses the first input/[role=search] on the page, falling back
 *     to scrolling to the top so the user can type into the library
 *     search box.
 *   - "g <key>" is the prefix navigation (gmail-style): `g h` → home,
 *     `g s` → search, etc. The prefix arms for ~1 second after `g`.
 *
 * "?" opens the help dialog. Modifier keys / open inputs are ignored so
 * the shortcuts never fight a typing user.
 *
 * Page-specific shortcuts (only active when on `/vn/*`):
 *   - "f" → click the inline favourite toggle button
 *   - "e" → scroll to #section-edit (tracking form)
 *   - "n" → scroll to #section-notes (personal notes)
 */
export function KeyboardShortcuts() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [help, setHelp] = useState(false);
  const isVnPage = pathname.startsWith('/vn/');

  useEffect(() => {
    let armed = false;
    let timer: NodeJS.Timeout | null = null;

    function inEditable(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    }

    function scrollToAnchor(id: string) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (inEditable(e.target)) return;

      if (e.key === '?') {
        e.preventDefault();
        setHelp((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        if (help) setHelp(false);
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        const candidate = document.querySelector<HTMLInputElement>('input[data-vn-search], input[role="search"]');
        if (candidate) {
          candidate.focus();
          candidate.select();
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }

      if (isVnPage) {
        if (e.key === 'f') {
          e.preventDefault();
          document.querySelector<HTMLButtonElement>('[data-shortcut="vn-favorite"]')?.click();
          return;
        }
        if (e.key === 'e') {
          e.preventDefault();
          scrollToAnchor('section-edit');
          return;
        }
        if (e.key === 'n') {
          e.preventDefault();
          scrollToAnchor('section-notes');
          return;
        }
      }

      if (armed) {
        armed = false;
        if (timer) { clearTimeout(timer); timer = null; }
        const route = ROUTES[e.key.toLowerCase()];
        if (route) {
          e.preventDefault();
          router.push(route);
        }
        return;
      }
      if (e.key === 'g') {
        armed = true;
        timer = setTimeout(() => { armed = false; }, 1200);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (timer) clearTimeout(timer);
    };
  }, [help, router, isVnPage]);

  return (
    <Dialog
      open={help}
      onClose={() => setHelp(false)}
      panelClassName="w-[min(92vw,440px)] p-4 sm:p-6"
      title={
        <span className="inline-flex items-center gap-2">
          <Keyboard className="h-5 w-5 text-accent" aria-hidden /> {t.shortcuts.title}
        </span>
      }
    >
      <button
        type="button"
        onClick={() => setHelp(false)}
        className="absolute right-3 top-3 tap-target rounded p-1 text-muted hover:text-white"
        aria-label={t.common.close}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      <div className="space-y-4">
        <ul className="space-y-1.5 text-sm">
          <Row k="/" label={t.shortcuts.focusSearch} />
          <Row k="?" label={t.shortcuts.help} />
          <Row k="g h" label={t.shortcuts.goHome} />
          <Row k="g s" label={t.shortcuts.goSearch} />
          <Row k="g w" label={t.shortcuts.goWishlist} />
          <Row k="g r" label={t.shortcuts.goRecommend} />
          <Row k="g u" label={t.shortcuts.goUpcoming} />
          <Row k="g q" label={t.shortcuts.goQuotes} />
          <Row k="g y" label={t.shortcuts.goYear} />
          <Row k="g t" label={t.shortcuts.goStats} />
          <Row k="g d" label={t.shortcuts.goData} />
          <Row k="Esc" label={t.shortcuts.close} />
        </ul>
        {isVnPage && (
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
              {t.shortcuts.vnPage}
            </div>
            <ul className="space-y-1.5 text-sm">
              <Row k="f" label={t.shortcuts.vnToggleFavorite} />
              <Row k="e" label={t.shortcuts.vnJumpEdit} />
              <Row k="n" label={t.shortcuts.vnJumpNotes} />
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Row({ k, label }: { k: string; label: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <kbd className="rounded bg-bg-elev px-2 py-0.5 font-mono text-xs">{k}</kbd>
      <span className="text-xs text-muted">{label}</span>
    </li>
  );
}
