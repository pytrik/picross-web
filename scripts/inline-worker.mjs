import * as esbuild from 'esbuild';
import path from 'node:path';

/**
 * `import src from './x.worker.ts?worker'` → the worker bundled as an IIFE
 * string, so it can run from a Blob URL without emitting a separate file
 * (keeps the single-file build). Worker inputs are added to watchFiles so the
 * dev server rebuilds when they change.
 */
export function inlineWorker({ minify = false } = {}) {
  return {
    name: 'inline-worker',
    setup(build) {
      build.onResolve({ filter: /\?worker$/ }, (args) => ({
        path: path.resolve(args.resolveDir, args.path.replace(/\?worker$/, '')),
        namespace: 'inline-worker',
      }));
      build.onLoad({ filter: /.*/, namespace: 'inline-worker' }, async (args) => {
        const result = await esbuild.build({
          entryPoints: [args.path],
          bundle: true,
          write: false,
          format: 'iife',
          // Same Firefox caveat as the main bundle: keep whitespace.
          minifyWhitespace: false,
          minifyIdentifiers: minify,
          minifySyntax: minify,
          metafile: true,
        });
        return {
          contents: `export default ${JSON.stringify(result.outputFiles[0].text)};`,
          loader: 'js',
          watchFiles: Object.keys(result.metafile.inputs).map((f) => path.resolve(f)),
        };
      });
    },
  };
}
