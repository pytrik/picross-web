import * as esbuild from 'esbuild';
import sveltePlugin from 'esbuild-svelte';
import sveltePreprocess from 'svelte-preprocess';
import { inlineWorker } from './inline-worker.mjs';
import { readFileSync as readPkg } from 'fs';

const { version } = JSON.parse(readPkg('package.json', 'utf-8'));
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const debug = process.argv.includes('--debug');

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  // Shown in the header; keep in sync with the git tag (see README).
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Intermediates go to .build/ so dist/ holds only the final index.html
  // (that whole folder is what gets published).
  outfile: '.build/bundle.js',
  format: 'iife',
  // Granular minification — minifyWhitespace is disabled because it converts
  // string literals like "\n   text" into template literals with real newline
  // characters. While valid JS, this breaks inline <script> parsing in Firefox
  // when the bundle is inlined into the single-file HTML output.
  minifyWhitespace: false,
  minifyIdentifiers: !debug,
  minifySyntax: !debug,
  plugins: [
    inlineWorker({ minify: !debug }),
    sveltePlugin({
      preprocess: sveltePreprocess(),
      compilerOptions: { css: 'injected' },
    }),
  ],
  loader: { '.css': 'css' },
  logLevel: 'info',
});

const template = readFileSync('src/template.html', 'utf-8');
const bundle = readFileSync('.build/bundle.js', 'utf-8');

// Inline extracted CSS (plain .css imports) if esbuild produced a file.
let css = '';
if (existsSync('.build/bundle.css')) {
  css = readFileSync('.build/bundle.css', 'utf-8');
}

let html = template.replace('<!-- SCRIPT -->', bundle);
html = html.replace('<!-- STYLE -->', css);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log(`Built dist/index.html (${debug ? 'debug' : 'minified'})`);
