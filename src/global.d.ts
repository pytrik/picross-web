// Plain .css files are bundled by esbuild (extracted, then inlined). TS 6+
// checks side-effect imports by default, so give them a module type.
declare module '*.css';

// `./x.worker.ts?worker` imports resolve to the bundled worker source (see
// scripts/inline-worker.mjs).
declare module '*?worker' {
  const source: string;
  export default source;
}

/** package.json version, injected by esbuild `define`. */
declare const __APP_VERSION__: string;
