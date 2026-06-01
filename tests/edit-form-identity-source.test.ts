import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const EDIT_FORM = readFileSync('src/components/EditForm.tsx', 'utf8');

describe('VN edit-form identity lifecycle', () => {
  it('reconstructs every editable field from one complete VN seed', () => {
    expect(EDIT_FORM).toContain('interface FormSeed');
    expect(EDIT_FORM).toContain('function formSeed(vn: CollectionItem): FormSeed');
    for (const setter of [
      'setStatus(next.status)',
      'setUserRating(next.userRating)',
      'setPlaytime(next.playtime)',
      'setStarted(next.started)',
      'setFinished(next.finished)',
      'setNotes(next.notes)',
      'setFavorite(next.favorite)',
      'setLocation(next.location)',
      'setEditionType(next.editionType)',
      'setEditionLabel(next.editionLabel)',
      'setPhysicalLocations(next.physicalLocations)',
      'setBoxType(next.boxType)',
      'setDownloadUrl(next.downloadUrl)',
      'setDumped(next.dumped)',
    ]) {
      expect(EDIT_FORM, setter).toContain(setter);
    }
  });

  it('suppresses the transitional autosave render but flushes the preceding VN draft', () => {
    expect(EDIT_FORM).toContain('const skipAutoSaveRef = useRef(false)');
    expect(EDIT_FORM).toContain('skipAutoSaveRef.current = true');
    expect(EDIT_FORM).toContain('if (skipAutoSaveRef.current)');
    expect(EDIT_FORM).toContain('pendingCommitRef.current?.()');
    expect(EDIT_FORM).toContain('}, [vn.id])');
  });

  it('rejects completion work after the form owner changes or unmounts', () => {
    expect(EDIT_FORM).toContain('const identityRef = useRef<string | null>(vn.id)');
    expect(EDIT_FORM).toContain('identityRef.current = null');
    expect(EDIT_FORM).toContain('if (identityRef.current !== ownerVnId) return');
    expect(EDIT_FORM).toContain('if (identityRef.current === ownerVnId) toast.success');
    expect(EDIT_FORM).toContain('!unmountedRef.current && identityRef.current === ownerVnId');
  });
});
