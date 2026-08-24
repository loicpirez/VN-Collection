// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PlatformOverflowDisclosure } from '@/components/PlatformOverflowDisclosure';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const t = dictionaries.fr;
const items = [
  { code: 'ps5', label: 'PlayStation 5' },
  { code: 'pc fx', label: 'PC-FX' },
];

afterEach(cleanup);

describe('PlatformOverflowDisclosure', () => {
  it('opens a labelled portal with complete filter links and closes after navigation', async () => {
    renderWithProviders(
      <PlatformOverflowDisclosure items={items} moreLabel="+2" label={t.detail.platforms} closeLabel={t.common.close} />,
    );
    const trigger = screen.getByRole('button', { name: '+2: PlayStation 5, PC-FX' });
    expect(trigger).toHaveAttribute('title', 'PlayStation 5, PC-FX');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveClass('min-h-[44px]', 'sm:min-h-[28px]');
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: `${t.detail.platforms}: +2` });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(dialog.parentElement).toBe(document.body);
    expect(within(dialog).getByRole('link', { name: 'PlayStation 5 (ps5)' })).toHaveAttribute('href', '/search?platforms=ps5');
    const encoded = within(dialog).getByRole('link', { name: 'PC-FX (pc fx)' });
    expect(encoded).toHaveAttribute('href', '/search?platforms=pc%20fx');
    encoded.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(encoded);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: `${t.detail.platforms}: +2` })).toBeNull());
  });

  it('toggles from the trigger and supports explicit mobile dismissal', async () => {
    renderWithProviders(
      <PlatformOverflowDisclosure items={items} moreLabel="+2" label={t.detail.platforms} closeLabel={t.common.close} />,
    );
    const trigger = screen.getByRole('button', { name: '+2: PlayStation 5, PC-FX' });
    fireEvent.click(trigger);
    let dialog = await screen.findByRole('dialog', { name: `${t.detail.platforms}: +2` });
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(trigger);
    dialog = await screen.findByRole('dialog', { name: `${t.detail.platforms}: +2` });
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.close }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes when the shared popover requests outside dismissal', async () => {
    renderWithProviders(
      <PlatformOverflowDisclosure items={items} moreLabel="+2" label={t.detail.platforms} closeLabel={t.common.close} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+2: PlayStation 5, PC-FX' }));
    expect(await screen.findByRole('dialog', { name: `${t.detail.platforms}: +2` })).toBeTruthy();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
