// paseo-kit vendor: copy a shared runtime module from the kit into a plugin, or check that copy.
//
// Paseo installs plugins with --ignore-scripts --omit=dev, so a plugin can't depend on the kit at runtime. It keeps a
// copy of the module instead, each file headed with the kit version it came from. `--check` (run in the plugin's CI)
// fails when that copy differs from the kit the plugin pins in devDependencies: edit the kit, never the copy.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const KIT = new URL("..", import.meta.url).pathname;
/** Modules a plugin can vendor: the kit folder each one is copied from. */
export const MODULES = { "report-issue": "report-issue", "settings-feed-client": "settings-feed-client", "settings-feed-server": "settings-feed-server" };

const kitVersion = () => JSON.parse(readFileSync(join(KIT, "package.json"), "utf8")).version;
const header = (module, file, version) => `// Vendored from paseo-plugin-kit v${version} (${module}/${file}). Do not edit; change the kit and run \`paseo-kit vendor ${module} <dir>\`.\n`;

/** What the plugin's copy should hold: file name to content. */
export function expected(module, version = kitVersion()) {
  const from = MODULES[module];
  if (!from) throw new Error(`unknown module "${module}" (have: ${Object.keys(MODULES).join(", ")})`);
  const dir = join(KIT, from);
  return new Map(readdirSync(dir).filter(f => f.endsWith(".ts")).sort().map(f => [f, header(module, f, version) + readFileSync(join(dir, f), "utf8")]));
}

/** Writes the copy, removing files the kit no longer has. Returns the files written. */
export function vendor(module, dest) {
  const want = expected(module);
  mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(dest)) if (f.endsWith(".ts") && !want.has(f)) rmSync(join(dest, f));
  for (const [f, text] of want) writeFileSync(join(dest, f), text);
  return [...want.keys()];
}

/** Differences between the copy and the kit: [] when they match. */
export function check(module, dest) {
  const want = expected(module);
  if (!existsSync(dest)) return [`${dest} is missing`];
  const problems = [];
  const have = new Set(readdirSync(dest).filter(f => f.endsWith(".ts")));
  for (const [f, text] of want) {
    if (!have.has(f)) problems.push(`${join(dest, f)} is missing`);
    else if (readFileSync(join(dest, f), "utf8") !== text) problems.push(`${join(dest, f)} differs from paseo-plugin-kit v${kitVersion()}`);
  }
  for (const f of have) if (!want.has(f)) problems.push(`${join(dest, f)} isn't in the kit`);
  return problems;
}

/** `paseo-kit vendor [--check] <module> <dir>` */
export function main(args) {
  const checking = args[0] === "--check";
  const [module, dest] = checking ? args.slice(1) : args;
  if (!module || !dest) {
    console.error("usage: paseo-kit vendor [--check] <module> <dir>");
    process.exit(2);
  }
  if (checking) {
    const problems = check(module, dest);
    if (problems.length) {
      for (const p of problems) console.error(p);
      console.error(`Run \`paseo-kit vendor ${module} ${dest}\`; change the module in paseo-plugin-kit, not in the copy.`);
      process.exit(1);
    }
    console.log(`${relative(process.cwd(), dest) || dest} matches paseo-plugin-kit v${kitVersion()}.`);
  } else {
    const files = vendor(module, dest);
    console.log(`Vendored ${module} v${kitVersion()} into ${dest}: ${files.join(", ")}`);
  }
}
