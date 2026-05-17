import { Transform } from "node:stream";
import { DitchedPackage } from "../types.js";

type RegistryResponse = {
  "dist-tags": Record<string, string>;
  time: {
    created: string;
    modified: string;
    [version: string]: string;
  };
};

export class RegistryLookup extends Transform {
  private inFlight = 0;
  private pendingCb: (() => void) | null = null;
  private tasks: Promise<unknown>[] = [];
  private readonly ditchDays: number;
  private readonly maxConcurrency: number;
  private readonly registryUrl: string;

  constructor(opts: {
    ditchDays: number;
    maxConcurrency: number;
    registryUrl: string;
  }) {
    super({ objectMode: true });
    this.ditchDays = opts.ditchDays;
    this.maxConcurrency = Math.max(opts.maxConcurrency, 1);
    this.registryUrl = opts.registryUrl;

    void fetch(this.registryUrl, { method: "HEAD" }).catch(() => {});
  }

  override _transform(
    name: string,
    _enc: BufferEncoding,
    cb: (err?: Error | null) => void,
  ): void {
    this.inFlight++;
    const task = this.fetchAndMaybeEmit(name).finally(() => {
      this.inFlight--;
      if (this.pendingCb) {
        const resume = this.pendingCb;
        this.pendingCb = null;
        resume();
      }
    });
    this.tasks.push(task);

    if (this.inFlight < this.maxConcurrency) {
      cb();
    } else {
      this.pendingCb = () => cb();
    }
  }

  override _flush(cb: (err?: Error | null) => void): void {
    Promise.allSettled(this.tasks).then(() => cb());
  }

  private async fetchAndMaybeEmit(name: string): Promise<void> {
    try {
      const res = await fetch(`${this.registryUrl}/${name}`);
      if (!res.ok) return;
      const data = (await res.json()) as RegistryResponse;

      const releaseEntries = Object.entries(data.time).filter(
        ([key]) => key !== "created" && key !== "modified",
      );
      if (releaseEntries.length === 0) return;

      const mostRecent = releaseEntries.reduce((acc, el) =>
        el[1] > acc[1] ? el : acc,
      );
      const releaseDate = new Date(mostRecent[1]);
      const ageDays = daysSince(releaseDate);

      if (ageDays >= this.ditchDays) {
        this.push({ name, ageDays } satisfies DitchedPackage);
      }
    } catch {}
  }
}

const DAY = 24 * 60 * 60 * 1000;

function daysSince(date: Date): number {
  const diffMs = new Date().getTime() - date.getTime();
  return Math.floor(diffMs / DAY);
}
