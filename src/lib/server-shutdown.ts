/** Signals handled by the application shutdown coordinator. */
export type ServerShutdownSignal = 'SIGTERM' | 'SIGINT';

/** Process-like signal surface used by the shutdown coordinator. */
export interface ServerShutdownSignalTarget {
  /** Register a one-shot signal listener. */
  once(event: ServerShutdownSignal, listener: () => void): void;
  /** Remove a previously registered signal listener. */
  removeListener(event: ServerShutdownSignal, listener: () => void): void;
}

/** Synchronous cleanup invoked as soon as server shutdown begins. */
export type ServerShutdownHandler = () => void;

interface ServerShutdownState {
  handlers: Set<ServerShutdownHandler>;
  hooksInstalled: boolean;
}

declare global {
  var __vnCollectionServerShutdownState: ServerShutdownState | undefined;
}

function shutdownState(): ServerShutdownState {
  globalThis.__vnCollectionServerShutdownState ??= {
    handlers: new Set<ServerShutdownHandler>(),
    hooksInstalled: false,
  };
  return globalThis.__vnCollectionServerShutdownState;
}

/**
 * Register cleanup that must release long-lived work before Next.js can close
 * its HTTP server.
 *
 * @param handler Cleanup callback that must start synchronously.
 * @returns A function that removes the callback.
 */
export function registerServerShutdownHandler(handler: ServerShutdownHandler): () => void {
  const state = shutdownState();
  state.handlers.add(handler);
  return () => state.handlers.delete(handler);
}

/** Notify every active server resource that shutdown has begun. */
export function notifyServerShutdown(): void {
  for (const handler of [...shutdownState().handlers]) handler();
}

/**
 * Install one process-level listener per termination signal.
 *
 * Next.js keeps ownership of HTTP draining and the final process exit. These
 * listeners only release application resources that would otherwise keep
 * `server.close()` pending indefinitely.
 *
 * @param target Process-like signal target, injectable for deterministic tests.
 * @returns A cleanup function for this installation.
 */
export function installServerShutdownHooks(
  target: ServerShutdownSignalTarget = process,
): () => void {
  const state = shutdownState();
  if (state.hooksInstalled) return () => {};
  state.hooksInstalled = true;
  const shutdown = (): void => notifyServerShutdown();
  target.once('SIGTERM', shutdown);
  target.once('SIGINT', shutdown);
  return () => {
    target.removeListener('SIGTERM', shutdown);
    target.removeListener('SIGINT', shutdown);
    state.hooksInstalled = false;
  };
}
