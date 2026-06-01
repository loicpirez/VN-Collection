import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const REFRESH = readFileSync('src/components/ProducerRefreshButton.tsx', 'utf8');
const LOGO = readFileSync('src/components/ProducerLogoUpload.tsx', 'utf8');

describe('producer detail identity lifecycle', () => {
  it('rejects obsolete producer refresh completion work', () => {
    expect(REFRESH).toContain('const identityRef = useRef<string | null>(producerId)');
    expect(REFRESH).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(REFRESH).toContain('const inFlightRef = useRef(false)');
    expect(REFRESH).toContain('const ownerProducerId = producerId');
    expect(REFRESH).toContain('mutationAbortRef.current !== controller || controller.signal.aborted');
    expect(REFRESH).toContain('signal: controller.signal');
    expect(REFRESH).toContain('`${message} / ${t.producerVns.staleSuffix}`');
    expect(REFRESH).toContain('identityRef.current = null');
  });

  it('resets producer logo state and owns every logo-side request', () => {
    expect(LOGO).toContain('const identityRef = useRef<string | null>(producerId)');
    expect(LOGO).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(LOGO).toContain('const mutationInFlightRef = useRef(false)');
    expect(LOGO).toContain('setError(null)');
    expect(LOGO).toContain('setInfo(null)');
    expect(LOGO).toContain('if (inputRef.current) inputRef.current.value =');
    expect(LOGO.match(/const ownerProducerId = producerId/g)).toHaveLength(3);
    expect(LOGO.match(/if \(!ownsMutation\(ownerProducerId, controller\)\) return/g)?.length).toBeGreaterThanOrEqual(3);
    expect(LOGO.match(/finishMutation\(ownerProducerId, controller\)/g)).toHaveLength(3);
    expect(LOGO).toContain('signal: controller.signal');
    expect(LOGO).toContain('identityRef.current = null');
  });
});
