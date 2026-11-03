import manifest from "../package.json" with { type: "json" };

/** The package's own version, bundled from `package.json` at build time. */
export const VERSION: string = manifest.version;
