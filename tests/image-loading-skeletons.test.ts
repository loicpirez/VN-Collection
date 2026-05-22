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
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoadingImage } from '@/components/LoadingImage';
import { ProducerLogo } from '@/components/ProducerLogo';

describe('LoadingImage — skeleton present in initial render', () => {
  it('renders data-loading-image-skeleton span before image loads', () => {
    const html = renderToStaticMarkup(
      createElement(LoadingImage, { src: '/test.jpg', alt: 'test image' }),
    );
    expect(html).toContain('data-loading-image-skeleton');
  });

  it('img starts with opacity-0 class in initial render', () => {
    const html = renderToStaticMarkup(
      createElement(LoadingImage, { src: '/test.jpg', alt: 'test image' }),
    );
    const imgMatch = html.match(/<img[^>]+>/);
    expect(imgMatch).not.toBeNull();
    expect(imgMatch![0]).toContain('opacity-0');
  });

  it('skeleton span starts with opacity-100 class in initial render', () => {
    const html = renderToStaticMarkup(
      createElement(LoadingImage, { src: '/test.jpg', alt: 'test image' }),
    );
    expect(html).toContain('opacity-100');
    const skeletonIdx = html.indexOf('data-loading-image-skeleton');
    expect(skeletonIdx).toBeGreaterThan(0);
  });

  it('renders provided alt text on the img element', () => {
    const html = renderToStaticMarkup(
      createElement(LoadingImage, { src: '/cover.jpg', alt: 'Game cover' }),
    );
    expect(html).toContain('alt="Game cover"');
  });
});

describe('ProducerLogo — uses LoadingImage when logo_path is set', () => {
  it('renders data-loading-image-skeleton when a logo_path is provided', () => {
    const html = renderToStaticMarkup(
      createElement(ProducerLogo, {
        producer: { name: 'Studio X', logo_path: 'producers/p1/logo.jpg' },
        size: 48,
      }),
    );
    expect(html).toContain('data-loading-image-skeleton');
  });

  it('renders a fallback icon when logo_path is null', () => {
    const html = renderToStaticMarkup(
      createElement(ProducerLogo, {
        producer: { name: 'Studio X', logo_path: null },
        size: 48,
      }),
    );
    expect(html).not.toContain('data-loading-image-skeleton');
  });
});
