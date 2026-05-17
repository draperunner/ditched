import { Transform } from "node:stream";

export class Distinctify extends Transform {
  private seen = new Set<string>();

  constructor() {
    super({ objectMode: true });
  }

  override _transform(
    name: string,
    _enc: BufferEncoding,
    cb: (err?: Error | null) => void,
  ): void {
    if (!this.seen.has(name)) {
      this.seen.add(name);
      this.push(name);
    }
    cb();
  }
}
