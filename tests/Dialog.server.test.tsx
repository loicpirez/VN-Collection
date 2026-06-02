import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Dialog, DialogPortal } from '@/components/Dialog';

describe('Dialog server rendering', () => {
  it('does not create portals without a browser document', () => {
    expect(renderToString(<Dialog open onClose={vi.fn()} title="Title">Body</Dialog>)).toBe('');
    expect(renderToString(<DialogPortal>Body</DialogPortal>)).toBe('');
  });
});
