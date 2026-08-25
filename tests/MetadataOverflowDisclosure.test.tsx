// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MetadataOverflowDisclosure } from '@/components/MetadataOverflowDisclosure';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const t = dictionaries.en;

afterEach(cleanup);

describe('MetadataOverflowDisclosure', () => {
  it('reveals complete language links and closes after navigation', async () => {
    renderWithProviders(
      <MetadataOverflowDisclosure
        items={[
          { key: 'aa', label: 'Language A', displayLabel: 'AA', href: '/search?langs=aa' },
          { key: 'bb', label: 'Language B', displayLabel: 'BB', href: '/search?langs=bb' },
        ]}
        moreLabel="+2"
        label={t.detail.languages}
        closeLabel={t.common.close}
        variant="language"
      />,
    );
    const trigger = screen.getByRole('button', { name: '+2: Language A, Language B' });
    expect(trigger).toHaveAttribute('title', 'Language A, Language B');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: `${t.detail.languages}: +2` });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByRole('link', { name: 'Language A' })).toHaveAttribute('href', '/search?langs=aa');
    const second = within(dialog).getByRole('link', { name: 'Language B' });
    second.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(second);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('renders linked and text-only publishers with complete names', async () => {
    renderWithProviders(
      <MetadataOverflowDisclosure
        items={[
          { key: 'linked', label: 'Publisher A', href: '/producer/p90001' },
          { key: 'plain', label: 'Publisher B' },
        ]}
        moreLabel="+2"
        label={t.detail.publishers}
        closeLabel={t.common.close}
        variant="publisher"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+2: Publisher A, Publisher B' }));
    const dialog = await screen.findByRole('dialog', { name: `${t.detail.publishers}: +2` });
    expect(within(dialog).getByRole('link', { name: 'Publisher A' })).toHaveAttribute('href', '/producer/p90001');
    expect(within(dialog).getByText('Publisher B')).toHaveAttribute('title', 'Publisher B');
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.close }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('supports trigger toggling and outside dismissal', async () => {
    renderWithProviders(
      <MetadataOverflowDisclosure
        items={[{ key: 'one', label: 'Publisher C' }]}
        moreLabel="+1"
        label={t.detail.publishers}
        closeLabel={t.common.close}
        variant="publisher"
      />,
    );
    const trigger = screen.getByRole('button', { name: '+1: Publisher C' });
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
