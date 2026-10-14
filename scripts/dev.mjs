import * as esbuild from 'esbuild';
import sveltePlugin from 'esbuild-svelte';
import sveltePreprocess from 'svelte-preprocess';
import { inlineWorker } from './inline-worker.mjs';
import { readFileSync as readPkg } from 'fs';

const { version } = JSON.parse(readPkg('package.json', 'utf-8'));

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  // Shown in the header; keep in sync with the git tag (see README).
  define: { __APP_VERSION__: JSON.stringify(version) },
  outdir: 'public',
  format: 'iife',
  sourcemap: true,
  entryNames: 'bundle',
  // Live reload: esbuild's /esbuild SSE stream fires on every rebuild.
  banner: {
    js: `(() => { const es = new EventSource("/esbuild"); es.onmessage = () => location.reload(); })();`,
  },
  plugins: [
    inlineWorker({ minify: false }),
    sveltePlugin({
      preprocess: sveltePreprocess(),
      // Strip types from *.svelte.ts with plain options. By default the plugin
      // reuses this build's options, and minifyIdentifiers can then rename an
      // import to `$`, which the Svelte compiler rejects (reserved name).
      esbuildTsTransformOptions: {},
      compilerOptions: { css: 'injected', dev: true },
    }),
  ],
  loader: { '.css': 'css' },
  logLevel: 'info',
});

await ctx.watch();

const { port } = await ctx.serve({
  servedir: 'public',
  port: 3000,
});

console.log(`Dev server running at http://localhost:${port}`);
