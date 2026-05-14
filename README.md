# ditched

Command line tool to find npm dependencies that have been ditched.
A ditched package is one that has not been updated in more than one year.

This is a fork of the abandoned project [abandoned](https://github.com/brendonboshell/abandoned).

The output lists the age (in days) and name of all ditched packages:

```
> npx ditched
1619  cli-table
919   @types/cli-table
```

If there are no ditched packages, there will be no output.

## How to Use

Within your project, run

```
npx ditched
```

You can also install it as a dev dependency and use it in your scripts,
for example as part of your build procedure or as a reminder after install.

```
npm install --dev ditched
```

package.json:

```
"scripts": {
  "test": "ditched",
  "postinstall": "ditched"
}
```

### Reference

```
ditched [files..]

List dependencies that haven't been updated in a long time.

Positionals:
  files  One or more package.json files to check (default "./package.json").
         Pass "-" to read newline-delimited paths from stdin.           [string]

Options:
      --help         Show help                                         [boolean]
      --version      Show version number                               [boolean]
  -d, --days         The number of days since last release needed to consider a
                     package as ditched                  [number] [default: 365]
  -c, --concurrency  The maximum number of concurrent registry requests (one
                     request per package)                 [number] [default: 20]
  -r, --registry     The URL of the npm registry to use
                                [string] [default: "https://registry.npmjs.org"]

Examples:
  ditched --days 14                         Find packages in the current
                                            directory's package.json with no
                                            releases in the last 14 days.
  ditched ./package.json                    Monorepo: Find ditched packages in
  ./packages/*/package.json                 the specified package.json files.
  find . -name package.json | ditched -     Read newline-delimited package.json
                                            paths from stdin.
```

### Examples

Sort by age, descending:

```
ditched | sort -rn
```

Get age of all dependencies by setting age limit to 0:

```
ditched --days 0
```

Fail fast on first found ditched dependency:

```
set -o pipefail; ditched | head -1
```

Find ditched dependencies in a monorepo using explicit paths:

```
ditched package.json packages/**/package.json
```

Or recursively find all package.json files excluding those inside node_modules:

```
find . -name "node_modules" -prune -o -type f -name "package.json" -print | ditched -
```

Check transitive dependencies multiple levels deep with npm list:

```
npm list -p --depth=3 | sed 's/$/\/package.json/' | ditched -
```
