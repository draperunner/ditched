#! /usr/bin/env node
const path = require("path")
const fs = require("fs")
const async = require("async")
const request = require("request")
const CliTable = require("cli-table")
const colors = require("colors/safe")
const prettyDate = require("pretty-date")

const ABANDONED_DAYS = 90
const REGISTRY_URL = "https://registry.npmjs.org"

const packageJsonPath = path.join(process.cwd(), "package.json");

console.log("Looking for package.json in " + packageJsonPath + ".");

const packageJsonStr = fs.readFileSync(packageJsonPath, {
  encoding: "utf8"
});

const packageConfig = JSON.parse(packageJsonStr);
const packages = Object.keys(packageConfig.dependencies || {})
  .concat(Object.keys(packageConfig.devDependencies || []));

console.log("Found " + packages.length + " packages.");

function afterQueried(err, results) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  const table = new CliTable({
      head: [
        colors.gray('Package'),
        colors.gray('Last Modified'),
        colors.gray('Abandoned?')
      ],
      colWidths: [30, 40, 15]
  });

  results.sort(function (a, b) {
    return (b.modifiedDate - a.modifiedDate);
  });

  results.forEach(function (res) {
    const ageDays = ((new Date()) - res.modifiedDate) / 1000 / 60 / 60 / 24;
    const isAbandoned = ageDays > ABANDONED_DAYS;

    table.push([
      res.name,
      prettyDate.format(res.modifiedDate),
      isAbandoned ? colors.red("Yes") : colors.green("No")
    ]);
  });

  console.log(table.toString());
};

async.map(packages, function (packageName, cb) {
  const regUrl = REGISTRY_URL + "/" + packageName;

  const afterGet = function (err, resp) {
    var modifiedDate;

    if (err) {
      return cb(err);
    }

    modifiedDate = new Date(resp.body.time.modified);

    cb(null, {
      name: packageName,
      modifiedDate: modifiedDate
    });
  };

  request(regUrl, {
    json: true
  }, afterGet);
}, afterQueried);
