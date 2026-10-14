import * as esbuild from 'esbuild';
import sveltePlugin from 'esbuild-svelte';
import sveltePreprocess from 'svelte-preprocess';

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outdir: 'public',
  format: 'iife',
  sourcemap: true,
  entryNames: 'bundle',
  // Live reload: esbuild's /esbuild SSE stream fires on every rebuild.
  banner: {
    js: `(() => { const es = new EventSource("/esbuild"); es.onmessage = () => location.reload(); })();`,
  },
  plugins: [
    sveltePlugin({
      preprocess: sveltePreprocess(),
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
