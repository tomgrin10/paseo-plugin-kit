# paseo-plugin-kit

Tooling shared by Tom's Paseo plugins. The kit itself is CI-only: nothing installs it at runtime. Shared runtime modules reach users only as a copy each plugin vendors (see below).

- **`paseo-kit` bin**
  - `paseo-kit release-notes [--check] <tag> [--plugin-dir <dir>]` prints the GitHub release body. Betas are generated from the PRs merged since the previous tag. Stable and rc releases use a curated `release-notes/<version>.md`; `--check` fails when that file is missing.
  - `paseo-kit dist-tag [<version>]` prints the npm dist-tag for a version: `beta` for any prerelease, `latest` otherwise.
  - `paseo-kit check-dist-tag` waits up to 15 minutes for npm using direct no-cache registry reads and backoff capped at 30 seconds, then fails if the dist-tag is still wrong. A prerelease on `latest` fails immediately.
  - `paseo-kit vendor <module> <dir>` copies a shared runtime module into a plugin; `paseo-kit vendor --check <module> <dir>` fails when that copy differs from the kit version the plugin pins.
- **Reusable workflow** `.github/workflows/publish-npm.yml` (`workflow_call`): checks the tag is on main and matches package.json, requires curated notes, then publishes with trusted publishing to the right dist-tag. It verifies package integrity and dist-tags together within one 15-minute deadline after publication or on a rerun, then creates or updates the GitHub release. Pin the workflow and devDependency to the same kit tag so both use this verifier.

## Use it in a plugin

```jsonc
// package.json
"devDependencies": { "paseo-plugin-kit": "github:tomgrin10/paseo-plugin-kit#v0.2.0" }
```

```yaml
# .github/workflows/publish-npm.yml (keep this filename: npm's trusted publisher names it)
name: Publish to npm
on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      tag:
        description: Existing release tag to retry (for example v1.2.3)
        required: true
        type: string
permissions:
  contents: write
  id-token: write
  pull-requests: read
jobs:
  publish:
    uses: tomgrin10/paseo-plugin-kit/.github/workflows/publish-npm.yml@v0.2.0
    with:
      tag: ${{ inputs.tag || github.ref_name }}
```

Optional `with:` input: `paseo-cli: 0.14.0` installs that `@getpaseo/cli` globally before `npm run verify`, for checks that drive a Paseo daemon.

Pin both to the same tag. A plugin picks up kit changes only when it bumps them. Kit releases never force plugin releases.

## Shared runtime modules (vendored)

A module lives here once two or more plugins use it. Paseo installs plugins with `--ignore-scripts --omit=dev`, so a
plugin can't import the kit at runtime: it keeps a copy, and its CI checks the copy against the kit it pins.

```sh
npx paseo-kit vendor report-issue server/report-issue          # after bumping the kit in devDependencies
npx paseo-kit vendor --check report-issue server/report-issue  # in `npm run verify`
```

Every vendored file starts with `// Vendored from paseo-plugin-kit vX.Y.Z (...). Do not edit; ...`. Change the module
here, release the kit, bump the pin, and vendor again. The files import only each other (with `.ts` extensions), `node:`
and `zod`, and use no TypeScript-only runtime syntax, so they run under `node --experimental-strip-types` as well as in
Paseo's plugin compiler. `zod` comes from wherever the plugin already gets it.

### `report-issue`

Lets an agent file a bug, feature request or feedback about a plugin in the plugin's GitHub repository, carefully: the
first call returns the procedure, the second is a dry run (the exact issue, likely duplicates, what was redacted), and
only a third call with the dry run's `planId` and the person's yes files it. Everything is redacted first (tokens,
emails, IPs, the hostname, home paths, private repository names and PR titles); screenshots upload only with consent.

```ts
import { Reporter, LogRing, environment, manualIssueLink, reportToolDescription } from "./report-issue/index.ts";
const reporter = new Reporter({ name: "My Plugin", repo: "example/app", toolName: "my_report_issue", assetsFolder: "my-plugin",
  github: { request: (method, path, body) => /* one REST call as the person, e.g. through gh api */ },
  diagnostics: async () => ({ sections: [/* versions, environment(), state */], logs: ring.recent(20) }),
  redaction: async () => ({ privateRepos: [/* owner/name the plugin knows */] }) });
await reporter.run(callerAgentId, toolInput); // the caller comes from the host, never from the arguments
```

Each plugin keeps its own adapter (repo, diagnostics, redaction context), its agent tool registration and its UI (the
Report a bug sheet), since those depend on the plugin's own client kit and RPCs. Smart Session vendors it; Follow-up,
where it started, still has its own copy and migrates to the vendored one later.

### Settings feeds

Vendor `settings-feed-client` under `client/settings-feed` and `settings-feed-server` under
`server/settings-feed`. The shared contract lives in the plugin's `shared/` directory:
`{ name: "example.display-feed", input: z.object({}), event: z.object({ status: z.string(), values: z.unknown().optional() }) }`.
Register it with `registerSettingsFeed(server, contract, server.registerSettings(displayPreferences))` and release
the returned cleanup on unload. The server pushes the initial document and each host settings notification.

Call `watchSettings({ client, contract, read: () => client.rpc(displayRpc.read, {}), apply, revision })` from the
client contribution, then stop it on unload. `apply` validates the document with the plugin's settings schema;
`revision` returns the local change counter so an older read cannot overwrite a setting just saved on this client.
Healthy feeds make no polling RPCs. Older clients and unavailable feeds read immediately and once a minute;
subscription retries back off, and polling stops after a recovered feed stays open for 30 seconds.

## Releasing the kit

1. Bump `version` in package.json and merge to main.
2. Tag `vX.Y.Z` on main and push the tag.

The kit isn't published to npm; plugins install it from the git tag.
