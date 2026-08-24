// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ArtworkActionMenu } from '@/components/ArtworkActionMenu';
import { renderWithProviders } from './helpers/render-component';

afterEach(cleanup);

describe('ArtworkActionMenu', () => {
  it('opens a portal surface, preserves upload controls, and closes on an ordinary action', async () => {
    renderWithProviders(
      <ArtworkActionMenu label="Artwork" triggerClassName="artwork-trigger">
        <span>Plain content</span>
        <button type="button" data-menu-keep-open>Upload</button>
        <button type="button">Transform</button>
      </ArtworkActionMenu>,
    );
    const trigger = screen.getByRole('button', { name: 'Artwork' });
    expect(trigger).toHaveClass('artwork-trigger');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Artwork' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(dialog.parentElement).toBe(document.body);
    fireEvent.click(within(dialog).getByText('Plain content'));
    expect(screen.getByRole('dialog', { name: 'Artwork' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));
    expect(screen.getByRole('dialog', { name: 'Artwork' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transform' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Artwork' })).toBeNull());
  });

  it('toggles from the trigger and closes from the sheet header', async () => {
    renderWithProviders(
      <ArtworkActionMenu label="Artwork" triggerClassName="artwork-trigger">
        <button type="button">Action</button>
      </ArtworkActionMenu>,
    );
    const trigger = screen.getByRole('button', { name: 'Artwork' });
    fireEvent.click(trigger);
    let dialog = await screen.findByRole('dialog', { name: 'Artwork' });
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Artwork' })).toBeNull());
    fireEvent.click(trigger);
    dialog = await screen.findByRole('dialog', { name: 'Artwork' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Artwork' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Artwork' })).toBeNull());
  });

  it('closes when the portal requests dismissal from outside input', async () => {
    renderWithProviders(
      <ArtworkActionMenu label="Artwork" triggerClassName="artwork-trigger">
        <button type="button">Action</button>
      </ArtworkActionMenu>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Artwork' }));
    expect(await screen.findByRole('dialog', { name: 'Artwork' })).toBeTruthy();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Artwork' })).toBeNull());
  });
});
