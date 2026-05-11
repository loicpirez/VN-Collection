'use client';
import { resolveTitles, useDisplaySettings } from '@/lib/settings/client';

interface Props {
  title: string;
  alttitle: string | null | undefined;
  mainClassName?: string;
  subClassName?: string;
  /** When true (default), render the sub-title below the main title. */
  showSub?: boolean;
}

export function TitleLine({
  title,
  alttitle,
  mainClassName = 'text-2xl font-bold leading-tight md:text-3xl',
  subClassName = 'mt-1 text-muted',
  showSub = true,
}: Props) {
  const { settings } = useDisplaySettings();
  const pair = resolveTitles(title, alttitle ?? null, settings.preferNativeTitle);
  return (
    <>
      <h1 className={mainClassName}>{pair.main}</h1>
      {showSub && pair.sub && <div className={subClassName}>{pair.sub}</div>}
    </>
  );
}

export function useResolvedTitle(title: string, alttitle: string | null | undefined): {
  main: string;
  sub: string | null;
} {
  const { settings } = useDisplaySettings();
  return resolveTitles(title, alttitle ?? null, settings.preferNativeTitle);
}
