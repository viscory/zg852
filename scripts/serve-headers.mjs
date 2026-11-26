// Dependency-free static server for the built public/ directory that applies
// the same _headers rules Cloudflare Pages uses. The Playwright harness starts
// it after `npm run build`, so tests assert real response headers instead of
// grepping the deployment config file locally.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const port = Number(process.env.PORT || 8765);

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

// _headers is a sequence of blank-line-separated blocks. The first line of a
// block is a path pattern; the rest are indented `Name: value` header lines.
function parseHeaders(text) {
  const rules = [];
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    const pattern = lines[0];
    const headers = {};
    for (const line of lines.slice(1)) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
    rules.push({ pattern, headers });
  }
  return rules;
}

const rules = existsSync(join(root, '_headers'))
  ? parseHeaders(readFileSync(join(root, '_headers'), 'utf8'))
  : [];

// Cloudflare merges every matching rule, from least to most specific. Exact
// paths win over wildcards, and a longer wildcard wins over a shorter one.
function specificity(pattern) {
  if (pattern === '/*') return 0;
  if (pattern.endsWith('/*')) return 1000 + pattern.length;
  return 10000 + pattern.length;
}

function matches(pattern, pathname) {
  if (pattern === '/*') return true;
  if (pattern.endsWith('/*')) return pathname === pattern.slice(0, -2) || pathname.startsWith(pattern.slice(0, -1));
  return pattern === pathname;
}

function headersFor(pathnames) {
  const applicable = rules.filter(rule => pathnames.some(pathname => matches(rule.pattern, pathname)));
  applicable.sort((a, b) => specificity(a.pattern) - specificity(b.pattern));
  return Object.assign({}, ...applicable.map(rule => rule.headers));
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  let pathname = decodeURIComponent(url.pathname);
  // Resolve the file without ever leaving public/.
  const resolved = resolve(root, `.${normalize(pathname)}`);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  let file = resolved;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!pathname.endsWith('/') && !existsSync(file)) file = join(root, pathname.replace(/\/$/, '') + '/index.html');

  const acceptsGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  const compressed = `${file}.gz`;
  const useGzip = acceptsGzip && !file.endsWith('.gz') && existsSync(compressed) && statSync(compressed).isFile();
  const served = useGzip ? compressed : file;
  if (!existsSync(served) || !statSync(served).isFile()) {
    const headers = headersFor([pathname]);
    res.writeHead(404, { ...headers, 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }

  const headers = headersFor([pathname, served.slice(root.length) || '/']);
  if (!headers['content-type']) {
    headers['content-type'] = CONTENT_TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
  }
  if (!useGzip) delete headers['content-encoding'];
  headers['content-length'] = String(statSync(served).size);
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(served).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} with _headers on http://127.0.0.1:${port}`);
});
