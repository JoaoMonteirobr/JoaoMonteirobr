import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const host = '127.0.0.1';
const port = 4173;

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function resolveRequestPath(requestUrl, root) {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${host}:${port}`).pathname);
  const requestedPath = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  return requestedPath === root || requestedPath.startsWith(`${root}${sep}`) ? requestedPath : null;
}

export function createStaticTestServer(root = resolve(process.cwd())) {
  return createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method || '')) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }

    let filePath;
    try {
      filePath = resolveRequestPath(request.url || '/', root);
    } catch {
      response.writeHead(400);
      response.end('Bad request');
      return;
    }

    if (!filePath) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error('Not a file');

      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': fileStat.size,
        'Content-Type': contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      if (request.method === 'HEAD') response.end();
      else createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createStaticTestServer();
  server.listen(port, host, () => {
    console.log(`Static test server listening on http://${host}:${port}`);
  });
}
