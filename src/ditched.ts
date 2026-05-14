#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import { daysSince } from "./time.js";

const REGISTRY_URL = "https://registry.npmjs.org";

const packageInfoCache: { [key: string]: PackageInfo } = {};

async function parseArgs() {
  return await yargs(hideBin(process.argv))
    .command(
      "$0 [files..]",
      "List dependencies that haven't been updated in a long time.",
      (yargs) =>
        yargs.positional("files", {
          type: "string",
          array: true,
          description: "One or more package.json files to check",
          default: ["./package.json"],
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
      levels: {
        type: "number",
        default: 0,
        alias: ["l"],
        description: "How many levels we go down recursively",
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
    .parseAsync();
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Could not fetch URL ${url} package info. Status code ${res.status}`,
    );
  }
  return (await res.json()) as T;
}

// A subset of the response returned by npm's registry
type RegistryResponse = {
  "dist-tags": Record<string, string>;
  time: {
    created: string;
    modified: string;
    [version: string]: string;
  };
  versions: any;
};

type PackageInfo = {
  name: string;
  mostRecentReleaseDate?: Date;
};

function isDitched(
  { mostRecentReleaseDate }: PackageInfo,
  ditchDays: number,
): boolean {
  if (!mostRecentReleaseDate) return false;
  const ageDays = daysSince(mostRecentReleaseDate);
  return ageDays >= ditchDays;
}

function printInfoTable(
  dataForPackages: PackageInfo[],
  ditchDays: number,
): void {
  let packagesToShow: PackageInfo[] = [];
  let longestNameLength = 0;

  for (const data of dataForPackages) {
    if (isDitched(data, ditchDays)) {
      packagesToShow.push(data);
      longestNameLength = Math.max(longestNameLength, data.name.length);
      process.exitCode = 1;
    }
  }

  if (!packagesToShow.length) {
    return;
  }

  packagesToShow
    .sort((a, b) => {
      if (!a.mostRecentReleaseDate) return -1;
      if (!b.mostRecentReleaseDate) return 1;
      return (
        a.mostRecentReleaseDate.getTime() - b.mostRecentReleaseDate.getTime()
      );
    })
    .forEach((packageInfo) => {
      const { name, mostRecentReleaseDate } = packageInfo;

      const formattedTime = mostRecentReleaseDate
        ? `${daysSince(mostRecentReleaseDate)} days ago`
        : "No package info found.";

      console.log([name.padEnd(longestNameLength), formattedTime].join("\t"));
    });
}

async function getInfoForPackage(
  packageName: string,
  levels: number,
): Promise<PackageInfo> {
  if (packageName in packageInfoCache) {
    return packageInfoCache[packageName];
  }
  try {
    const regUrl = REGISTRY_URL + "/" + packageName;
    const response = await getJSON<RegistryResponse>(regUrl);

    const mostRecentReleasedEntry = Object.entries(response.time)
      .filter(([key]) => key !== "created" && key !== "modified")
      .reduce((acc, el) => (el[1] > acc[1] ? el : acc));

    const mostRecentReleaseDate = new Date(mostRecentReleasedEntry[1]);
    const mostRecentReleaseVersion = mostRecentReleasedEntry[0];
    const mostRecentReleaseVersionDetails =
      response.versions[mostRecentReleaseVersion];
    const { dependencies = {}, devDependencies = {} } =
      mostRecentReleaseVersionDetails;

    const dependencyPackages = [
      ...Object.keys(dependencies),
      ...Object.keys(devDependencies),
    ];

    const result: PackageInfo = {
      name: packageName,
      mostRecentReleaseDate,
    };

    packageInfoCache[packageName] = result;

    if (levels === 1) {
      await Promise.all(
        dependencyPackages.map((pkg) => getInfoForPackage(pkg, 0)),
      );
    } else if (levels > 1) {
      for (const dependencyPackage of dependencyPackages) {
        await getInfoForPackage(dependencyPackage, levels - 1);
      }
    }
    return result;
  } catch {
    return {
      name: packageName,
    };
  }
}

async function main() {
  const argv = await parseArgs();
  const packageJsonFiles = argv["files"] as string[];

  const packages = new Set<string>();

  for (const packageJsonFile of packageJsonFiles) {
    try {
      const packageJsonStr = await readFile(packageJsonFile, {
        encoding: "utf8",
      });

      const { dependencies = {}, devDependencies = {} } =
        JSON.parse(packageJsonStr);

      Object.keys(dependencies).forEach((pkg) => packages.add(pkg));
      Object.keys(devDependencies).forEach((pkg) => packages.add(pkg));
    } catch {
      console.error(
        `Invalid file: Could not read or parse "${packageJsonFile}"`,
      );
      process.exit(1);
    }
  }

  const levels =
    Number.isSafeInteger(argv.levels) && argv.levels >= 0 ? argv.levels : 0;

  let dataForPackages: PackageInfo[] = [];
  if (levels === 0) {
    dataForPackages = await Promise.all(
      [...packages].map((packageName) => getInfoForPackage(packageName, 0)),
    );
  } else {
    for (const packageName of packages) {
      await getInfoForPackage(packageName, levels);
    }
    dataForPackages = Object.values(packageInfoCache);
  }

  printInfoTable(dataForPackages, argv.days);
}

main().catch((error) => {
  console.error("An unexpected error occurred:", error);
  process.exit(1);
});
