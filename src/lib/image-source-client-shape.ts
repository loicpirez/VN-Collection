import { asJsonRecord } from './json-shape';

const MAX_IMAGE_PATH_LENGTH = 4096;
const MAX_CANDIDATES = 16;

/** EGS cover source rendered by the cover picker. */
export interface EgsCoverCandidate {
  source: 'banner' | 'vndb' | 'image_php' | 'surugaya' | 'dmm' | 'dlsite' | 'gyutto';
  url: string;
  label: string;
}

function isImagePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_IMAGE_PATH_LENGTH;
}

function isCoverCandidateSource(value: unknown): value is EgsCoverCandidate['source'] {
  return value === 'banner' || value === 'vndb' || value === 'image_php' || value === 'surugaya' || value === 'dmm' || value === 'dlsite' || value === 'gyutto';
}

function isCandidateUrl(value: unknown): value is string {
  return isImagePath(value) && (/^https?:\/\//i.test(value) || value.startsWith('/api/files/'));
}

function decodeMutationPath(value: unknown, field: 'cover' | 'banner'): string | null {
  const path = asJsonRecord(value)?.[field];
  return isImagePath(path) ? path : null;
}

/**
 * Decode the uploaded cover storage path returned by the cover route.
 *
 * @param value Parsed local API payload.
 * @returns Safe storage path, or `null` for malformed input.
 */
export function decodeUploadedCoverPath(value: unknown): string | null {
  return decodeMutationPath(value, 'cover');
}

/**
 * Decode the uploaded banner storage path returned by the banner route.
 *
 * @param value Parsed local API payload.
 * @returns Safe storage path, or `null` for malformed input.
 */
export function decodeUploadedBannerPath(value: unknown): string | null {
  return decodeMutationPath(value, 'banner');
}

/**
 * Decode every EGS cover candidate before rendering image tiles.
 *
 * @param value Parsed local API payload.
 * @returns Safe candidate rows, or `null` for malformed input.
 */
export function decodeEgsCoverCandidates(value: unknown): EgsCoverCandidate[] | null {
  const candidates = asJsonRecord(value)?.candidates;
  if (!Array.isArray(candidates) || candidates.length > MAX_CANDIDATES) return null;
  const seen = new Set<EgsCoverCandidate['source']>();
  const out: EgsCoverCandidate[] = [];
  for (const candidate of candidates) {
    const record = asJsonRecord(candidate);
    if (
      !record ||
      !isCoverCandidateSource(record.source) ||
      seen.has(record.source) ||
      !isCandidateUrl(record.url) ||
      typeof record.label !== 'string' ||
      record.label.length === 0 ||
      record.label.length > 100
    ) {
      return null;
    }
    seen.add(record.source);
    out.push({
      source: record.source,
      url: record.url,
      label: record.label,
    });
  }
  return out;
}
