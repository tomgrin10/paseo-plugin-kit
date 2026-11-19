import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bin = new URL("../bin/paseo-kit.mjs", import.meta.url).pathname;
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const kit = (...args) => spawnSync("node", [bin, "vendor", ...args], { encoding: "utf8" });

test("vendor copies the module with a header naming the kit version, and --check passes on that copy", () => {
  const dest = join(mkdtempSync(join(tmpdir(), "kit-vendor-")), "server", "report-issue");
  try {
    execFileSync("node", [bin, "vendor", "report-issue", dest]);
    assert.deepEqual(readdirSync(dest).sort(), ["diagnostics.ts", "github.ts", "index.ts", "redact.ts", "render.ts"]);
    const index = readFileSync(join(dest, "index.ts"), "utf8");
    assert.ok(index.startsWith(`// Vendored from paseo-plugin-kit v${version} (report-issue/index.ts). Do not edit;`), index.slice(0, 120));
    assert.equal(index.split("\n").slice(1).join("\n"), readFileSync(new URL("../report-issue/index.ts", import.meta.url), "utf8"));
    const ok = kit("--check", "report-issue", dest);
    assert.equal(ok.status, 0, ok.stderr);
  } finally { rmSync(dest, { recursive: true, force: true }); }
});

test("vendor --check fails on an edited, missing or extra file, and vendor puts it right", () => {
  const dest = mkdtempSync(join(tmpdir(), "kit-vendor-"));
  try {
    execFileSync("node", [bin, "vendor", "report-issue", dest]);
    writeFileSync(join(dest, "redact.ts"), readFileSync(join(dest, "redact.ts"), "utf8") + "\n// local fix\n");
    rmSync(join(dest, "render.ts"));
    writeFileSync(join(dest, "extra.ts"), "export {};\n");
    const bad = kit("--check", "report-issue", dest);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /redact\.ts differs from paseo-plugin-kit/);
    assert.match(bad.stderr, /render\.ts is missing/);
    assert.match(bad.stderr, /extra\.ts isn't in the kit/);
    execFileSync("node", [bin, "vendor", "report-issue", dest]);
    assert.equal(kit("--check", "report-issue", dest).status, 0);
  } finally { rmSync(dest, { recursive: true, force: true }); }
});

test("vendor refuses an unknown module or missing arguments", () => {
  assert.equal(kit("report-issue").status, 2);
  assert.match(kit("nope", "/tmp/x").stderr, /unknown module "nope"/);
});
