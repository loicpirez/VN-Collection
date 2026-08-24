function normalizeHost(raw: string | null | undefined): string {
  if (!raw) return '';
  const head = raw.split(',')[0]!;
  const first = head.trim();
  if (!first) return '';
  if (first.startsWith('[')) {
    const end = first.indexOf(']');
    return (end >= 0 ? first.slice(1, end) : first.slice(1)).toLowerCase();
  }
  const hostname = first.split(':')[0]!;
  return hostname.toLowerCase();
}

function isLoopbackHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.startsWith('127.')
  );
}

export interface PublicReadWarningInput {
  host: string | null | undefined;
  forwardedHost?: string | null | undefined;
  readsProtected?: boolean;
}

export function shouldShowPublicReadWarning({
  host,
  forwardedHost,
  readsProtected = false,
}: PublicReadWarningInput): boolean {
  if (readsProtected) return false;
  const candidates = [normalizeHost(host), normalizeHost(forwardedHost)].filter((candidate) => candidate.length > 0);
  if (candidates.length === 0) return false;
  return candidates.some((candidate) => !isLoopbackHost(candidate));
}
