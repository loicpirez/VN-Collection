import 'server-only';
import type { DownloadJob } from './download-status';
import {
  batchGetCharNames,
  batchGetProducerNames,
  batchGetStaffNames,
  batchGetVnTitles,
} from './db';

export interface EnrichedJob extends DownloadJob {
  vn_title: string | null;
  current_item_name: string | null;
}

/**
 * Annotates each job with human-readable names for its `vn_id` and
 * `current_item` so the DownloadStatusBar can render links and labels
 * instead of raw VNDB IDs.
 *
 * Supported ID prefixes:
 *   v → vn title   p → producer name   s → staff name   c → character name
 * Everything else (tag ids, trait ids, free-text labels) is left as-is
 * because those entities either lack a dedicated local table or the
 * id is not a VNDB entity reference.
 */
export function enrichJobs(jobs: DownloadJob[]): EnrichedJob[] {
  const vnIds = new Set<string>();
  const producerIds = new Set<string>();
  const staffIds = new Set<string>();
  const charIds = new Set<string>();

  for (const j of jobs) {
    if (j.vn_id) vnIds.add(j.vn_id);
    const ci = j.current_item;
    if (ci) {
      if (ci.startsWith('v')) vnIds.add(ci);
      else if (ci.startsWith('p')) producerIds.add(ci);
      else if (ci.startsWith('s')) staffIds.add(ci);
      else if (ci.startsWith('c')) charIds.add(ci);
    }
  }

  const vnTitles = batchGetVnTitles([...vnIds]);
  const producerNames = batchGetProducerNames([...producerIds]);
  const staffNames = batchGetStaffNames([...staffIds]);
  const charNames = batchGetCharNames([...charIds]);

  return jobs.map((j) => {
    const ci = j.current_item ?? null;
    let current_item_name: string | null = null;
    if (ci) {
      if (ci.startsWith('v')) current_item_name = vnTitles.get(ci) ?? null;
      else if (ci.startsWith('p')) current_item_name = producerNames.get(ci) ?? null;
      else if (ci.startsWith('s')) current_item_name = staffNames.get(ci) ?? null;
      else if (ci.startsWith('c')) current_item_name = charNames.get(ci) ?? null;
    }
    return {
      ...j,
      vn_title: j.vn_id ? (vnTitles.get(j.vn_id) ?? null) : null,
      current_item_name,
    };
  });
}
