import { Writable } from "node:stream";
import { DitchedPackage } from "../types.js";

export class Outputter extends Writable {
  constructor() {
    super({ objectMode: true });
  }

  override _write(
    pkg: DitchedPackage,
    _enc: BufferEncoding,
    cb: (err?: Error | null) => void,
  ): void {
    process.exitCode = 1;
    const age = `${pkg.ageDays}`;
    console.log([age, pkg.name].join("\t"));
    cb();
  }
}
