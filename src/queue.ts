import { errMessage, log } from "./logger.js";

/**
 * Runs webhook work after the HTTP response has been sent (Meta expects a fast
 * 200), while keeping tasks for the same key (one user) strictly in order so
 * replies can't interleave. `drain()` lets shutdown and tests wait for
 * everything in flight.
 */
export class BackgroundQueue {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly inFlight = new Set<Promise<void>>();

  run(key: string, task: () => Promise<void>): void {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const next: Promise<void> = previous
      .then(task)
      .catch((err) => log.error("background task failed", { key, error: errMessage(err) }))
      .finally(() => {
        this.inFlight.delete(next);
        if (this.tails.get(key) === next) this.tails.delete(key);
      });
    this.tails.set(key, next);
    this.inFlight.add(next);
  }

  async drain(timeoutMs = 15_000): Promise<void> {
    const waitAll = (async () => {
      while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
    })();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    await Promise.race([waitAll, timeout]);
    clearTimeout(timer);
  }
}
