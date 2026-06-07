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
    expect(LOGO).toContain("inputRef.current!.value = ''");
    expect(LOGO).toContain('interface ProducerMutationOptions');
    expect(LOGO).toContain('async function runMutation(options: ProducerMutationOptions)');
    expect(LOGO.match(/const ownerProducerId = producerId/g)).toHaveLength(1);
    expect(LOGO.match(/if \(!ownsMutation\(ownerProducerId, controller\)\) return/g)).toHaveLength(2);
    expect(LOGO.match(/finishMutation\(controller\)/g)).toHaveLength(1);
    expect(LOGO).toContain('request: (ownerProducerId, controller) =>');
    expect(LOGO).toContain('clearInfo: true');
    expect(LOGO).toContain('signal: controller.signal');
    expect(LOGO).toContain('identityRef.current = null');
  });
});
