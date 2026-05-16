export const ASPECT_KEYS = ['4:3', '16:9', '16:10', '21:9', 'other', 'unknown'] as const;
export type AspectKey = (typeof ASPECT_KEYS)[number];

export interface ResolutionValue {
  width: number;
  height: number;
}

function close(a: number, b: number, tolerance = 0.035): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function aspectKeyForResolution(width: number, height: number): AspectKey {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'unknown';
  }
  const ratio = width / height;
  if (close(ratio, 4 / 3)) return '4:3';
  if (close(ratio, 16 / 9)) return '16:9';
  if (close(ratio, 16 / 10)) return '16:10';
  if (close(ratio, 21 / 9, 0.06)) return '21:9';
  return 'other';
}

export function parseResolutionValue(value: unknown): ResolutionValue | null {
  if (Array.isArray(value) && value.length >= 2) {
    const [w, h] = value;
    return typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0
      ? { width: Math.round(w), height: Math.round(h) }
      : null;
  }
  if (typeof value === 'string') {
    const match = value.match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
  }
  return null;
}

export function isAspectKey(value: unknown): value is AspectKey {
  return typeof value === 'string' && (ASPECT_KEYS as readonly string[]).includes(value);
}

