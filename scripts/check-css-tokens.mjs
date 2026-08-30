// CSS custom-property definition gate (deep-dive 4.4, closing the class).
//
// An undefined var() reference is invalid at computed-value time, so the
// declaration silently falls back to inheritance — the accent just doesn't
// render, and HTTP 200 + a green build prove nothing. This class has now
// shipped three times (--hm-radius x5 and --hm-amber in v3.61-era work,
// --hm-warning-text x6 in v3.76's budget UI). Every var(--hm-*) reference in
// the source tree must resolve to a defined custom property.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const uiDir = join(here, '../ui');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (entry === 'dist' || entry === 'node_modules') continue;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (entry.endsWith('.css') || entry.endsWith('.js')) out.push(path);
  }
  return out;
}

const files = walk(uiDir);
const defined = new Set();
const references = new Map(); // token -> [file:line]

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    // Definitions: `--hm-foo:` in CSS or setProperty('--hm-foo', ...) in JS.
    for (const match of line.matchAll(/(--hm-[a-z0-9-]+)\s*:/g)) {
      defined.add(match[1]);
    }
    for (const match of line.matchAll(/setProperty\(\s*['"](--hm-[a-z0-9-]+)['"]/g)) {
      defined.add(match[1]);
    }
    // References: var(--hm-foo) and var(--hm-foo, fallback). A reference
    // WITH a fallback is still flagged when undefined — a fallback papering
    // over a missing token is drift, not a design.
    for (const match of line.matchAll(/var\(\s*(--hm-[a-z0-9-]+)/g)) {
      const token = match[1];
      if (!references.has(token)) references.set(token, []);
      references.get(token).push(`${relative(uiDir, file)}:${index + 1}`);
    }
  });
}

const undefinedTokens = [...references.entries()]
  .filter(([token]) => !defined.has(token))
  .map(([token, sites]) => `${token} (${sites.slice(0, 3).join(', ')}${sites.length > 3 ? ', …' : ''})`);

assert.equal(undefinedTokens.length, 0,
  `undefined design tokens referenced:\n  ${undefinedTokens.join('\n  ')}`);
assert.ok(defined.size > 30, `token collection looks broken: only ${defined.size} definitions found`);
assert.ok(references.size > 30, `reference collection looks broken: only ${references.size} tokens referenced`);

console.log(`css-tokens: ${references.size} referenced tokens all defined (${defined.size} definitions)`);
process.exit(0);
