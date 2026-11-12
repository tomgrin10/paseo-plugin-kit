import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { checkDistTags, expectedDistTag } from "../release/check-dist-tag.mjs";

const bin = new URL("../bin/paseo-kit.mjs", import.meta.url).pathname;

test("a prerelease publishes to beta and a stable version to latest", () => {
  for (const v of ["1.0.0-beta.0", "2.0.0-rc.1", "0.4.0-alpha"]) assert.equal(expectedDistTag(v), "beta", v);
  assert.equal(expectedDistTag("1.2.3"), "latest");
  assert.equal(execFileSync("node", [bin, "dist-tag", "3.7.0-beta.9"], { encoding: "utf8" }).trim(), "beta");
  assert.equal(execFileSync("node", [bin, "dist-tag", "3.7.0"], { encoding: "utf8" }).trim(), "latest");
});

test("a prerelease on latest is always an error, even when beta also points at it", () => {
  assert.throws(() => checkDistTags("1.1.0-beta.0", { latest: "1.1.0-beta.0", beta: "1.1.0-beta.0" }), /tagged latest/);
  assert.throws(() => checkDistTags("1.1.0-beta.0", { latest: "1.0.0", beta: "1.0.9-beta.3" }), /beta dist-tag is 1\.0\.9-beta\.3/);
  assert.throws(() => checkDistTags("1.1.0", { latest: "1.0.0" }), /latest dist-tag is 1\.0\.0/);
  assert.equal(checkDistTags("1.1.0-beta.0", { latest: "1.0.0", beta: "1.1.0-beta.0" }), "beta");
  assert.equal(checkDistTags("1.1.0", { latest: "1.1.0", beta: "1.1.0-beta.0" }), "latest");
});
