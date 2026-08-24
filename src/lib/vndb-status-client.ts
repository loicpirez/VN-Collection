const inFlightStatusRequests = new Map<string, Promise<Response>>();

/**
 * Coalesce concurrent reads of one VNDB list entry across client components.
 *
 * @param vnId Canonical VNDB visual novel identifier.
 * @returns An independent response clone for the caller to decode.
 */
export function requestVndbStatus(vnId: string, fresh = false): Promise<Response> {
  const key = `${vnId}:${fresh ? 'fresh' : 'cached'}`;
  let request = inFlightStatusRequests.get(key);
  if (!request) {
    request = fetch(`/api/vn/${vnId}/vndb-status${fresh ? '?fresh=1' : ''}`, { cache: 'no-store' });
    inFlightStatusRequests.set(key, request);
    const release = () => {
      if (inFlightStatusRequests.get(key) === request) inFlightStatusRequests.delete(key);
    };
    void request.then(release, release);
  }
  return request.then((response) => response.clone());
}

/**
 * Forget an unresolved shared read when its owning page identity is discarded.
 *
 * @param vnId Canonical VNDB visual novel identifier.
 * @returns Nothing.
 */
export function clearVndbStatusRequest(vnId: string): void {
  inFlightStatusRequests.delete(`${vnId}:cached`);
  inFlightStatusRequests.delete(`${vnId}:fresh`);
}
