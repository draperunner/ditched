# ditched

Command line tool to find npm dependencies that have been ditched.
A ditched package is one that has not been updated in more than one year.

This is a fork of the abandoned project [abandoned](https://github.com/brendonboshell/abandoned).

Example output:

```
> npx ditched
cli-table       	1619 days ago
@types/cli-table	919 days ago
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

### Usage

```
ditched [files..]

List dependencies that haven't been updated in a long time.

Positionals:
  files  One or more package.json files to check
                                          [string] [default: ["./package.json"]]

Options:
      --help     Show help                                             [boolean]
      --version  Show version number                                   [boolean]
  -d, --days     The number of days since last release needed to consider a
                 package as ditched                      [number] [default: 365]
  -l, --levels   How many levels we go down recursively    [number] [default: 0]

Examples:
  ditched --days 14                         Find packages in the current
                                            directory's package.json with no
                                            releases in the last 14 days.
  ditched ./package.json                    Monorepo: Find ditched packages in
  ./packages/*/package.json                 the specified package.json files.
```
