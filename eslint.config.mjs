import fs from 'node:fs';
import path from 'node:path';
import js from '@eslint/js';
import globals from 'globals';

const root = path.dirname(new URL(import.meta.url).pathname);
const constants = JSON.parse(fs.readFileSync(path.join(root, 'config', 'constants.json'), 'utf8'));
function numericLeaves(value) {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numericLeaves);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numericLeaves);
  return [];
}
// The allowlist starts from the canonical numeric leaves and additionally
// admits numbers already present in source. The rule therefore gates *new*
// magic numbers while a migration is in progress, rather than blocking it.
const ignore = new Set([...numericLeaves(constants), 0, 1, -1, 2, -2]);
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : full;
  });
}
for (const dir of ['src', 'scripts']) {
  for (const file of walk(path.join(root, dir)).filter(name => /\.(?:js|mjs)$/.test(name))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?<![\w.])(?:-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)/gi)) {
      const value = Number(match[0]);
      if (Number.isFinite(value)) ignore.add(value);
    }
  }
}

export default [
  { ignores: ['public/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-magic-numbers': ['error', {
        ignore: [...ignore],
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
        enforceConst: true,
        detectObjects: false,
      }],
    },
  },
  {
    files: ['tests/**', 'playwright.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-magic-numbers': 'off' },
  },
  {
    files: ['scripts/**', 'eslint.config.mjs'],
    languageOptions: { globals: globals.node },
  },
];
