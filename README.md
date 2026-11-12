# paseo-plugin-kit

Release tooling shared by Tom's Paseo plugins. It is CI-only: nothing here ships to users or runs inside Paseo.

- **`paseo-kit` bin**
  - `paseo-kit release-notes [--check] <tag> [--plugin-dir <dir>]` prints the GitHub release body. Betas are generated from the PRs merged since the previous tag. Stable and rc releases use a curated `release-notes/<version>.md`; `--check` fails when that file is missing.
  - `paseo-kit dist-tag [<version>]` prints the npm dist-tag for a version: `beta` for any prerelease, `latest` otherwise.
  - `paseo-kit check-dist-tag` waits for npm, then fails if the dist-tag is wrong or a prerelease is `latest`.
- **Reusable workflow** `.github/workflows/publish-npm.yml` (`workflow_call`): checks the tag is on main and matches package.json, requires curated notes, then publishes with trusted publishing to the right dist-tag. It re-checks the dist-tags afterwards and creates or updates the GitHub release.

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

## Releasing the kit

1. Bump `version` in package.json and merge to main.
2. Tag `vX.Y.Z` on main and push the tag.

The kit isn't published to npm; plugins install it from the git tag.
