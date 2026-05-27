/**
 * Pins the ErrorAlert primitive contract (audit U-019):
 *   - default tone = 'error' (status-dropped palette)
 *   - role defaults to 'alert' so screen readers announce on mount
 *   - tones map to canonical status palette classes
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'src/components/ErrorAlert.tsx'), 'utf8');
const TONES = readFileSync(join(__dirname, '..', 'src/components/error-alert-tones.ts'), 'utf8');

describe('ErrorAlert primitive', () => {
  it('exports the ErrorAlert component + ErrorAlertProps type', () => {
    expect(SRC).toMatch(/export function ErrorAlert/);
    expect(SRC).toMatch(/export interface ErrorAlertProps/);
  });

  it('defaults tone to error + role to alert', () => {
    expect(SRC).toMatch(/tone\s*=\s*['"]error['"]/);
    expect(SRC).toMatch(/role\s*=\s*['"]alert['"]/);
  });

  it('uses canonical status palette classes (no off-palette colors)', () => {
    expect(TONES).toContain('status-dropped');
    expect(TONES).toContain('status-on_hold');
    expect(TONES).toContain('accent-blue');
    // No off-palette `red-` / `amber-` / `green-` classes that the
    // uiux audit specifically called out.
    expect(TONES).not.toMatch(/\bred-\d/);
    expect(TONES).not.toMatch(/\bamber-\d/);
    expect(TONES).not.toMatch(/\brose-\d/);
  });

  it('renders an icon + title + optional body children', () => {
    expect(SRC).toMatch(/AlertTriangle|XCircle/);
    expect(SRC).toContain('title');
    expect(SRC).toContain('children');
  });
});
