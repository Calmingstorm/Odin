#!/usr/bin/env node
/**
 * Verify that functions invoked by page templates are exposed by setup().
 *
 * Vue's runtime compiler accepts unresolved identifiers and only fails when the
 * affected render path executes. A page can therefore appear healthy while a
 * v-for is empty, then go blank as soon as the first row calls a missing helper.
 * Compile each page template with prefixIdentifiers, find direct _ctx helper
 * calls in the generated render function, and compare them with setup()'s
 * returned bindings.
 */
import { compile } from '@vue/compiler-dom';
import { parse } from '@babel/parser';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const PAGE_ROOT = fileURLToPath(new URL('../ui/js/pages/', import.meta.url));

function* jsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* jsFiles(path);
    else if (name.endsWith('.js')) yield path;
  }
}

function propertyName(property) {
  if (!property || property.computed || !property.key) return null;
  if (property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'StringLiteral') return property.key.value;
  return null;
}

function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra'].includes(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child?.type) walk(child, visitor);
      }
    } else if (value?.type) {
      walk(value, visitor);
    }
  }
}

function isFunctionNode(node) {
  return node && [
    'ArrowFunctionExpression',
    'FunctionDeclaration',
    'FunctionExpression',
    'ObjectMethod',
  ].includes(node.type);
}

function setupFunction(setupProperty) {
  if (setupProperty.type === 'ObjectMethod') return setupProperty;
  if (setupProperty.type === 'ObjectProperty' && isFunctionNode(setupProperty.value)) {
    return setupProperty.value;
  }
  return null;
}

function collectSetupBindings(setupProperty, label) {
  const fn = setupFunction(setupProperty);
  if (!fn) throw new Error(`${label}: setup must be a function`);

  const returnBindings = [];

  function collectObject(object) {
    const bindings = new Set();
    for (const property of object.properties) {
      if (property.type === 'SpreadElement') {
        throw new Error(`${label}: setup() return spreads cannot be verified statically`);
      }
      const name = propertyName(property);
      if (!name) {
        throw new Error(`${label}: setup() return has a computed or unsupported key`);
      }
      bindings.add(name);
    }
    returnBindings.push(bindings);
  }

  const body = fn.body;
  if (body.type === 'ObjectExpression') {
    collectObject(body);
  } else {
    function visit(node, root = false) {
      if (!node || typeof node !== 'object') return;
      if (!root && isFunctionNode(node)) return;

      if (node.type === 'ReturnStatement' && node.argument?.type === 'ObjectExpression') {
        collectObject(node.argument);
      }

      for (const [key, value] of Object.entries(node)) {
        if (['loc', 'start', 'end', 'extra'].includes(key)) continue;
        if (Array.isArray(value)) {
          for (const child of value) {
            if (child?.type) visit(child);
          }
        } else if (value?.type) {
          visit(value);
        }
      }
    }
    visit(body, true);
  }

  if (returnBindings.length === 0) {
    throw new Error(`${label}: setup() has no statically verifiable object return`);
  }

  // A binding is safe only if every possible setup() object return exposes it.
  // Unioning branch returns would let one render path retain the original bug.
  return returnBindings.slice(1).reduce(
    (common, bindings) => new Set([...common].filter(name => bindings.has(name))),
    returnBindings[0],
  );
}

function templateText(templateProperty, label) {
  if (templateProperty.type !== 'ObjectProperty') {
    throw new Error(`${label}: template must be an object property`);
  }
  const value = templateProperty.value;
  if (value.type === 'StringLiteral') return value.value;
  if (value.type === 'TemplateLiteral' && value.expressions.length === 0) {
    return value.quasis[0].value.cooked;
  }
  throw new Error(`${label}: template must be a static string`);
}

function directContextCalls(template, label) {
  const compiled = compile(template, {
    mode: 'function',
    prefixIdentifiers: true,
    onError(error) { throw error; },
    onWarn(warning) { throw warning; },
  }).code;
  const renderAst = parse(`function __compiled_template__(Vue) {\n${compiled}\n}`, {
    sourceType: 'script',
  });
  const calls = new Set();

  walk(renderAst, node => {
    if (!['CallExpression', 'OptionalCallExpression'].includes(node.type)) return;
    const callee = node.callee;
    if (!['MemberExpression', 'OptionalMemberExpression'].includes(callee?.type)) return;
    if (callee.object?.type !== 'Identifier' || callee.object.name !== '_ctx') return;

    if (!callee.computed && callee.property?.type === 'Identifier') {
      calls.add(callee.property.name);
    } else if (callee.computed && callee.property?.type === 'StringLiteral') {
      calls.add(callee.property.value);
    }
  });

  return calls;
}

export function inspectSource(source, file = '<source>') {
  const ast = parse(source, { sourceType: 'module' });
  const components = [];

  walk(ast, node => {
    if (node.type !== 'ObjectExpression') return;
    const template = node.properties.find(property => propertyName(property) === 'template');
    const setup = node.properties.find(property => propertyName(property) === 'setup');
    if (!template) return;

    const line = node.loc?.start.line || '?';
    const label = `${file}:${line}`;
    const text = templateText(template, label);
    const called = directContextCalls(text, label);
    const exposed = setup ? collectSetupBindings(setup, label) : new Set();
    const missing = [...called].filter(name => !exposed.has(name)).sort();
    components.push({ label, called, exposed, missing });
  });

  return components;
}

function assertGuardFixtures() {
  const valid = inspectSource(`
    export default {
      template: \`<button @click="save(item)">{{ format(item) }} {{ Math.min(2, 3) }} {{ item.trim() }}</button>\`,
      setup() {
        function save() {}
        function format() {}
        return { save, format };
      },
    };
  `, '<valid-fixture>');
  if (valid.length !== 1 || valid[0].missing.length !== 0) {
    throw new Error('binding guard rejected its valid regression fixture');
  }

  const noSetup = inspectSource(`
    export default { template: \`<button @click="missing()">Broken</button>\` };
  `, '<no-setup-fixture>');
  if (noSetup.length !== 1 || noSetup[0].missing.join(',') !== 'missing') {
    throw new Error('binding guard failed to check a page component without setup()');
  }

  const invalid = inspectSource(`
    export default {
      template: \`<div v-if="rows.length"><span v-for="row in rows">{{ missing(row) }}</span></div>\`,
      setup() { return { rows: [] }; },
    };
  `, '<invalid-fixture>');
  if (invalid.length !== 1 || invalid[0].missing.join(',') !== 'missing') {
    throw new Error('binding guard failed to detect its unresolved-call regression fixture');
  }
}

assertGuardFixtures();

let checkedComponents = 0;
let checkedCalls = 0;
let failures = 0;
for (const file of jsFiles(PAGE_ROOT)) {
  const displayFile = relative(process.cwd(), file);
  try {
    const components = inspectSource(readFileSync(file, 'utf8'), displayFile);
    for (const component of components) {
      checkedComponents++;
      checkedCalls += component.called.size;
      for (const name of component.missing) {
        failures++;
        console.error(`FAIL ${component.label}: template calls ${name}(), but setup() does not return ${name}`);
      }
    }
  } catch (error) {
    failures++;
    console.error(`FAIL ${displayFile}: ${error.message}`);
  }
}

console.log(`${checkedComponents} page component templates checked, ${checkedCalls} callable bindings checked, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
