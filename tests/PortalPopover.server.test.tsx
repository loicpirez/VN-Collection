import { createRef } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PortalPopover } from '@/components/PortalPopover';

describe('PortalPopover server rendering', () => {
  it('does not attempt to create a portal without a browser document', () => {
    expect(renderToString(
      <PortalPopover open onClose={vi.fn<() => void>()} triggerRef={createRef<HTMLElement>()} label="Server">
        body
      </PortalPopover>,
    )).toBe('');
  });
});
