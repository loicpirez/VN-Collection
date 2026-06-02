// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from './helpers/render-component';
import { DateInput } from '@/components/DateInput';

describe('component-test harness', () => {
  it('renders a client component through the shared providers', () => {
    const { container } = renderWithProviders(
      <DateInput value="2024-03-15" onChange={vi.fn()} ariaLabel="Release date" />,
    );
    expect(container.querySelector('button')).not.toBeNull();
  });
});
