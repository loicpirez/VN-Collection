import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ADD = readFileSync('src/components/AddMissingVnButton.tsx', 'utf8');
const STAFF = readFileSync('src/components/StaffDownloadButton.tsx', 'utf8');
const REFRESH = readFileSync('src/components/RefreshScopeButton.tsx', 'utf8');
const ASSETS = readFileSync('src/components/DownloadAssetsButton.tsx', 'utf8');

describe('reusable action identity lifecycle', () => {
  it('owns add-to-collection work by VN and locks submissions immediately', () => {
    expect(ADD).toContain('const identityRef = useRef<string | null>(vnId)');
    expect(ADD).toContain('const inFlightRef = useRef(false)');
    expect(ADD).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(ADD).toContain('const ownerVnId = vnId');
    expect(ADD).toContain('mutationAbortRef.current !== controller || controller.signal.aborted');
    expect(ADD).toContain('signal: controller.signal');
  });

  it('owns staff downloads by staff identity and locks submissions immediately', () => {
    expect(STAFF).toContain('const identityRef = useRef<string | null>(sid)');
    expect(STAFF).toContain('const inFlightRef = useRef(false)');
    expect(STAFF).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(STAFF).toContain('const ownerSid = sid');
    expect(STAFF).toContain('mutationAbortRef.current !== controller || controller.signal.aborted');
    expect(STAFF).toContain('signal: controller.signal');
  });

  it('reseeds scope refresh state and rejects obsolete tab completions', () => {
    expect(REFRESH).toContain('const identityKey = `${scope}|${JSON.stringify(params ?? {})}`');
    expect(REFRESH).toContain('setRefreshedAt(null)');
    expect(REFRESH).toContain('const ownerIdentity = identityKey');
    expect(REFRESH).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(REFRESH).toContain('mutationAbortRef.current !== controller || controller.signal.aborted');
    expect(REFRESH).toContain('signal: controller.signal');
  });

  it('reseeds VN asset state and rejects obsolete downloads', () => {
    expect(ASSETS).toContain('const identityRef = useRef<string | null>(vnId)');
    expect(ASSETS).toContain('const inFlightRef = useRef(false)');
    expect(ASSETS).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(ASSETS).toContain('const ownerVnId = vnId');
    expect(ASSETS).toContain('mutationAbortRef.current !== controller || controller.signal.aborted');
    expect(ASSETS).toContain('signal: controller.signal');
  });
});
