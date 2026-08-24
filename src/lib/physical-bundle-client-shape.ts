import type { PhysicalBundle, PhysicalBundleMember } from './db';
import { asJsonRecord } from './json-shape';
import { isValidVnId, normalizeVnId } from './vn-id-shape';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function decodeMember(value: unknown): PhysicalBundleMember | null {
  const row = asJsonRecord(value);
  if (
    !row ||
    typeof row.vn_id !== 'string' ||
    !isValidVnId(row.vn_id) ||
    typeof row.release_id !== 'string' ||
    typeof row.vn_title !== 'string' ||
    !(row.edition_label === null || typeof row.edition_label === 'string') ||
    typeof row.position !== 'number' ||
    !Number.isSafeInteger(row.position) ||
    row.position < 0
  ) return null;
  return {
    vn_id: normalizeVnId(row.vn_id),
    release_id: row.release_id,
    vn_title: row.vn_title,
    edition_label: row.edition_label,
    position: row.position,
  };
}

function decodeBundle(value: unknown): PhysicalBundle | null {
  const row = asJsonRecord(value);
  if (
    !row ||
    !isPositiveInteger(row.id) ||
    typeof row.name !== 'string' ||
    typeof row.anchor_vn_id !== 'string' ||
    !isValidVnId(row.anchor_vn_id) ||
    typeof row.anchor_release_id !== 'string' ||
    !isFiniteNumber(row.created_at) ||
    !isFiniteNumber(row.updated_at) ||
    !Array.isArray(row.members)
  ) return null;
  const members: PhysicalBundleMember[] = [];
  for (const value of row.members) {
    const member = decodeMember(value);
    if (!member) return null;
    members.push(member);
  }
  if (members.length < 2) return null;
  const anchorVnId = normalizeVnId(row.anchor_vn_id);
  if (!members.some((member) => (
    member.vn_id === anchorVnId && member.release_id === row.anchor_release_id
  ))) return null;
  return {
    id: row.id,
    name: row.name,
    anchor_vn_id: anchorVnId,
    anchor_release_id: row.anchor_release_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    members,
  };
}

/** Decode the physical-bundle collection response. */
export function decodePhysicalBundlesResponse(value: unknown): { bundles: PhysicalBundle[] } | null {
  const row = asJsonRecord(value);
  if (!row || !Array.isArray(row.bundles)) return null;
  const bundles: PhysicalBundle[] = [];
  for (const value of row.bundles) {
    const bundle = decodeBundle(value);
    if (!bundle) return null;
    bundles.push(bundle);
  }
  return { bundles };
}

/** Decode one physical-bundle mutation response. */
export function decodePhysicalBundleResponse(value: unknown): { bundle: PhysicalBundle } | null {
  const row = asJsonRecord(value);
  const bundle = decodeBundle(row?.bundle);
  return bundle ? { bundle } : null;
}
