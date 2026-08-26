/** Maximum wall-clock time for an automatically loaded interactive upstream panel. */
export const INTERACTIVE_UPSTREAM_TIMEOUT_MS = 10_000;

/** Signal and cleanup handle for one bounded interactive request. */
export interface RequestDeadline {
  signal: AbortSignal;
  dispose: () => void;
}

/**
 * Combine a caller cancellation signal with a retained wall-clock deadline.
 *
 * @param parent Signal owned by the incoming browser request.
 * @param timeoutMs Maximum queue plus network duration.
 * @returns A combined signal and a cleanup function for the deadline timer.
 */
export function createRequestDeadline(
  parent: AbortSignal,
  timeoutMs = INTERACTIVE_UPSTREAM_TIMEOUT_MS,
): RequestDeadline {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('Interactive upstream request timed out', 'TimeoutError'));
  }, timeoutMs);
  return {
    signal: AbortSignal.any([parent, controller.signal]),
    dispose: () => clearTimeout(timer),
  };
}
