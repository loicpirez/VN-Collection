import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PANEL = readFileSync('src/components/VndbStatusPanel.tsx', 'utf8');

describe('VNDB status mutation lifecycle', () => {
  it('serializes label and clear-all mutations and aborts them on replacement', () => {
    expect(PANEL).toContain('if (mutationInFlightRef.current) return null');
    expect(PANEL).toContain('mutationAbortRef.current?.abort()');
    expect(PANEL).toContain('signal: controller.signal');
    expect(PANEL).toContain('if (!ownsMutation(ownerVnId, controller)) return');
  });

  it('rejects delayed clear confirmation for an obsolete VN', () => {
    expect(PANEL).toContain('if (!ok || !ownsMutation(ownerVnId, controller)) return');
    expect(PANEL.indexOf('const controller = beginMutation()')).toBeLessThan(PANEL.indexOf('const ok = await confirm({ message: t.vndbStatus.removeConfirm'));
  });

  it('reseeds nested editor drafts and owns detail saves across VN replacement', () => {
    expect(PANEL).toContain('dirty.current = false');
    expect(PANEL).toContain('identityRef.current = vnId');
    expect(PANEL).toContain('if (mutationInFlightRef.current) return');
    expect(PANEL).toContain('controller.signal.aborted || !mountedRef.current || identityRef.current !== ownerVnId || mutationAbortRef.current !== controller');
    expect(PANEL).toContain('identityRef.current === ownerVnId && mutationAbortRef.current === controller');
  });

  it('uses a plain text vote placeholder', () => {
    expect(PANEL).toContain('placeholder="-"');
    expect(PANEL).not.toContain('placeholder="—"');
  });

  it('hides touched decorative status glyphs', () => {
    expect(PANEL).toContain('<ExternalLink className="h-3 w-3" aria-hidden />');
    expect(PANEL).toContain('<Trash2 className="h-3 w-3" aria-hidden />');
  });
});
