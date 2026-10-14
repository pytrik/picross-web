# CLAUDE.md

Guidance for working in this repo. Behaviour is specified in [SPEC.md](SPEC.md)
(source of truth); usage and release steps are in [README.md](README.md). This
file holds the non-obvious things learned while building it.

## Workflow

- Keep **SPEC.md and README.md in step** with any behaviour change, in the
  same commit.
- Before calling something done: `npm run check`, `npm test`, `npm run e2e`.
- **Deploys happen only from GitHub Actions** on a `vX.Y.Z` tag
  (`.github/workflows/deploy.yml`). Never deploy locally; wrangler is
  deliberately not logged in on the dev machine.
- Release: bump `"version"` in `package.json` (the header reads it at build
  time) → commit → `git tag vX.Y.Z && git push origin vX.Y.Z`. The workflow
  fails if the tag doesn't match `package.json`.
- Right after a deploy, Cloudflare's edge can serve the previous HTML for a
  short while. That is not a failed deploy; retry before debugging.
- When touching the generator, check it still fits the 10 s budget at the
  worst case (30×30, density 0.40, **1 color** is slowest; ~2–5 s at the time
  of writing, almost all of it failed repair walks, not solver speed).

## Gotchas

### TypeScript / tests

- Unit tests run TypeScript directly under Node (type stripping). So:
  - relative imports **must include the `.ts` extension**;
  - only erasable syntax (`erasableSyntaxOnly`): no `enum`, `namespace`, or
    constructor parameter properties.
- TypeScript is pinned to `^6`: `svelte-check` / `svelte-preprocess` don't
  support TS 7 yet. TS 6 also type-checks side-effect imports, hence the
  `declare module '*.css'` in `src/global.d.ts`.
- `*.svelte.ts` (rune modules) can't run under plain Node. `npm test` preloads
  `tests/register-svelte.mjs`, a loader hook that compiles them (esbuild strips
  types → `svelte/compiler` `compileModule`).

### Svelte

- Never write the literal text `<style>` inside a `<script>` block, even in a
  comment: svelte-check then reports a misleading "`<script>` was left open".
- In classes (`game.svelte.ts`), a `$derived` field that reads fields assigned
  in the constructor must be `$derived.by(() => ...)`. Plain `$derived(this.x)`
  fails TS ("used before initialization"), and declaring the field then
  assigning `$derived` in the constructor fails the Svelte compile.
- Svelte `$state` proxies can't be structured-cloned: snapshot/copy before
  `postMessage` (see `src/lib/workers/generate.ts`).
- `history.pushState` does not fire `hashchange`; the app relies on that to
  avoid loading a freshly generated puzzle twice.

### Values duplicated across files (change together)

- Page background per theme: `--bg` in `src/styles/global.css` **and** `bg` in
  `src/App.svelte` (used for clue contrast).
- Theme bootstrap: the inline `<head>` script in `src/template.html` **and**
  `public/index.html` mirrors `src/lib/state/settings.ts` (storage key
  `picross:settings`, `theme` values).
- The `build.mjs` / `dev.mjs` esbuild options (plugins, `define`) are kept in
  parallel by hand.

### Build

- `minifyWhitespace: false` in the build is deliberate (Firefox breaks on the
  inlined bundle otherwise). Don't "fix" it.
- `dist/` must contain only `index.html` (intermediates go to `.build/`):
  wrangler uploads the whole folder and the release zip copies it.
- `esbuildTsTransformOptions: {}` on the Svelte plugin is deliberate: without
  it the build's `minifyIdentifiers` applies to `*.svelte.ts` before the Svelte
  compiler sees them, and an import renamed to `$` fails the build
  ("The $ name is reserved"), seemingly at random as the code grows.
- The generator worker is inlined as a string by `scripts/inline-worker.mjs`
  (`import src from './x.worker.ts?worker'`).

### E2E (Playwright, `tests/e2e/`)

- Runs against `dist/index.html` (build first; `npm run e2e` does both) with
  the **system Chrome** (`channel: 'chrome'`), no browser download.
- After generating a puzzle, wait for the **URL to change**, never for a cell
  count: a same-size board looks ready before the new puzzle replaces it.
  `generateVia()` in `helpers.ts` already does this.
- Cells expose `data-v` (board value: 0 unknown, 1..N color, 255 X) for tests.
- Retries are **off on purpose**: a flaky test is a bug in the app or the
  test. `--repeat-each 5` is a good stress check for new tests.
- Any console error fails a test (auto fixture in `helpers.ts`).

### CI

- CI relies on Google Chrome being preinstalled on GitHub's `ubuntu-latest`
  runners. `ubuntu-latest` moves to Ubuntu 26 from 2026-10-19; if e2e breaks
  with "browser not found", pin `runs-on: ubuntu-24.04` or add
  `npx playwright install chrome` before the e2e step.
