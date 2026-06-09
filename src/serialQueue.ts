/**
 * A tiny promise serializer: operations run one-at-a-time in submission order.
 *
 * Used to stop overlapping webview-driven kernel calls (e.g. switching role
 * while a settings snapshot is still building) from piling up and freezing the
 * extension. Kept dependency-free for unit testing.
 */
export interface SerialQueue {
  /** Queue `fn` to run after every previously queued op settles. */
  run<T>(fn: () => Promise<T> | T): Promise<T>;
}

export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T> | T): Promise<T> {
      const next = tail.then(fn, fn);
      // Never let a rejection break the chain for subsequent ops.
      tail = next.then(
        () => undefined,
        () => undefined,
      );
      return next as Promise<T>;
    },
  };
}
