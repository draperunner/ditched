#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import { daysSince } from "./time.js";

type RegistryResponse = {
  "dist-tags": Record<string, string>;
  time: {
    created: string;
    modified: string;
    [version: string]: string;
  };
};

type FileRecord = { path: string; includeDev: boolean };
type DitchedPackage = { name: string; ageDays: number };

async function parseArgs() {
  return await yargs(hideBin(process.argv))
    .command(
      "$0 [files..]",
      "List dependencies that haven't been updated in a long time.",
      (yargs) =>
        yargs.positional("files", {
          type: "string",
          array: true,
          description:
            'One or more package.json files to check (default "./package.json"). Pass "-" to read newline-delimited paths from stdin.',
        }),
    )
    .options({
      days: {
        type: "number",
        default: 365,
        alias: ["d"],
        description:
          "The number of days since last release needed to consider a package as ditched",
      },
      concurrency: {
        type: "number",
        default: 20,
        alias: ["c"],
        description:
          "The maximum number of concurrent registry requests (one request per package)",
      },
      registry: {
        type: "string",
        default: "https://registry.npmjs.org",
        alias: ["r"],
        description: "The URL of the npm registry to use",
      },
    })
    .example(
      "ditched --days 14",
      "Find packages in the current directory's package.json with no releases in the last 14 days.",
    )
    .example(
      "ditched ./package.json ./packages/*/package.json",
      "Monorepo: Find ditched packages in the specified package.json files.",
    )
    .example(
      "find . -name package.json | ditched -",
      "Read newline-delimited package.json paths from stdin.",
    )
    .parseAsync();
}

class FilesToPackageNames extends Transform {
  constructor() {
    super({ objectMode: true });
  }

  override _transform(
    record: FileRecord,
    _enc: BufferEncoding,
    cb: (err?: Error | null) => void,
  ): void {
    const { path: filePath, includeDev } = record;
    readFile(filePath, { encoding: "utf8" })
      .then((contents) => {
        const { dependencies = {}, devDependencies = {} } = JSON.parse(
          contents,
        ) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };

        for (const name of Object.keys(dependencies)) this.push(name);
        if (includeDev) {
          for (const name of Object.keys(devDependencies)) this.push(name);
        }
        cb();
      })
      .catch(() => {
        if (includeDev) {
          cb(new Error(`Invalid file: Could not read or parse "${filePath}"`));
        } else {
          cb();
        }
      });
  }
}

class Distinctify extends Transform {
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

class RegistryLookup extends Transform {
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

class Logger extends Writable {
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

function stdinPathSource(): Readable {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  return Readable.from(
    (async function* (): AsyncGenerator<FileRecord> {
      for await (const line of rl) {
        const path = line.trim();
        if (path) yield { path, includeDev: true };
      }
    })(),
    { objectMode: true },
  );
}

function fileRecordSource(files: string[]): Readable {
  return Readable.from(
    (files.length > 0 ? files : ["./package.json"]).map((p) => ({
      path: p,
      includeDev: true,
    })),
    { objectMode: true },
  );
}

async function main() {
  const rawArgs = hideBin(process.argv);
  const argv = await parseArgs();
  const parsedFiles = (argv["files"] as string[] | undefined) ?? [];
  const useStdin = rawArgs.includes("-");

  if (useStdin && parsedFiles.length > 0) {
    console.error('Error: "-" (stdin) cannot be combined with other files.');
    process.exit(2);
  }

  const source = useStdin ? stdinPathSource() : fileRecordSource(parsedFiles);

  await pipeline(
    source,
    new FilesToPackageNames(),
    new Distinctify(),
    new RegistryLookup({
      registryUrl: argv.registry,
      ditchDays: argv.days,
      maxConcurrency: argv.concurrency,
    }),
    new Logger(),
  );
}

// When piped into a consumer that closes early (e.g. `| head -1`), writes to
// stdout fail with EPIPE. Swallow it and exit with whatever exit code is
// already set, so `ditched | head -1` is well-behaved.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") {
      process.exit();
    }
  });
}

main().catch((error) => {
  if ((error as NodeJS.ErrnoException)?.code === "EPIPE") {
    process.exit();
  }
  console.error("An unexpected error occurred:", error);
  process.exit(1);
});
