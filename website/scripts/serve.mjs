import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const distDirectory = resolve(scriptDirectory, '..', 'dist');
const port = Number(process.env.PORT || 4173);
const contentTypes = new Map([
  ['.bin', 'application/octet-stream'],
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
]);

function sendFile(response, filePath) {
  response.writeHead(200, {
    'Cache-Control': 'no-cache',
    'Content-Type': contentTypes.get(extname(filePath)) || 'application/octet-stream',
  });
  createReadStream(filePath).pipe(response);
}

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  let relativePath;

  if (pathname === '/' || pathname === '/dc34badge') {
    relativePath = 'index.html';
  } else if (pathname.startsWith('/dc34badge/')) {
    relativePath = pathname.slice('/dc34badge/'.length);
  } else {
    response.writeHead(404).end('Not found');
    return;
  }

  const filePath = normalize(join(distDirectory, relativePath));
  if (!filePath.startsWith(`${distDirectory}/`)) {
    response.writeHead(400).end('Invalid path');
    return;
  }

  try {
    if (!(await stat(filePath)).isFile()) throw new Error('Not a file');
    sendFile(response, filePath);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`DC34 badge website: http://127.0.0.1:${port}/dc34badge`);
});
