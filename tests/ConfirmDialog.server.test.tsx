import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConfirmProvider } from '@/components/ConfirmDialog';

describe('ConfirmProvider server rendering', () => {
  it('renders children without attempting to create a portal', () => {
    expect(renderToString(
      <ConfirmProvider>
        <span>body</span>
      </ConfirmProvider>,
    )).toBe('<span>body</span>');
  });
});
