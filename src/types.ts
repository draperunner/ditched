export type DitchedPackage = { name: string; ageDays: number };

export type DepType =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies"
  | "optionalDependencies";
