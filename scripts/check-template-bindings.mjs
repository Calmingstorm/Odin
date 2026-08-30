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
  const reads = new Set();

  function memberName(member) {
    if (!member.computed && member.property?.type === 'Identifier') {
      return member.property.name;
    }
    if (member.computed && member.property?.type === 'StringLiteral') {
      return member.property.value;
    }
    return null;
  }

  walk(renderAst, node => {
    // Callable bindings (the original guard).
    if (['CallExpression', 'OptionalCallExpression'].includes(node.type)) {
      const callee = node.callee;
      if (['MemberExpression', 'OptionalMemberExpression'].includes(callee?.type)
          && callee.object?.type === 'Identifier' && callee.object.name === '_ctx') {
        const name = memberName(callee);
        if (name) calls.add(name);
      }
      return;
    }
    // Property READS (W5 extension): a template rendering
    // _ctx.editingServer?.url_display compiles, renders undefined, and the
    // block silently never appears — the #290 class. Every _ctx member
    // access must resolve, optional chains included; runtime instance
    // properties ($slots, $emit, ...) are the compiler's, not setup()'s.
    if (['MemberExpression', 'OptionalMemberExpression'].includes(node.type)
        && node.object?.type === 'Identifier' && node.object.name === '_ctx') {
      const name = memberName(node);
      if (name && !name.startsWith('$')) reads.add(name);
    }
  });

  return { calls, reads };
}

export function inspectSource(source, file = '<source>') {
  const ast = parse(source, { sourceType: 'module' });
  const components = [];

  function collectProps(propsProperty, label) {
    const names = new Set();
    if (!propsProperty) return names;
    const value = propsProperty.value;
    if (value?.type === 'ArrayExpression') {
      for (const el of value.elements) {
        if (el?.type === 'StringLiteral') names.add(el.value);
      }
    } else if (value?.type === 'ObjectExpression') {
      for (const property of value.properties) {
        const name = propertyName(property);
        if (name) names.add(name);
      }
    } else {
      throw new Error(`${label}: props must be a static array or object`);
    }
    return names;
  }

  walk(ast, node => {
    if (node.type !== 'ObjectExpression') return;
    const template = node.properties.find(property => propertyName(property) === 'template');
    const setup = node.properties.find(property => propertyName(property) === 'setup');
    const props = node.properties.find(property => propertyName(property) === 'props');
    if (!template) return;

    const line = node.loc?.start.line || '?';
    const label = `${file}:${line}`;
    const text = templateText(template, label);
    const { calls: called, reads } = directContextCalls(text, label);
    const exposed = setup ? collectSetupBindings(setup, label) : new Set();
    // Declared props are template-visible without appearing in the setup
    // return — the compiler resolves them from the props object at runtime.
    for (const name of collectProps(props, label)) exposed.add(name);
    const missing = [...called].filter(name => !exposed.has(name)).sort();
    const missingReads = [...reads]
      .filter(name => !exposed.has(name) && !called.has(name)).sort();
    components.push({ label, called, reads, exposed, missing, missingReads });
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

  // The #290 regression shape: a property READ (optional chain included)
  // whose root was never returned from setup(). The runtime renders the
  // block as permanently absent with no error anywhere.
  const darkRead = inspectSource(`
    export default {
      template: \`<div v-if="editingServer?.url_display">{{ editingServer.url_display }}</div><p>{{ shown }}</p>\`,
      setup() { return { shown: 'x' }; },
    };
  `, '<dark-read-fixture>');
  if (darkRead.length !== 1 || darkRead[0].missingReads.join(',') !== 'editingServer') {
    throw new Error('binding guard failed to detect its unresolved-read regression fixture');
  }
  const propRead = inspectSource(`
    export default {
      props: ['detail'],
      template: \`<div>{{ detail?.name }}</div>\`,
      setup() { return {}; },
    };
  `, '<prop-read-fixture>');
  if (propRead.length !== 1 || propRead[0].missingReads.length !== 0) {
    throw new Error('binding guard flagged a declared prop as a dark read');
  }
  const scopedRead = inspectSource(`
    export default {
      template: \`<ul><li v-for="(item, i) in rows" :key="i">{{ item.name }} {{ $emit }}</li></ul>\`,
      setup() { return { rows: [] }; },
    };
  `, '<scoped-read-fixture>');
  if (scopedRead.length !== 1 || scopedRead[0].missingReads.length !== 0) {
    throw new Error('binding guard flagged v-for locals or runtime properties as dark reads');
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
      for (const name of component.missingReads) {
        failures++;
        console.error(`FAIL ${component.label}: template reads ${name}, but setup() does not return ${name}`);
      }
    }
  } catch (error) {
    failures++;
    console.error(`FAIL ${displayFile}: ${error.message}`);
  }
}

console.log(`${checkedComponents} page component templates checked, ${checkedCalls} callable bindings checked (+ property reads), ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
