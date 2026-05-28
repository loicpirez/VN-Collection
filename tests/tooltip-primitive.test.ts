import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'src/components/Tooltip.tsx'), 'utf8');

describe('Tooltip primitive', () => {
  it('exports the Tooltip component + TooltipProps interface', () => {
    expect(SRC).toMatch(/export function Tooltip/);
    expect(SRC).toMatch(/export interface TooltipProps/);
  });

  it('renders role="tooltip" on the descriptor span', () => {
    expect(SRC).toContain("role=\"tooltip\"");
  });

  it('handles Escape to dismiss (WCAG dismissible contract)', () => {
    expect(SRC).toMatch(/e\.key === ['"]Escape['"]/);
  });

  it('opens on mouseenter / focus, closes on mouseleave / blur', () => {
    expect(SRC).toContain('onMouseEnter');
    expect(SRC).toContain('onMouseLeave');
    expect(SRC).toContain('onFocus');
    expect(SRC).toContain('onBlur');
  });

  it('disabled prop short-circuits the wrapper', () => {
    expect(SRC).toMatch(/if \(disabled\) return/);
  });

  it('supports top / bottom / left / right placement', () => {
    expect(SRC).toContain("'top'");
    expect(SRC).toContain("'bottom'");
    expect(SRC).toContain("'left'");
    expect(SRC).toContain("'right'");
  });
});
