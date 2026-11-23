import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');
const runtimeFiles = ['index.html', 'styles.css', 'app.js', 'sw.js', 'preview-noindex.js', 'privacy.html', 'terms.html', 'credits.html', 'sitemap.xml', 'llms.txt'];
const runtimeDirs = ['vendor', 'data', 'i18n'];
const binaryFiles = ['favicon.ico', 'favicon.svg', 'og-image.png'];
const rootTextFiles = ['CNAME', 'robots.txt', '_redirects', 'LICENSE', 'README.md', 'PRIVACY.md', 'TERMS.md', 'CREDITS.md', 'THIRD_PARTY_NOTICES.md'];
const excludedDirs = [join(root, 'data', 'raw')];

const headers = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: geolocation=(), camera=(), microphone=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://tiles.openfreemap.org https://photon.komoot.io; worker-src blob: 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'

/
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache

/sw.js
  Cache-Control: no-cache
  Service-Worker-Allowed: /

/preview-noindex.js
  Cache-Control: no-cache

/app.js
  Cache-Control: no-cache

/styles.css
  Cache-Control: no-cache

/privacy.html
  Cache-Control: no-cache

/terms.html
  Cache-Control: no-cache

/credits.html
  Cache-Control: no-cache

/sitemap.xml
  Cache-Control: public, max-age=3600

/og-image.png
  Cache-Control: public, max-age=86400

/favicon.svg
  Cache-Control: public, max-age=86400

/llms.txt
  Cache-Control: public, max-age=3600

/vendor/*
  Cache-Control: public, max-age=31536000, immutable

/data/*
  Cache-Control: public, max-age=3600

/i18n/*
  Cache-Control: public, max-age=3600
`;

function isIncluded(source) {
  return !excludedDirs.some(dir => source === dir || source.startsWith(dir + sep));
}

function patchServiceWorker(source) {
  const removals = ["'./index.html',", "'./sw.js',"];
  let result = source;
  for (const token of removals) {
    if (!result.includes(token)) throw new Error(`Expected service worker asset entry not found: ${token}`);
    result = result.replace(token, '');
  }
  const originalGuard = "  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;";
  const patchedGuard = "  const path=new URL(e.request.url).pathname;\n  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin||path==='/'||path==='/index.html'||path==='/sw.js')return;";
  if (!result.includes(originalGuard)) throw new Error('Expected service worker fetch guard not found');
  return result.replace(originalGuard, patchedGuard);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const name of runtimeFiles) {
  await cp(join(root, name), join(out, name));
}

for (const name of runtimeDirs) {
  await cp(join(root, name), join(out, name), { recursive: true, filter: isIncluded });
}

for (const name of rootTextFiles) {
  const source = join(root, name);
  if (existsSync(source)) await cp(source, join(out, name));
}

for (const name of binaryFiles) {
  const source = join(root, name);
  if (existsSync(source)) await cp(source, join(out, name));
}

const css = await readFile(join(root, 'styles.css'), 'utf8');
const cssAssets = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map(match => match[1]);
for (const asset of cssAssets) {
  if (/^(data:|https?:|blob:)/.test(asset)) continue;
  const relative = asset.replace(/^\.\//, '');
  if (!existsSync(join(root, relative))) throw new Error(`Missing asset referenced by styles.css: ${asset}`);
  if (!existsSync(join(out, relative))) throw new Error(`Asset not copied to public: ${asset}`);
}

const swPath = join(out, 'sw.js');
await writeFile(swPath, patchServiceWorker(await readFile(swPath, 'utf8')));
await writeFile(join(out, '_headers'), headers);

console.log(`Built ${out}`);
