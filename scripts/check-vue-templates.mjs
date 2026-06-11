#!/usr/bin/env node
/**
 * Strict template validation for the Odin WebUI.
 *
 * Extracts every `template: \`...\`` string from the UI modules and runs it
 * through @vue/compiler-dom with errors AND warnings treated as fatal.
 * The runtime compiler silently auto-recovers from malformed templates
 * (e.g. the missing </div> that hid in llm-config.js for weeks) — this
 * check makes that class of bug fail CI instead.
 */
import { compile } from '@vue/compiler-dom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../ui/js', import.meta.url).pathname;

function* jsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* jsFiles(path);
    else if (name.endsWith('.js')) yield path;
  }
}

function* templates(src) {
  let idx = 0;
  while ((idx = src.indexOf('template: `', idx)) !== -1) {
    const from = idx + 'template: `'.length;
    // Template strings in this codebase never contain backticks; the
    // closing backtick is the next one.
    const end = src.indexOf('`', from);
    if (end === -1) break;
    yield { offset: idx, body: src.slice(from, end) };
    idx = end + 1;
  }
}

let checked = 0;
let failures = 0;
for (const file of jsFiles(ROOT)) {
  const src = readFileSync(file, 'utf8');
  for (const { offset, body } of templates(src)) {
    checked++;
    const line = src.slice(0, offset).split('\n').length;
    try {
      compile(body, {
        onError(e) { throw e; },
        onWarn(w) { throw w; },
      });
    } catch (e) {
      failures++;
      const tplLine = e.loc ? e.loc.start.line : '?';
      console.error(`FAIL ${file}:${line} (template line ${tplLine}): ${e.message}`);
    }
  }
}

console.log(`${checked} templates checked, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
