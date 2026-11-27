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
// the exported FALLBACK from an import-free copy of its source. This strips
// import lines and evaluates the literal FALLBACK object via a data: import;
// it is a source-text transform and must be kept minimal. This is NOT an
// executable test of i18n.js: the actual guarantee enforced below is key-set
// parity between FALLBACK and the catalogues.
const i18nSource = fs.readFileSync(i18nFile, 'utf8');
const standalone = i18nSource.replace(/^import [^\n]*\n/gm, '');
const { FALLBACK } = await import(`data:text/javascript;base64,${Buffer.from(standalone).toString('base64')}`);

// Plural families use a base key in tp() and _one/_other forms in catalogues.
const pluralBases = new Set(['route.stopCount', 'unit.min', 'place.stops']);
// These prefixes are assembled at runtime (e.g. t('cat.'+key)), not literal keys.
const dynamicFamilies = ['cat.', 'mode.', 'vector.', 'legal.', 'tag.'];
const keyPattern = /^[A-Za-z][A-Za-z0-9-]*\.[A-Za-z0-9_-]+$/;
// Reviewed allowlist: proper nouns and brand names are legitimately identical
// across catalogues, so an identical value is not an English leak.
const PROPER_NOUN_KEYS = new Set(['options.rail', 'map.railKey', 'mode.rail', 'beta.badge', 'locale.label']);
// Small explicit set of live copy that must be translated in every catalogue.
const REQUIRED_TRANSLATION_KEYS = [
  'results.fareSpread', 'error.someNoReach', 'results.header', 'map.areaHint', 'beta.diagnosticsHelp'
];

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
    // 2b. Key-set parity is not enough: a stale FALLBACK value silently loses
    // to the catalogue at runtime (t() prefers the loaded catalogue), so a
    // corrected FALLBACK can be invisible to users. Compare values as well.
    const valueMismatch = enKeys.filter(key => fallbackKeys.has(key) && FALLBACK[key] !== en[key]);
    if (valueMismatch.length) {
      errors.push(`FALLBACK values differ from en.json: ${list(valueMismatch)}`);
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

    // 4–5 are policy checks. They run only when the structural checks above
    // are clean, so a broken catalogue cannot bury its own parse/key errors
    // under derived findings.
    if (!errors.length) {
      // 4. DEAD KEYS. Reuse the literalPatterns results above, and also collect
      // literal key strings outside i18n.js so keys dispatched through a
      // variable (t(metric === 'fare' ? a : b), error-code maps, etc.) are not
      // mistaken for dead entries. The FALLBACK definitions in i18n.js are not
      // usage, so that file is excluded from the broad scan.
      const referenced = new Set(used.keys());
      const literalKey = /['"`]([A-Za-z][A-Za-z0-9-]*\.[A-Za-z0-9_-]+)['"`]/g;
      for (const file of walk(sourceDir).filter(f => /\.(?:js|html)$/.test(f) && f !== i18nFile).sort()) {
        const text = fs.readFileSync(file, 'utf8');
        for (const match of text.matchAll(literalKey)) {
          const key = match[1];
          if (keyPattern.test(key) && !dynamicFamilies.some(prefix => key.startsWith(prefix))) referenced.add(key);
        }
      }
      // Plural families: tp() resolves the _one/_other variants at runtime, so
      // neither the base nor its variants are dead even when only the base is
      // written in source.
      const pluralFamilies = new Set(pluralBases);
      for (const file of walk(sourceDir).filter(f => /\.(?:js|html)$/.test(f)).sort()) {
        const text = fs.readFileSync(file, 'utf8');
        for (const match of text.matchAll(/\btp\s*\(\s*(['"`])([^'"`]+)\1/g)) pluralFamilies.add(match[2]);
      }
      const isPluralKey = key => {
        if (pluralFamilies.has(key)) return true;
        const base = key.replace(/_(one|other|few|many)$/, '');
        return base !== key && (pluralFamilies.has(base) || referenced.has(base));
      };
      const dead = enKeys.filter(key =>
        !referenced.has(key) &&
        !isPluralKey(key) &&
        !dynamicFamilies.some(prefix => key.startsWith(prefix))
      );
      if (dead.length) errors.push(`Unused i18n keys in en.json (dead keys): ${list(dead)}`);

      // 5. UNTRANSLATED LIVE COPY. Flag values byte-identical to English for
      // the reviewed set of strings that must be translated in every locale.
      for (const [file, catalog] of catalogs) {
        if (file === 'en.json') continue;
        for (const key of REQUIRED_TRANSLATION_KEYS) {
          if (PROPER_NOUN_KEYS.has(key)) continue;
          if (Object.prototype.hasOwnProperty.call(catalog, key) && catalog[key] === en[key]) {
            errors.push(`static/i18n/${file}: "${key}" is untranslated (identical to en.json)`);
          }
        }
      }
    }

    if (!errors.length) {
      console.log(`i18n check passed: ${catalogFiles.length} catalogues, ${enKeys.length} keys each, ${Object.keys(FALLBACK).length} fallback keys, ${used.size} literal keys verified, no dead keys, no untranslated live copy, FALLBACK values match en.json.`);
    }
  }
}

if (errors.length) {
  console.error('i18n check failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
}
