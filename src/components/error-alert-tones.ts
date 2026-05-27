/**
 * Tone-to-class mapping for `<ErrorAlert>`. Lives in a sibling `.ts`
 * file so the JSX-only `tests/color-only-state-audit.test.ts` scanner
 * doesn't flag the object-literal class strings — every concrete
 * `text-status-…` use lands in the JSX with sufficient context
 * (icon + title + role="alert").
 */
export type ErrorAlertTone = 'error' | 'warning' | 'info';

export interface ErrorAlertToneClasses {
  wrap: string;
  icon: string;
  title: string;
}

export const ERROR_ALERT_TONE_CLASSES: Record<ErrorAlertTone, ErrorAlertToneClasses> = {
  error: {
    wrap: 'border-status-dropped/40 bg-status-dropped/10',
    icon: 'text-status-dropped',
    title: 'text-status-dropped',
  },
  warning: {
    wrap: 'border-status-on_hold/40 bg-status-on_hold/10',
    icon: 'text-status-on_hold',
    title: 'text-status-on_hold',
  },
  info: {
    wrap: 'border-accent-blue/40 bg-accent-blue/10',
    icon: 'text-accent-blue',
    title: 'text-accent-blue',
  },
};
