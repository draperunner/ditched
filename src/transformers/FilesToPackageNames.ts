import { readFile } from "node:fs/promises";
import { Transform } from "node:stream";
import { DepType } from "../types.js";

export class FilesToPackageNames extends Transform {
  private readonly include: DepType[];

  constructor(opts: { include: DepType[] }) {
    super({ objectMode: true });
    this.include = opts.include;
  }

  override _transform(
    filePath: string,
    _enc: BufferEncoding,
    cb: (err?: Error | null) => void,
  ): void {
    readFile(filePath, { encoding: "utf8" })
      .then((contents) => {
        const parsed = JSON.parse(contents) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
          peerDependencies?: Record<string, string>;
          optionalDependencies?: Record<string, string>;
        };

        for (const depType of this.include) {
          for (const name of Object.keys(parsed[depType] || {})) {
            this.push(name);
          }
        }
        cb();
      })
      .catch(() => {
        cb(new Error(`Invalid file: Could not read or parse "${filePath}"`));
      });
  }
}
