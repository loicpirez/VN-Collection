import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const META = readFileSync('src/components/ListMetaEditor.tsx', 'utf8');
const CARD = readFileSync('src/components/ListCardActions.tsx', 'utf8');
const CREATE = readFileSync('src/components/CreateListForm.tsx', 'utf8');
const ADD = readFileSync('src/components/ListAddVnForm.tsx', 'utf8');
const REMOVE = readFileSync('src/components/ListRemoveVn.tsx', 'utf8');

describe('list management mutation lifecycle', () => {
  it('reseeds list metadata and aborts obsolete metadata mutations', () => {
    expect(META).toContain('const identityRef = useRef<number | null>(list.id)');
    expect(META).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(META).toContain('const mutationInFlightRef = useRef(false)');
    expect(META).toContain('setName(list.name)');
    expect(META).toContain("setDescription(list.description ?? '')");
    expect(META).toContain('setColor(list.color)');
    expect(META).toContain('const controller = startMutation()');
    expect(META).toContain('signal: controller.signal');
    expect(META).toContain('if (!ownsMutation(ownerListId, controller) || !ok) return');
    expect(META).toContain('identityRef.current = null');
    expect(META).toContain('mutationAbortRef.current?.abort()');
    expect(META).toContain('<Pencil className="h-4 w-4" aria-hidden />');
  });

  it('locks list-card prompts before awaiting and aborts obsolete menu mutations', () => {
    expect(CARD).toContain('const identityRef = useRef<number | null>(list.id)');
    expect(CARD).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(CARD).toContain('const mutationInFlightRef = useRef(false)');
    expect(CARD).toContain('const ownerListId = list.id');
    expect(CARD).toContain('const controller = startMutation()');
    expect(CARD).toContain('signal: controller.signal');
    expect(CARD).toContain('if (!ownsMutation(ownerListId, controller) || !ok) return');
    expect(CARD).toContain('disabled={busy}');
    expect(CARD).toContain('identityRef.current = null');
    expect(CARD).toContain('mutationAbortRef.current?.abort()');
    expect(CARD).toContain('<MoreVertical className="h-4 w-4" aria-hidden />');
  });

  it('serializes list creation and suppresses late completion after teardown', () => {
    expect(CREATE).toContain('const mountedRef = useRef(true)');
    expect(CREATE).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(CREATE).toContain('const inFlightRef = useRef(false)');
    expect(CREATE).toContain('if (!trimmed || inFlightRef.current) return');
    expect(CREATE).toContain('signal: controller.signal');
    expect(CREATE).toContain('mutationAbortRef.current?.abort()');
    expect(CREATE).toContain('<Plus className="h-4 w-4" aria-hidden />');
  });

  it('reseeds add drafts and aborts obsolete membership writes', () => {
    expect(ADD).toContain('const identityRef = useRef<number | null>(listId)');
    expect(ADD).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(ADD).toContain('const inFlightRef = useRef(false)');
    expect(ADD).toContain('const ownerListId = listId');
    expect(ADD).toContain('signal: controller.signal');
    expect(ADD).toContain('mutationAbortRef.current?.abort()');
    expect(ADD).toContain('<Plus className="h-4 w-4" aria-hidden />');
    expect(REMOVE).toContain('const ownerKey = `${listId}|${vnId}`');
    expect(REMOVE).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(REMOVE).toContain('const inFlightRef = useRef(false)');
    expect(REMOVE).toContain('signal: controller.signal');
    expect(REMOVE).toContain('mutationAbortRef.current?.abort()');
    expect(REMOVE).toContain('identityRef.current = null');
    expect(REMOVE).toContain('<X className="h-4 w-4" aria-hidden />');
  });
});
