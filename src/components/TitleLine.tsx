'use client';
import { resolveTitles, useDisplaySettings } from '@/lib/settings/client';

/** Heading levels accepted by `<TitleLine>` for the main title. */
type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

interface Props {
  title: string;
  alttitle: string | null | undefined;
  mainClassName?: string;
  subClassName?: string;
  /** When true (default), render the sub-title below the main title. */
  showSub?: boolean;
  /**
   * Override the heading level. Defaults to `h1`, suitable for detail
   * pages where the VN title is the page's primary heading. Card grids
   * should pass `h3` (or `h4`) so dozens of cards don't each render an
   * `<h1>` - that breaks the document outline (A11y A-004).
   */
  as?: HeadingTag;
}

export function TitleLine({
  title,
  alttitle,
  mainClassName = 'text-2xl font-bold leading-tight md:text-3xl',
  subClassName = 'mt-1 text-muted',
  showSub = true,
  as: HeadingComponent = 'h1',
}: Props) {
  const { settings } = useDisplaySettings();
  const pair = resolveTitles(title, alttitle ?? null, settings.preferNativeTitle);
  return (
    <>
      <HeadingComponent className={mainClassName}>{pair.main}</HeadingComponent>
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
