# Picross Web

A browser nonogram (picross) game with randomly generated, **multi-color**
puzzles. Every puzzle has a unique solution you can reach by logic alone, with
no guessing.

- **Shareable**: the whole puzzle lives in the URL hash. Send the link and
  your friend gets the exact same puzzle.
- **Reload-safe**: your progress, timer, and solved state are saved in your
  browser per puzzle (the last 50 are kept).
- **Single file**: the whole app is one self-contained `index.html` with no
  external requests, so it works offline.
- Undo/redo, clue completion hints, mistake checks, timer, keyboard play,
  touch support, and light/dark theme.

Full behaviour is specified in [SPEC.md](SPEC.md).

## How to play

Each number is a run of consecutive filled cells in that row or column, drawn in
the run's color. Runs of the **same** color have at least one empty cell
between them; runs of **different** colors may touch.

| Action | Mouse | Touch | Keyboard |
|---|---|---|---|
| Fill with active color | Left click / drag | Tap / drag (Fill tool) | Space / Enter |
| Mark empty (X) | Right click / drag | Tap / drag (X tool) | `X` |
| Clear | Click a cell again | Tap again | Backspace |
| Pick color | Click swatch | Tap swatch | `1`–`6` |
| Undo / redo | Toolbar | Toolbar | Ctrl+Z / Ctrl+Y |

## Development

Requires Node 24 LTS.

```bash
npm install
npm run dev        # http://localhost:3000 with live reload
npm run check      # type check (svelte-check)
npm test           # unit tests (node --test)
npm run build      # → dist/index.html (single file, open it directly)
npm run build:debug
```

Built with Svelte 5 + TypeScript and a small custom esbuild pipeline
(`scripts/build.mjs`) that inlines all JS and CSS into one HTML file.
TypeScript stays on 6.x until `svelte-check` supports 7.

## Deployment

Hosted on Cloudflare Workers static assets (`wrangler.jsonc`, serves
`dist/`).

**Release (normal path):** bump the version in `package.json` and the header,
commit, then:

```bash
git tag vX.Y.Z && git push origin vX.Y.Z
```

The GitHub Actions workflow type-checks, tests, builds, runs `wrangler deploy`,
and attaches `picross-web-vX.Y.Z.zip` (the offline `index.html`) to a GitHub
Release.

Repository secrets required: `CLOUDFLARE_API_TOKEN` ("Edit Cloudflare
Workers" template) and `CLOUDFLARE_ACCOUNT_ID`.

**Manual deploy:**

```bash
npx wrangler login   # once
npm run deploy       # build + wrangler deploy
```

## Roadmap

- Load curated puzzles from a database (`#id=…` links served by a Worker + D1).
  The puzzle format and storage keys are already designed for it (SPEC §11).

## License

MIT © Pytrik Elzinga
