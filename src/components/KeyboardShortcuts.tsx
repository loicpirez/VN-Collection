'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Keyboard, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import {
  globalShortcutRows,
  pageShortcutSections,
  routeForShortcutKey,
  routeShortcutRows,
} from '@/lib/shortcut-registry';
import { Dialog } from './Dialog';

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
 * Page-specific shortcuts (active only on the matching route):
 *
 *   /vn/* :
 *     f → click [data-shortcut="vn-favorite"]
 *     e → scroll to #section-edit-form
 *     n → scroll to #section-notes
 *
 *   / (library home) :
 *     f → toggle advanced filter drawer
 *
 *   /tags :
 *     1 → switch to local tab
 *     2 → switch to VNDB tab
 */
export function KeyboardShortcuts() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [help, setHelp] = useState(false);

  const isVnPage = pathname.startsWith('/vn/');
  const isLibrary = pathname === '/';
  const isTagsPage = pathname === '/tags' || pathname.startsWith('/tags?');
  const year = new Date().getFullYear();
  const globalRows = globalShortcutRows(t);
  const routeRows = routeShortcutRows(t, year);
  const visibleSectionLabels = new Set([
    ...(isVnPage ? [t.shortcuts.vnPage] : []),
    ...(isLibrary ? [t.shortcuts.libPage] : []),
    ...(isTagsPage ? [t.shortcuts.tagsPage] : []),
  ]);
  const scopedSections = pageShortcutSections(t).filter((section) => visibleSectionLabels.has(section.label));

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    function inEditable(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable) return true;
      return false;
    }

    function scrollToAnchor(id: string) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function clickShortcut(selector: string) {
      document.querySelector<HTMLButtonElement>(`[data-shortcut="${selector}"]`)?.click();
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
          clickShortcut('vn-favorite');
          return;
        }
        if (e.key === 'e') {
          e.preventDefault();
          scrollToAnchor('section-edit-form');
          return;
        }
        if (e.key === 'n') {
          e.preventDefault();
          scrollToAnchor('section-notes');
          return;
        }
      }

      if (isLibrary) {
        if (e.key === 'f') {
          e.preventDefault();
          clickShortcut('lib-filter');
          return;
        }
      }

      if (isTagsPage) {
        if (e.key === '1') {
          e.preventDefault();
          clickShortcut('tags-tab-local');
          return;
        }
        if (e.key === '2') {
          e.preventDefault();
          clickShortcut('tags-tab-vndb');
          return;
        }
      }

      if (timer) {
        clearTimeout(timer);
        timer = null;
        const route = routeForShortcutKey(e.key, new Date().getFullYear());
        if (route) {
          e.preventDefault();
          router.push(route);
        }
        return;
      }
      if (e.key === 'g') {
        timer = setTimeout(() => { timer = null; }, 1200);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (timer) clearTimeout(timer);
    };
  }, [help, router, isVnPage, isLibrary, isTagsPage]);

  return (
    <Dialog
      open={help}
      onClose={() => setHelp(false)}
      panelClassName="w-[min(92vw,480px)] max-h-[85vh] overflow-y-auto p-4 sm:p-6"
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
          {globalRows.map((row) => <Row key={row.key} k={row.key} label={row.label} />)}
        </ul>
        <PageSection label="g">
          {routeRows.map((row) => <Row key={row.key} k={row.key} label={row.label} />)}
        </PageSection>
        {scopedSections.map((section) => (
          <PageSection key={section.label} label={section.label}>
            {section.rows.map((row) => <Row key={row.key} k={row.key} label={row.label} />)}
          </PageSection>
        ))}
      </div>
    </Dialog>
  );
}

function PageSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
        {label}
      </div>
      <ul className="space-y-1.5 text-sm">{children}</ul>
    </div>
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
