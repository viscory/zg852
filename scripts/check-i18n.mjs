// Guardrail: keep every catalogue, the built-in FALLBACK, and all literal
// i18n keys used by the UI in sync. Run with `npm run i18n:check`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const catalogDir = path.join(root, 'static/i18n');
const sourceDir = path.join(root, 'src');
const i18nFile = path.join(root, 'src/js/i18n.js');

// This package is CommonJS and i18n.js imports browser-only modules, so import
// the exported FALLBACK from an import-free copy of its source. The object is
// literal data; loading it this way avoids both a source-text regex parser and
// a fragile literal-string search.
const i18nSource = fs.readFileSync(i18nFile, 'utf8');
const standalone = i18nSource.replace(/^import [^\n]*\n/gm, '');
const { FALLBACK } = await import(`data:text/javascript;base64,${Buffer.from(standalone).toString('base64')}`);

// Plural families use a base key in tp() and _one/_other forms in catalogues.
const pluralBases = new Set(['route.stopCount', 'unit.min', 'place.stops']);
// These prefixes are assembled at runtime (e.g. t('cat.'+key)), not literal keys.
const dynamicFamilies = ['cat.', 'mode.', 'vector.', 'legal.', 'tag.'];
const keyPattern = /^[A-Za-z][A-Za-z0-9-]*\.[A-Za-z0-9_-]+$/;

const errors = [];
const list = keys => [...keys].sort().join(', ');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

// 1. Every catalogue must have exactly the same key set as en.json.
const catalogFiles = fs.readdirSync(catalogDir).filter(f => f.endsWith('.json')).sort();
const catalogs = new Map();
for (const file of catalogFiles) {
  try {
    catalogs.set(file, JSON.parse(fs.readFileSync(path.join(catalogDir, file), 'utf8')));
  } catch (err) {
    errors.push(`Could not parse static/i18n/${file}: ${err.message}`);
  }
}
const en = catalogs.get('en.json');
if (!en) {
  errors.push('Missing static/i18n/en.json');
} else {
  const enKeys = Object.keys(en);
  for (const [file, catalog] of catalogs) {
    if (file === 'en.json') continue;
    const missing = enKeys.filter(key => !(key in catalog));
    const extra = Object.keys(catalog).filter(key => !(key in en));
    if (missing.length) errors.push(`static/i18n/${file} missing keys: ${list(missing)}`);
    if (extra.length) errors.push(`static/i18n/${file} extra keys: ${list(extra)}`);
  }

  // 2. Every en.json key must exist in the built-in FALLBACK object.
  {
    const fallbackKeys = new Set(Object.keys(FALLBACK));
    if (!fallbackKeys.size) errors.push('Could not import FALLBACK from src/js/i18n.js');
    const missingFromFallback = enKeys.filter(key => !fallbackKeys.has(key));
    if (missingFromFallback.length) {
      errors.push(`en.json keys missing from FALLBACK: ${list(missingFromFallback)}`);
    }

    // 3. Literal keys used in src JS/HTML must exist in en.json and FALLBACK.
    // Patterns are anchored to t()/tp() calls, data-i18n* attributes, and
    // setAttribute() calls so unrelated object keys (rtl, zh-Hant, ...) are ignored.
    const literalPatterns = [
      [/\b(?:t|tp)\s*\(\s*(['"`])([^'"`]+)\1/g, 2],
      [/\bdata-i18n(?:-placeholder|-aria-label|-title|-tooltip)?\s*=\s*(["'])([^"']+)\1/g, 2],
      [/\.setAttribute\(\s*(["'])data-i18n(?:-placeholder|-aria-label|-title|-tooltip)?\1\s*,\s*(["'])([^"']+)\2/g, 3]
    ];
    const used = new Map();
    for (const file of walk(sourceDir).filter(f => /\.(?:js|html)$/.test(f)).sort()) {
      const text = fs.readFileSync(file, 'utf8');
      for (const [pattern, keyGroup] of literalPatterns) {
        for (const match of text.matchAll(pattern)) {
          const key = match[keyGroup];
          if (!keyPattern.test(key) || dynamicFamilies.some(prefix => key.startsWith(prefix))) continue;
          const rel = path.relative(root, file);
          if (!used.has(key)) used.set(key, new Set());
          used.get(key).add(rel);
        }
      }
    }
    const enSet = new Set(enKeys);
    const missingFromEn = [], missingLiteralFromFallback = [];
    for (const [key, files] of used) {
      if (!enSet.has(key) && !pluralBases.has(key)) {
        missingFromEn.push(`"${key}" (${list(files)})`);
      }
      if (!fallbackKeys.has(key)) {
        missingLiteralFromFallback.push(`"${key}" (${list(files)})`);
      }
    }
    if (missingFromEn.length) errors.push(`Literal i18n keys missing from en.json: ${missingFromEn.sort().join('; ')}`);
    if (missingLiteralFromFallback.length) {
      errors.push(`Literal i18n keys missing from FALLBACK: ${missingLiteralFromFallback.sort().join('; ')}`);
    }

    if (!errors.length) {
      console.log(`i18n check passed: ${catalogFiles.length} catalogues, ${enKeys.length} keys each, ${Object.keys(FALLBACK).length} fallback keys, ${used.size} literal keys verified.`);
    }
  }
}

if (errors.length) {
  console.error('i18n check failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
}
