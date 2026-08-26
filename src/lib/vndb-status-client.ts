interface SharedStatusRequest {
  key: string;
  controller: AbortController;
  promise: Promise<Response>;
  consumers: Set<symbol>;
}

const inFlightStatusRequests = new Map<string, SharedStatusRequest>();

function statusAbortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted', 'AbortError');
}

function subscribeToStatusRequest(entry: SharedStatusRequest, signal?: AbortSignal): Promise<Response> {
  if (signal?.aborted) return Promise.reject(statusAbortReason(signal));
  const consumer = Symbol(entry.key);
  entry.consumers.add(consumer);
  return new Promise<Response>((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal?.removeEventListener('abort', onCallerAbort);
      entry.controller.signal.removeEventListener('abort', onSharedAbort);
      entry.consumers.delete(consumer);
      if (entry.consumers.size === 0 && inFlightStatusRequests.get(entry.key) === entry) {
        inFlightStatusRequests.delete(entry.key);
        entry.controller.abort();
      }
    };
    const onCallerAbort = () => {
      release();
      if (signal) reject(statusAbortReason(signal));
    };
    const onSharedAbort = () => {
      if (released) return;
      release();
      reject(statusAbortReason(entry.controller.signal));
    };
    signal?.addEventListener('abort', onCallerAbort, { once: true });
    entry.controller.signal.addEventListener('abort', onSharedAbort, { once: true });
    entry.promise.then(
      (response) => {
        release();
        resolve(response.clone());
      },
      (error: unknown) => {
        release();
        reject(error);
      },
    );
  });
}

/**
 * Coalesce concurrent reads of one VNDB list entry across client components.
 *
 * @param vnId Canonical VNDB visual novel identifier.
 * @returns An independent response clone for the caller to decode.
 */
export function requestVndbStatus(vnId: string, fresh = false, signal?: AbortSignal): Promise<Response> {
  const key = `${vnId}:${fresh ? 'fresh' : 'cached'}`;
  let request = inFlightStatusRequests.get(key);
  if (!request) {
    const controller = new AbortController();
    const promise = fetch(`/api/vn/${vnId}/vndb-status${fresh ? '?fresh=1' : ''}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    request = { key, controller, promise, consumers: new Set() };
    inFlightStatusRequests.set(key, request);
    const release = () => {
      if (inFlightStatusRequests.get(key) === request) inFlightStatusRequests.delete(key);
    };
    void promise.then(release, release);
  }
  return subscribeToStatusRequest(request, signal);
}

/**
 * Forget an unresolved shared read when its owning page identity is discarded.
 *
 * @param vnId Canonical VNDB visual novel identifier.
 * @returns Nothing.
 */
export function clearVndbStatusRequest(vnId: string): void {
  for (const suffix of ['cached', 'fresh'] as const) {
    const key = `${vnId}:${suffix}`;
    const request = inFlightStatusRequests.get(key);
    if (!request) continue;
    inFlightStatusRequests.delete(key);
    request.controller.abort();
  }
}
