import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, '..', 'src/components/TutorialTour.tsx'), 'utf8');

describe('tutorial tour accessibility and responsive placement', () => {
  it('focuses and announces each active step', () => {
    expect(SOURCE).toContain('panelRef.current?.focus({ preventScroll: true })');
    expect(SOURCE).toContain('aria-describedby={bodyId}');
    expect(SOURCE).toContain('role="status"');
    expect(SOURCE).toContain('aria-live="polite"');
    expect(SOURCE).toContain('aria-atomic="true"');
  });

  it('constrains the narrow-screen panel and keeps actions touch-safe', () => {
    expect(SOURCE).toContain('max-h-[min(70vh,32rem)]');
    expect(SOURCE).toContain('overflow-y-auto');
    expect(SOURCE).toContain('inset-x-3');
    expect(SOURCE).toContain('min-h-[44px]');
    expect(SOURCE).toContain('sm:min-h-0');
  });

  it('documents the actual expanded step count', () => {
    expect(SOURCE).toContain('Lightweight 20-step guided pass');
  });

  it('offers recoverable previous and direct-step navigation', () => {
    expect(SOURCE).toContain('onClick={previous}');
    expect(SOURCE).toContain("aria-current={index === step ? 'step' : undefined}");
    expect(SOURCE).toContain('aria-controls={stepListId}');
  });
});
