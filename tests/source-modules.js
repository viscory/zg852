// Import pure source modules (and their local dependencies) in Node.
//
// The app packages are CommonJS and the real bundle is browser-only, so source
// files cannot be imported by path here. Copying just the requested ESM modules
// and their relative imports into one temporary .mjs tree lets tests assert the
// behaviour of exported functions instead of pinning source text. Modules
// loaded together share the same copy of store.js, so store mutations are
// visible to every module in the group.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const sourceDir = path.join(__dirname, '..', 'src', 'js');
const cache = new Map();

// `stubs` maps a relative module name to ESM source used instead of the real
// file. Browser-only modules imported but never called by a pure function can
// be stubbed so Node can import the module under test.
function loadSourceModules(names, stubs = {}) {
  const cacheKey = names.join(',') + JSON.stringify(stubs);
  if (cache.has(cacheKey)) return Promise.resolve(cache.get(cacheKey));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zg852-esm-'));
  const seen = new Set();
  const copy = relative => {
    if (seen.has(relative)) return;
    seen.add(relative);
    const absolute = path.join(sourceDir, relative);
    const source = Object.prototype.hasOwnProperty.call(stubs, relative)
      ? stubs[relative]
      : fs.readFileSync(absolute, 'utf8')
        .replace(/['"](\.\.?\/[^'"]+\.js)['"]/g, quote => quote.replace(/\.js(['"])$/, '.mjs$1'));
    const target = path.join(tempDir, relative.replace(/\.js$/, '.mjs'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
    for (const match of source.matchAll(/['"](\.\.?\/[^'"]+\.mjs)['"]/g)) {
      copy(path.normalize(match[1]).replace(/\.mjs$/, '.js'));
    }
  };
  try {
    for (const name of names) copy(name);
    return Promise.all(names.map(name =>
      import(pathToFileURL(path.join(tempDir, name.replace(/\.js$/, '.mjs'))).href)
    )).then(modules => {
      cache.set(cacheKey, modules);
      return modules;
    });
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return Promise.reject(error);
  }
}

function loadSourceModule(name, stubs = {}) {
  return loadSourceModules([name], stubs).then(modules => modules[0]);
}

module.exports = { loadSourceModule, loadSourceModules };
