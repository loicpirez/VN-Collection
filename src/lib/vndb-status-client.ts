const inFlightStatusRequests = new Map<string, Promise<Response>>();

/**
 * Coalesce concurrent reads of one VNDB list entry across client components.
 *
 * @param vnId Canonical VNDB visual novel identifier.
 * @returns An independent response clone for the caller to decode.
 */
export function requestVndbStatus(vnId: string): Promise<Response> {
  let request = inFlightStatusRequests.get(vnId);
  if (!request) {
    request = fetch(`/api/vn/${vnId}/vndb-status`, { cache: 'no-store' });
    inFlightStatusRequests.set(vnId, request);
    const release = () => {
      if (inFlightStatusRequests.get(vnId) === request) inFlightStatusRequests.delete(vnId);
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
  inFlightStatusRequests.delete(vnId);
}
