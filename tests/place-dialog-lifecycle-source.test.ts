import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const BROWSER = readFileSync('src/components/PlaceBrowser.tsx', 'utf8');
const ASSIGN = readFileSync('src/components/AssignProviderDialog.tsx', 'utf8');
const EDIT = readFileSync('src/components/AddEditPlaceModal.tsx', 'utf8');

describe('place dialog lifecycle', () => {
  it('owns registry reloads and branch linking', () => {
    expect(BROWSER).toContain('const reloadAbortRef = useRef<AbortController | null>(null)');
    expect(BROWSER).toContain('const assignBranchLinkAbortRef = useRef<AbortController | null>(null)');
    expect(BROWSER).toContain('reloadAbortRef.current?.abort()');
    expect(BROWSER).toContain('assignBranchLinkAbortRef.current?.abort()');
    expect(BROWSER).toContain('assignBranchLinkAbortRef.current !== controller');
    expect(BROWSER).toContain('reloadAbortRef.current !== controller');
    expect(BROWSER).toContain('signal: controller.signal');
    expect(BROWSER).toContain('const ownerBranch = assignBranchTarget');
    expect(BROWSER).toContain('assignBranchTargetRef.current !== ownerBranch');
    expect(BROWSER).toContain('JSON.stringify({ provider_label: ownerBranch })');
  });

  it('owns assignment hydration and mutation completion by place', () => {
    expect(ASSIGN).toContain('const placeIdentityRef = useRef<number | null>(place.id)');
    expect(ASSIGN).toContain('const refreshAbortRef = useRef<AbortController | null>(null)');
    expect(ASSIGN).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(ASSIGN).toContain('const mutationRef = useRef(false)');
    expect(ASSIGN).toContain('refreshAbortRef.current !== controller');
    expect(ASSIGN).toContain('if (mutationRef.current) return');
    expect(ASSIGN).toContain('mutationAbortRef.current?.abort()');
    expect(ASSIGN).toContain('mutationAbortRef.current !== controller');
    expect(ASSIGN).toContain('signal: controller.signal');
    expect(ASSIGN).toContain('if (!ok || !ownsMutation(ownerId, controller)) return');
  });

  it('reserves provider moves before awaiting confirmation', () => {
    const moveStart = ASSIGN.indexOf('async function moveFromOther(branch: OtherPlaceBranch)');
    const body = ASSIGN.slice(moveStart);
    expect(body.indexOf('const controller = beginMutation()')).toBeLessThan(body.indexOf('await confirm('));
  });

  it('reseeds edit drafts and owns save and geocoding completion', () => {
    expect(EDIT).toContain("const identity = `${place?.id ?? 'new'}|${initialBranch ?? ''}`");
    expect(EDIT).toContain('const saveInFlightRef = useRef(false)');
    expect(EDIT).toContain('const saveAbortRef = useRef<AbortController | null>(null)');
    expect(EDIT).toContain('setName(initial.name)');
    expect(EDIT).toContain('if (saveInFlightRef.current) return');
    expect(EDIT).toContain('saveAbortRef.current?.abort()');
    expect(EDIT).toContain('saveAbortRef.current !== controller');
    expect(EDIT).toContain('signal: controller.signal');
    expect(EDIT).toContain('readApiError(res, t.common.error as string)');
    expect(EDIT).toContain('identityRef.current !== ownerIdentity');
    expect(EDIT).toContain('geocodeControllerRef.current !== controller');
  });
});
