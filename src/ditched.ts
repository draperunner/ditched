#!/usr/bin/env node
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import { RegistryLookup } from "./transformers/RegistryLookup.js";
import { FilesToPackageNames } from "./transformers/FilesToPackageNames.js";
import { Distinctify } from "./transformers/Distinctify.js";
import { Outputter } from "./transformers/Outputter.js";
import { DepType } from "./types.js";

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
      include: {
        type: "string",
        array: true,
        alias: ["i"],
        default: ["dependencies", "devDependencies"],
        choices: [
          "dependencies",
          "devDependencies",
          "peerDependencies",
          "optionalDependencies",
        ],
        description:
          "Which dependency types to include when reading package.json. Use -i multiple times or provide a whitespace-separated list to include multiple types.",
      },
    })
    .example(
      "ditched --days 14",
      "Find packages in the current directory's package.json with no releases in the last 14 days.",
    )
    .example(
      "ditched --include dependencies devDependencies peerDependencies optionalDependencies",
      "Include all dependency types when checking for ditched packages (not just dependencies and devDependencies).",
    )
    .example(
      "ditched ./package.json ./packages/*/package.json",
      "Monorepo: Find ditched packages in the specified package.json files.",
    )
    .example(
      "ditched -i dependencies -- ./package.json ./packages/*/package.json",
      "Only check production dependencies in a monorepo. Use the -- separator to avoid ambiguity between the -i flag and positional file arguments.",
    )
    .example(
      "find . -name package.json | ditched -",
      "Read newline-delimited package.json paths from stdin.",
    )
    .parseAsync();
}

function stdinPathSource(): Readable {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  return Readable.from(
    (async function* (): AsyncGenerator<string> {
      for await (const line of rl) {
        const path = line.trim();
        if (path) {
          yield path;
        }
      }
    })(),
    { objectMode: true },
  );
}

function fileRecordSource(files: string[]): Readable {
  return Readable.from(files.length > 0 ? files : ["./package.json"], {
    objectMode: true,
  });
}

async function main() {
  const rawArgs = hideBin(process.argv);
  const argv = await parseArgs();
  const parsedFiles = [
    ...((argv["files"] as string[] | undefined) ?? []),
    ...argv._.map(String),
  ];
  const useStdin = rawArgs.includes("-");

  if (useStdin && parsedFiles.length > 0) {
    console.error('Error: "-" (stdin) cannot be combined with other files.');
    process.exit(2);
  }

  const source = useStdin ? stdinPathSource() : fileRecordSource(parsedFiles);

  await pipeline(
    source,
    new FilesToPackageNames({
      include: argv.include as DepType[],
    }),
    new Distinctify(),
    new RegistryLookup({
      registryUrl: argv.registry,
      ditchDays: argv.days,
      maxConcurrency: argv.concurrency,
    }),
    new Outputter(),
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
