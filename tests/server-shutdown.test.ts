import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installServerShutdownHooks,
  notifyServerShutdown,
  registerServerShutdownHandler,
} from '@/lib/server-shutdown';

describe('server shutdown coordinator', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  it('notifies active handlers and allows them to unregister', () => {
    const first = vi.fn();
    const second = vi.fn();
    const removeFirst = registerServerShutdownHandler(first);
    const removeSecond = registerServerShutdownHandler(second);
    cleanups.push(removeFirst, removeSecond);

    removeFirst();
    notifyServerShutdown();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('installs one signal pair and removes only that installation', () => {
    const listeners = new Map<string, () => void>();
    const target = {
      once(event: 'SIGTERM' | 'SIGINT', listener: () => void): void {
        listeners.set(event, listener);
      },
      removeListener(event: 'SIGTERM' | 'SIGINT', listener: () => void): void {
        if (listeners.get(event) === listener) listeners.delete(event);
      },
    };
    const handler = vi.fn();
    cleanups.push(registerServerShutdownHandler(handler));
    const removeHooks = installServerShutdownHooks(target);
    cleanups.push(removeHooks);

    const duplicateCleanup = installServerShutdownHooks(target);
    duplicateCleanup();
    expect(listeners.size).toBe(2);

    listeners.get('SIGTERM')?.();
    expect(handler).toHaveBeenCalledOnce();

    removeHooks();
    expect(listeners.size).toBe(0);
  });

  it('installs and removes hooks on the process by default', () => {
    const cleanup = installServerShutdownHooks();
    cleanup();
  });
});
