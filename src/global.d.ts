// Plain .css files are bundled by esbuild (extracted, then inlined). TS 6+
// checks side-effect imports by default, so give them a module type.
declare module '*.css';
