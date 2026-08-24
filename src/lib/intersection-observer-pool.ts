type IntersectionListener = () => void;

interface ObserverPool {
  observer: IntersectionObserver;
  subscribers: Map<Element, Set<IntersectionListener>>;
}

export interface IntersectionPoolOptions {
  rootMargin: string;
  threshold: number;
}

const pools = new Map<string, ObserverPool>();

function poolKey(options: IntersectionPoolOptions): string {
  return `${options.rootMargin}|${options.threshold}`;
}

function releaseEmptyPool(key: string, pool: ObserverPool): void {
  if (pool.subscribers.size > 0) return;
  pool.observer.disconnect();
  pools.delete(key);
}

function createPool(key: string, options: IntersectionPoolOptions): ObserverPool {
  let pool: ObserverPool;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const listeners = pool.subscribers.get(entry.target);
        if (!listeners) continue;
        pool.subscribers.delete(entry.target);
        pool.observer.unobserve(entry.target);
        for (const listener of listeners) listener();
      }
      releaseEmptyPool(key, pool);
    },
    { rootMargin: options.rootMargin, threshold: options.threshold },
  );
  pool = { observer, subscribers: new Map() };
  pools.set(key, pool);
  return pool;
}

/**
 * Observe one element until it intersects while sharing the browser observer
 * with every subscriber that uses the same options.
 *
 * @param target Element whose first intersection should be reported.
 * @param listener Callback invoked once when the element intersects.
 * @param options Observer margin and threshold used to select the shared pool.
 * @returns An idempotent function that removes this subscription.
 */
export function observeIntersectionOnce(
  target: Element,
  listener: IntersectionListener,
  options: IntersectionPoolOptions,
): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    listener();
    return () => undefined;
  }

  const key = poolKey(options);
  const pool = pools.get(key) ?? createPool(key, options);
  let listeners = pool.subscribers.get(target);
  if (!listeners) {
    listeners = new Set();
    pool.subscribers.set(target, listeners);
    pool.observer.observe(target);
  }
  listeners.add(listener);

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    const current = pool.subscribers.get(target);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      pool.subscribers.delete(target);
      pool.observer.unobserve(target);
    }
    releaseEmptyPool(key, pool);
  };
}
