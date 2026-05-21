import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('image loading skeletons', () => {
  it('centralizes lightweight non-SafeImage loading behind LoadingImage', () => {
    const loadingImage = source('src/components/LoadingImage.tsx');

    expect(loadingImage).toContain('data-loading-image-skeleton');
    expect(loadingImage).toContain('const [loaded, setLoaded] = useState(false)');
    expect(loadingImage).toContain('onLoad={() => setLoaded(true)}');
    expect(loadingImage).toContain("loaded ? 'opacity-100' : 'opacity-0'");
  });

  it('uses LoadingImage for producer logos and quote avatars', () => {
    const producerLogo = source('src/components/ProducerLogo.tsx');
    const quoteAvatar = source('src/components/QuoteAvatar.tsx');

    expect(producerLogo).toContain("import { LoadingImage } from './LoadingImage';");
    expect(producerLogo).toContain('<LoadingImage');
    expect(producerLogo).not.toContain('<img');
    expect(quoteAvatar).toContain("import { LoadingImage } from './LoadingImage';");
    expect(quoteAvatar).toContain('<LoadingImage');
    expect(quoteAvatar).not.toContain('<img');
  });

  it('keeps the VN hero banner skeleton visible until the banner loads', () => {
    const heroBanner = source('src/components/HeroBanner.tsx');

    expect(heroBanner).toContain('const [bannerLoaded, setBannerLoaded] = useState(false)');
    expect(heroBanner).toContain('setBannerLoaded(false)');
    expect(heroBanner).toContain('data-hero-banner-skeleton');
    expect(heroBanner).toContain('onLoad={() => setBannerLoaded(true)}');
    expect(heroBanner).toContain(": 'opacity-0'");
  });
});
