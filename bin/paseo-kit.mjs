#!/usr/bin/env node
// paseo-kit: release tooling shared by Tom's Paseo plugins. CI-only; nothing here ships to users.
//   paseo-kit release-notes [--check] <tag> [--plugin-dir <dir>]
//   paseo-kit check-dist-tag [--plugin-dir <dir>]   wait for npm, fail if the dist-tag is wrong or a prerelease is latest
//   paseo-kit dist-tag [<version>]                  print the dist-tag a version publishes to (beta or latest)
import { readFileSync } from "node:fs";
import { main as releaseNotes } from "../release/release-notes.mjs";
import { expectedDistTag, waitForDistTags } from "../release/check-dist-tag.mjs";

const [command, ...args] = process.argv.slice(2);
const pluginDir = () => {
  const at = args.indexOf("--plugin-dir");
  return at >= 0 ? args.splice(at, 2)[1] : ".";
};
const pkg = dir => JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));

if (command === "release-notes") releaseNotes(args);
else if (command === "dist-tag") console.log(expectedDistTag(args[0] ?? pkg(pluginDir()).version));
else if (command === "check-dist-tag") {
  const { name, version } = pkg(pluginDir());
  console.log(`Registry verified: ${name}@${version} is ${await waitForDistTags(name, version)}.`);
} else {
  console.error("usage: paseo-kit <release-notes|dist-tag|check-dist-tag> ...");
  process.exit(2);
}
