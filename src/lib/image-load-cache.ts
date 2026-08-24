const IMAGE_LOAD_CACHE_LIMIT = 500;
const loadedImageUrls = new Set<string>();

/** Return whether the browser already completed this image in the current session. */
export function isImageLoadCached(src: string): boolean {
  return loadedImageUrls.has(src);
}

/** Remember one completed image while bounding session memory usage. */
export function cacheLoadedImage(src: string): void {
  loadedImageUrls.delete(src);
  loadedImageUrls.add(src);
  if (loadedImageUrls.size <= IMAGE_LOAD_CACHE_LIMIT) return;
  for (const oldest of loadedImageUrls) {
    loadedImageUrls.delete(oldest);
    break;
  }
}
