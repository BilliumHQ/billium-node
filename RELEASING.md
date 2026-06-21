# Releasing

This repo is a monorepo with **two independently-versioned packages**:

| Package         | Path            | Tag namespace   | npm                                              |
| --------------- | --------------- | --------------- | ------------------------------------------------ |
| `@billium/node` | `packages/node` | `v<X.Y.Z>`      | <https://www.npmjs.com/package/@billium/node>    |
| `@billium/mcp`  | `packages/mcp`  | `mcp-v<X.Y.Z>`  | <https://www.npmjs.com/package/@billium/mcp>     |

Publishing is **tag-driven** (`.github/workflows/release.yml`). Pushing a matching tag builds, lints, tests, verifies the tag against `package.json`, and publishes to npm via OIDC Trusted Publishing (with provenance). You never run `npm publish` by hand.

---

## Versioning policy

We follow [SemVer](https://semver.org/). The version number is a **stability promise**, not a count of releases.

- **`0.y.z` — stabilizing.** The public API may change at any time. This is the correct state for a package whose surface is still settling. Breaking changes bump the **minor** while in `0.x`.
- **`1.0.0` — stability commitment.** From here, the public API is covered by the SemVer guarantee: breaking changes require a **major** bump.

Pick the version by the package's own maturity, not to match its siblings:

- **Each package versions independently.** `@billium/node` at `1.x` next to `@billium/mcp` at `0.x` is correct and intentional — it's how AWS SDK, Babel, etc. operate. Do **not** force the numbers to match.
- A new package's **first public release** is `0.1.0` if its API is still moving, or `1.0.0` only if you're ready to commit to stability. There is no rule that the first release must be `1.0.0`.
- The one anti-pattern to avoid: a package stuck at `0.x` forever while clearly in production use. Graduate it to `1.0.0` deliberately once the API has settled.

### Which bump?

| Change                                                        | Bump      |
| ------------------------------------------------------------- | --------- |
| Backward-compatible bug fix                                   | **patch** |
| New backward-compatible functionality (e.g. a new client)     | **minor** |
| Breaking change to the public API (`1.x+`)                    | **major** |
| Breaking change while in `0.x`                                | **minor** |

> npm versions are **immutable** — once published, a version number can never be reused, and you can only unpublish within 72 hours. There is no "re-release at a different number." Get the number right before you tag.

---

## Release procedure

`main` is protected: it requires a PR with passing checks and enforces linear history (squash merge). So the order is **bump → PR → squash-merge → tag the merged commit**. Do not commit a version bump straight to `main` or tag a commit that isn't on `main`.

1. **Branch** off `main`: `chore/release-<pkg>-<x.y.z>` (e.g. `chore/release-node-1.1.0`).
   - Use `chore/`, not `release/` — `release/v*` is reserved for long-lived back-port branches (none exist today).
2. **Bump the version** in the package you're releasing:
   - `packages/<pkg>/package.json` → `version`
   - For `@billium/node` **also** bump `packages/node/src/version.ts` (`SDK_VERSION`) — it feeds the `User-Agent` header and must stay in lockstep. CI's tag check only compares `package.json`, so a stale `SDK_VERSION` won't fail the build — it just ships the wrong UA. Don't forget it.
3. **Update the changelog** `packages/<pkg>/CHANGELOG.md` with a new section for the version.
4. **Verify locally**: `npm run lint && npm test && npm run build` in the package.
5. **Open a PR** into `main`, get checks green, **squash-merge**.
6. **Pull and tag the merged commit on `main`:**
   ```sh
   git checkout main && git pull
   git tag -a v1.1.0 -m "@billium/node 1.1.0"   # or mcp-v0.2.0 for @billium/mcp
   git push origin v1.1.0
   ```
   The tag version **must** equal the `package.json` version — the workflow fails the release on a mismatch.
7. **Confirm**: the Actions "Release" run is green, `npm view @billium/<pkg> version` shows the new version, and a GitHub Release was created.
8. **Clean up**: `git branch -d chore/release-<pkg>-<x.y.z>` (the remote branch auto-deletes on merge).

### Prereleases

Tag with a SemVer pre-release identifier (e.g. `v1.1.0-rc.1`, `mcp-v0.2.0-beta.1`). The workflow publishes these to the **`next`** npm dist-tag, so `npm install @billium/<pkg>` (which uses `latest`) never resolves to a release candidate.

---

## Cross-package gotcha

`@billium/mcp` depends on `@billium/node` via a `^` range and does **not** bundle it (it's `external` in the mcp build). So an mcp release that relies on new SDK functionality is only correct once that SDK version is **published**:

1. Release `@billium/node` first (so the methods exist on npm).
2. Then release `@billium/mcp`, ensuring its `@billium/node` dependency range includes that version.

Because the monorepo symlinks the local workspace during development, a too-new mcp **appears to work locally** even when the SDK version it needs hasn't shipped — the breakage only surfaces for an end user running `npx @billium/mcp`. Always sanity-check a published mcp from a clean directory:

```sh
cd $(mktemp -d) && npm i @billium/mcp && npm ls @billium/node
```
