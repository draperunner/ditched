#! /usr/bin/env node
const path = require("path");
const fs = require("fs");
const https = require("https");
const CliTable = require("cli-table");
const colors = require("colors/safe");
const prettyDate = require("pretty-date");

const MS_IN_A_DAY = 1000 * 60 * 60 * 24;
const DITCHED_DAYS = 90;
const REGISTRY_URL = "https://registry.npmjs.org";

const showAllPackages =
  process.argv.includes("--all") || process.argv.includes("-a");

function getJSON(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode >= 400) {
        return reject(
          new Error(
            `Could not fetch URL ${url} package info. Status code ${response.statusCode}`
          )
        );
      }
      const body = [];
      response.on("data", (chunk) => body.push(chunk));
      response.on("end", () => resolve(JSON.parse(body.join(""))));
      request.on("error", (err) => reject(err));
    });
  });
}

function isDitched({ modifiedDate }) {
  if (!modifiedDate) return false;
  const ageDays = (new Date() - modifiedDate) / MS_IN_A_DAY;
  return ageDays > DITCHED_DAYS;
}

function printInfoTable(dataForPackages) {
  const table = new CliTable({
    head: [
      colors.gray("Package"),
      colors.gray("Last Modified"),
      colors.gray("Ditched?"),
    ],
    colWidths: [30, 40, 15],
  });

  dataForPackages
    .filter((data) => showAllPackages || isDitched(data))
    .sort((a, b) => b.modifiedDate - a.modifiedDate)
    .forEach((packageInfo) => {
      const { name, modifiedDate } = packageInfo;

      const formattedTime = modifiedDate
        ? prettyDate.format(modifiedDate)
        : "No package info found.";

      let ditchedInfo = colors.red("?");
      if (modifiedDate) {
        ditchedInfo = isDitched(packageInfo)
          ? colors.red("Yes")
          : colors.green("No");
      }

      table.push([name, formattedTime, ditchedInfo]);
    });

  console.log(table.toString());
}

async function getInfoForPackage(packageName) {
  try {
    const regUrl = REGISTRY_URL + "/" + packageName;
    const response = await getJSON(regUrl);
    const modifiedDate = new Date(response.time.modified);

    return {
      name: packageName,
      modifiedDate,
    };
  } catch (error) {
    return {
      name: packageName,
    };
  }
}

async function main() {
  const packageJsonPath = path.join(process.cwd(), "package.json");

  console.log("Looking for package.json in " + packageJsonPath + ".");

  const packageJsonStr = fs.readFileSync(packageJsonPath, {
    encoding: "utf8",
  });

  const { dependencies = {}, devDependencies = {} } =
    JSON.parse(packageJsonStr);

  const packages = [
    ...Object.keys(dependencies),
    ...Object.keys(devDependencies),
  ];

  console.log("Found " + packages.length + " packages.");
  const dataForPackages = await Promise.all(packages.map(getInfoForPackage));
  printInfoTable(dataForPackages);

  if (dataForPackages.filter(isDitched).length > 0) {
    process.exit(1);
  }
}

main();
