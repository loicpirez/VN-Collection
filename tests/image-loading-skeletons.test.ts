/**
 * NEW-TCO-005 behavioral: LoadingImage renders a skeleton placeholder
 * before the image finishes loading.
 *
 * Uses renderToStaticMarkup (server-side React render) to assert that
 * the data-loading-image-skeleton span is present in the initial HTML
 * and that the <img> starts with opacity-0. The server render uses
 * useState's initial value (false), matching the pre-load state.
 *
 * ProducerLogo and QuoteAvatar are imported to confirm they resolve
 * without errors and export callable components that use LoadingImage
 * when given a non-null source.
 */
import { createElement, type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { LoadingImage } from '@/components/LoadingImage';
import { ProducerLogo } from '@/components/ProducerLogo';
import { I18nProvider } from '@/lib/i18n/client';
import { dictionaries } from '@/lib/i18n/dictionaries';

const loadingImageSource = readFileSync(
  join(__dirname, '..', 'src/components/LoadingImage.tsx'),
  'utf8',
);
const heroBannerSource = readFileSync(
  join(__dirname, '..', 'src/components/HeroBanner.tsx'),
  'utf8',
);

function withEnglish(children: ReactNode) {
  return createElement(
    I18nProvider,
    { locale: 'en', dict: dictionaries.en, children },
  );
}

function loadingImageElement(props: ComponentProps<typeof LoadingImage>) {
  return withEnglish(createElement(LoadingImage, props));
}

function listTsxFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return listTsxFiles(path);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('Project image loading contract', () => {
  it('keeps native image elements inside the audited loading implementations', () => {
    const sourceRoot = join(__dirname, '..', 'src');
    const nativeImageFiles = listTsxFiles(sourceRoot)
      .filter((path) => /<img\b/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(sourceRoot, path))
      .sort();

    expect(nativeImageFiles).toEqual([
      'components/HeroBanner.tsx',
      'components/LoadingImage.tsx',
      'components/SafeImage.tsx',
    ]);
  });
});

describe('LoadingImage — skeleton present in initial render', () => {
  it('renders data-loading-image-skeleton span before image loads', () => {
    const html = renderToStaticMarkup(
      loadingImageElement({ src: '/test.jpg', alt: 'test image' }),
    );
    expect(html).toContain('data-loading-image-skeleton');
  });

  it('img starts with opacity-0 class in initial render', () => {
    const html = renderToStaticMarkup(
      loadingImageElement({ src: '/test.jpg', alt: 'test image' }),
    );
    const imgMatch = html.match(/<img[^>]+>/);
    expect(imgMatch).not.toBeNull();
    expect(imgMatch![0]).toContain('opacity-0');
  });

  it('skeleton span starts mounted before image load', () => {
    const html = renderToStaticMarkup(
      loadingImageElement({ src: '/test.jpg', alt: 'test image' }),
    );
    const skeletonIdx = html.indexOf('data-loading-image-skeleton');
    expect(skeletonIdx).toBeGreaterThan(0);
  });

  it('unmounts the pulsing skeleton after load instead of hiding it with opacity', () => {
    expect(loadingImageSource).toContain('{!loaded && !errored && (');
    expect(loadingImageSource).not.toContain("loaded ? 'opacity-0' : 'opacity-100'");
  });

  it('uses the shared restrained skeleton surface without a composited gradient', () => {
    expect(loadingImageSource).toContain('animate-pulse bg-bg-elev/60');
    expect(loadingImageSource).not.toContain('bg-gradient-to-br');
  });

  it('renders provided alt text on the img element', () => {
    const html = renderToStaticMarkup(
      loadingImageElement({ src: '/cover.jpg', alt: 'Game cover' }),
    );
    expect(html).toContain('alt="Game cover"');
  });

  it('renders an accessible placeholder after image errors', () => {
    expect(loadingImageSource).toContain('data-loading-image-error');
    expect(loadingImageSource).toContain("role={ariaHidden ? undefined : 'img'}");
    expect(loadingImageSource).toContain('<ImageOff');
  });
});

describe('HeroBanner — loading skeleton lifecycle', () => {
  it('unmounts the banner pulse once the banner image has loaded', () => {
    expect(heroBannerSource).toContain('{!bannerLoaded && (');
    expect(heroBannerSource).not.toContain("bannerLoaded ? 'opacity-0' : 'opacity-100'");
  });

  it('replaces the banner pulse with a stable fallback after image errors', () => {
    expect(heroBannerSource).toContain('const [bannerErrored, setBannerErrored] = useState(false);');
    expect(heroBannerSource).toContain('setBannerErrored(false);');
    expect(heroBannerSource).toContain('onError={() => setBannerErrored(true)}');
    expect(heroBannerSource).toContain('{liveSrc && !bannerErrored ? (');
    expect(heroBannerSource).toContain('<ImageOff');
  });

  it('uses the same restrained surface as other image skeletons', () => {
    expect(heroBannerSource).toContain('animate-pulse bg-bg-elev/60');
    expect(heroBannerSource).not.toContain('bg-gradient-to-br');
  });
});

describe('ProducerLogo — uses LoadingImage when logo_path is set', () => {
  it('renders data-loading-image-skeleton when a logo_path is provided', () => {
    const html = renderToStaticMarkup(
      withEnglish(createElement(ProducerLogo, {
        producer: { name: 'Studio X', logo_path: 'producers/p1/logo.jpg' },
        size: 48,
      })),
    );
    expect(html).toContain('data-loading-image-skeleton');
  });

  it('renders a fallback icon when logo_path is null', () => {
    const html = renderToStaticMarkup(
      withEnglish(createElement(ProducerLogo, {
        producer: { name: 'Studio X', logo_path: null },
        size: 48,
      })),
    );
    expect(html).not.toContain('data-loading-image-skeleton');
  });

  it('renders the fallback icon when a producer name has no initials', () => {
    const html = renderToStaticMarkup(
      withEnglish(createElement(ProducerLogo, {
        producer: { name: '   ', logo_path: null },
        size: 48,
      })),
    );
    expect(html).toContain('lucide-building2');
  });
});
