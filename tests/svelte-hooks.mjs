import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { compileModule } from 'svelte/compiler';

/**
 * Node module hook: compile `*.svelte.ts` (rune modules) the way the build
 * does, so unit tests can import them. Strip types with esbuild, then run
 * Svelte's module compiler. Everything else uses Node's own loader.
 */
export async function load(url, context, nextLoad) {
  if (!url.endsWith('.svelte.ts')) return nextLoad(url, context);
  const filename = fileURLToPath(url);
  const ts = await readFile(filename, 'utf8');
  const { code } = await transform(ts, { loader: 'ts', format: 'esm', target: 'es2022', sourcefile: filename });
  const { js } = compileModule(code, { filename, generate: 'client' });
  return { format: 'module', source: js.code, shortCircuit: true };
}
