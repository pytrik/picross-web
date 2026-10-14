import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

/**
 * Serves dist/index.html for the e2e tests. The build is a single file and
 * puzzles route via the URL hash, so every path gets index.html except
 * /favicon.ico (404, like production).
 */
const port = Number(process.env.PORT ?? 4173);

createServer(async (req, res) => {
  if (req.url?.startsWith('/favicon.ico')) {
    res.writeHead(404).end();
    return;
  }
  try {
    const html = await readFile('dist/index.html');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain' }).end('dist/index.html missing: run npm run build');
  }
}).listen(port, () => console.log(`Serving dist/ at http://localhost:${port}`));
