'use client';
import { type ReactNode } from 'react';
import { AlertTriangle, XCircle } from 'lucide-react';
import { ERROR_ALERT_TONE_CLASSES, type ErrorAlertTone } from './error-alert-tones';

export interface ErrorAlertProps {
  /** Short title or one-line summary. Required. */
  title: string;
  /** Optional secondary text / action node. */
  children?: ReactNode;
  /** Visual + semantic tone. Defaults to 'error'. */
  tone?: ErrorAlertTone;
  /** Override the default `role`. Use `'status'` for transient progress messages. */
  role?: 'alert' | 'status' | 'region';
  /** Optional extra class on the outer wrapper. */
  className?: string;
}

export function ErrorAlert({
  title,
  children,
  tone = 'error',
  role = 'alert',
  className = '',
}: ErrorAlertProps) {
  const t = ERROR_ALERT_TONE_CLASSES[tone];
  const Icon = tone === 'error' ? XCircle : AlertTriangle;
  return (
    <div
      role={role}
      className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${t.wrap} ${className}`.trim()}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${t.icon}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={`font-semibold ${t.title}`}>{title}</p>
        {children && <div className="mt-1 text-xs text-muted">{children}</div>}
      </div>
    </div>
  );
}
