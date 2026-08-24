import 'server-only';

let activeRefresh: Promise<void> | null = null;

/**
 * Start one automatic VNDB cache refresh when the background lane is idle.
 * Explicit user-triggered downloads do not use this lane. Keeping the lane
 * single-flight prevents navigation across several stale detail pages from
 * filling the global VNDB throttle queue with work the user did not request.
 *
 * @param task Refresh operation to run without blocking the current response.
 * @returns `true` when the task was accepted, otherwise `false` while another
 * background refresh is still active.
 */
export function scheduleVndbBackgroundRefresh(task: () => Promise<void>): boolean {
  if (activeRefresh) return false;

  const request = Promise.resolve().then(task);
  const tracked = request
    .catch(() => undefined)
    .finally(() => {
      if (activeRefresh === tracked) activeRefresh = null;
    });
  activeRefresh = tracked;
  return true;
}
