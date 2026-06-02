import 'server-only';
import type { DownloadJob } from './download-status';
import {
  batchGetCharNames,
  batchGetProducerNames,
  batchGetStaffNames,
  batchGetVnTitles,
} from './db';
import { STOCK_PROVIDER_LABELS, type StockProviderId } from './stock-provider-constants';
import { isVndbVnId } from './vn-id-shape';

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
      if (isVndbVnId(ci)) vnIds.add(ci);
      else if (/^p\d+$/.test(ci)) producerIds.add(ci);
      else if (/^s\d+$/.test(ci)) staffIds.add(ci);
      else if (/^c\d+$/.test(ci)) charIds.add(ci);
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
      if (isVndbVnId(ci)) current_item_name = vnTitles.get(ci) ?? null;
      else if (/^p\d+$/.test(ci)) current_item_name = producerNames.get(ci) ?? null;
      else if (/^s\d+$/.test(ci)) current_item_name = staffNames.get(ci) ?? null;
      else if (/^c\d+$/.test(ci)) current_item_name = charNames.get(ci) ?? null;
      else if (ci in STOCK_PROVIDER_LABELS) current_item_name = STOCK_PROVIDER_LABELS[ci as StockProviderId];
    }
    return {
      ...j,
      vn_title: j.vn_id ? (vnTitles.get(j.vn_id) ?? null) : null,
      current_item_name,
    };
  });
}
