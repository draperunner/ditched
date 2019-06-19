#! /usr/bin/env node
const path = require("path")
const fs = require("fs")
const request = require("request-promise-native")
const CliTable = require("cli-table")
const colors = require("colors/safe")
const prettyDate = require("pretty-date")

const MS_IN_A_DAY = 1000 * 60 * 60 * 24
const ABANDONED_DAYS = 90
const REGISTRY_URL = "https://registry.npmjs.org"

function printInfoTable(dataForPackages) {
  const table = new CliTable({
    head: [
      colors.gray('Package'),
      colors.gray('Last Modified'),
      colors.gray('Abandoned?')
    ],
    colWidths: [30, 40, 15]
  });

  dataForPackages.sort((a, b) => b.modifiedDate - a.modifiedDate);

  dataForPackages.forEach(({ name, modifiedDate }) => {
    const ageDays = (new Date() - modifiedDate) / MS_IN_A_DAY;
    const isAbandoned = ageDays > ABANDONED_DAYS;

    table.push([
      name,
      prettyDate.format(modifiedDate),
      isAbandoned ? colors.red("Yes") : colors.green("No")
    ]);
  });

  console.log(table.toString());
};

async function getInfoForPackage(packageName) {
  try {
    const regUrl = REGISTRY_URL + "/" + packageName;
    const response = await request(regUrl, { json: true })
    const modifiedDate = new Date(response.time.modified);

    return {
      name: packageName,
      modifiedDate,
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

async function main() {
  const packageJsonPath = path.join(process.cwd(), "package.json");

  console.log("Looking for package.json in " + packageJsonPath + ".");

  const packageJsonStr = fs.readFileSync(packageJsonPath, {
    encoding: "utf8"
  });

  const packageConfig = JSON.parse(packageJsonStr);
  const packages = Object.keys(packageConfig.dependencies || {})
    .concat(Object.keys(packageConfig.devDependencies || []));

  console.log("Found " + packages.length + " packages.");
  const dataForPackages = await Promise.all(packages.map(getInfoForPackage))
  printInfoTable(dataForPackages)
}

main()
