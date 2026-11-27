// Prepend-only guard for observations.md.
//
// Compare the staged blob against the HEAD blob byte-for-byte. A valid change
// adds new blocks at the top, so the staged content must END with the exact
// HEAD content. Nothing already committed may be removed or reordered.
import { execFileSync } from 'node:child_process';

const file = 'observations.md';

function git(args) {
  return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

function existsInHead() {
  try {
    git(['cat-file', '-e', `HEAD:${file}`]);
    return true;
  } catch {
    return false;
  }
}

try {
  git(['diff', '--cached', '--quiet', '--', file]);
  process.exit(0); // not staged: nothing to check
} catch (error) {
  if (error.status !== 1) {
    console.error(`pre-commit: could not inspect staged ${file}: ${error.stderr?.toString().trim() || error.message}`);
    process.exit(1);
  }
}

let head;
if (existsInHead()) {
  try {
    head = git(['show', `HEAD:${file}`]);
  } catch (error) {
    console.error(`pre-commit: could not read HEAD:${file}: ${error.stderr?.toString().trim() || error.message}`);
    process.exit(1);
  }
} else {
  head = Buffer.alloc(0); // first commit: any staged content is a prepend
}

let staged;
try {
  staged = git(['show', `:${file}`]);
} catch (error) {
  console.error(`pre-commit: could not read staged ${file}: ${error.stderr?.toString().trim() || error.message}`);
  process.exit(1);
}

if (staged.length <= head.length || !staged.subarray(staged.length - head.length).equals(head)) {
  console.error(`pre-commit: ${file} is prepend-only; new blocks go at the top and existing blocks must not be removed, reordered, or edited.`);
  process.exit(1);
}

// The byte-tail check alone would accept arbitrary bytes at the top. Require
// the newly prepended region to open with a timestamped block heading.
if (!/^## \d{4}-\d{2}-\d{2}/.test(staged.subarray(0, staged.length - head.length).toString('utf8'))) {
  console.error(`pre-commit: new blocks in ${file} must start with a '## YYYY-MM-DD...' timestamped heading.`);
  process.exit(1);
}
