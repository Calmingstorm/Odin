import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse as parseJs } from '@babel/parser';
import { parse as parseTemplate, NodeTypes } from '@vue/compiler-dom';

const config = readFileSync('ui/js/pages/config.js', 'utf8');
const configAst = parseJs(config, { sourceType: 'module' });
const llm = readFileSync('ui/js/pages/llm-config.js', 'utf8');
const css = readFileSync('ui/css/style.css', 'utf8');
const discord = readFileSync('ui/js/pages/discord-config.js', 'utf8');
const hostAccess = readFileSync('ui/js/pages/host-access.js', 'utf8');
const discordUserCombobox = readFileSync('ui/js/discord-user-combobox.js', 'utf8');
const apiTokens = readFileSync('ui/js/pages/api-tokens.js', 'utf8');

function pageTemplate(source, label, ast = parseJs(source, { sourceType: 'module' })) {
  for (const statement of ast.program.body) {
    if (statement.type !== 'ExportDefaultDeclaration' || statement.declaration?.type !== 'ObjectExpression') continue;
    const property = statement.declaration.properties.find(candidate =>
      candidate.type === 'ObjectProperty'
      && !candidate.computed
      && ((candidate.key.type === 'Identifier' && candidate.key.name === 'template')
        || (candidate.key.type === 'StringLiteral' && candidate.key.value === 'template'))
    );
    if (property?.value.type === 'TemplateLiteral' && property.value.expressions.length === 0) {
      return property.value.quasis[0].value.cooked;
    }
    if (property?.value.type === 'StringLiteral') return property.value.value;
  }
  throw new Error(`${label} has no static page template`);
}

function walkTemplate(node, visitor) {
  visitor(node);
  if (node.type === NodeTypes.ROOT || node.type === NodeTypes.ELEMENT) {
    for (const child of node.children || []) walkTemplate(child, visitor);
  }
  if (node.type === NodeTypes.IF) {
    for (const branch of node.branches) walkTemplate(branch, visitor);
  }
  if (node.type === NodeTypes.IF_BRANCH || node.type === NodeTypes.FOR) {
    for (const child of node.children || []) walkTemplate(child, visitor);
  }
}

function directives(element, eventName) {
  if (element.type !== NodeTypes.ELEMENT) return [];
  return element.props.filter(property =>
    property.type === NodeTypes.DIRECTIVE
    && property.name === 'on'
    && property.arg?.isStatic
    && property.arg.content === eventName
  );
}

function walkJs(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra'].includes(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child?.type) walkJs(child, visitor);
      }
    } else if (value?.type) {
      walkJs(value, visitor);
    }
  }
}

function namedFunction(ast, name) {
  const matches = [];
  walkJs(ast, node => {
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) matches.push(node);
  });
  assert.equal(matches.length, 1, `expected one ${name}() declaration`);
  return matches[0];
}

function isRefMember(node, refName) {
  return node?.type === 'MemberExpression'
    && !node.computed
    && node.object?.type === 'Identifier'
    && node.object.name === refName
    && node.property?.type === 'Identifier'
    && node.property.name === 'value';
}

function isBareReturn(statement) {
  return statement?.type === 'ReturnStatement' && statement.argument == null;
}

const configTemplateAst = parseTemplate(pageTemplate(config, 'Config Center', configAst));
const textInputs = [];
const numericInputs = [];
walkTemplate(configTemplateAst, node => {
  if (node.type !== NodeTypes.ELEMENT || node.tag !== 'input') return;
  const staticType = node.props.find(property =>
    property.type === NodeTypes.ATTRIBUTE && property.name === 'type'
  )?.value?.content;
  if (staticType === 'text') textInputs.push(node);
  if (staticType === 'number') numericInputs.push(node);
});
const editableTextInput = textInputs.find(input =>
  directives(input, 'input').some(directive => directive.exp?.content.includes('setFieldValue'))
);
assert.ok(editableTextInput, 'typed text editor missing');
assert.equal(
  directives(editableTextInput, 'blur').map(directive => directive.exp?.content).join(','),
  'endTextInputEdit(field.path)',
  'text editor blur must not run numeric draft parsing',
);
assert.equal(
  directives(editableTextInput, 'input').map(directive => directive.exp?.content).join(','),
  'setFieldValue(field, $event.target.value, { coalesce: true })',
  'text editor must preserve the event value as a string',
);
assert.ok(
  numericInputs.some(input => directives(input, 'blur').some(directive => directive.exp?.content === 'endInputEdit(field)')),
  'numeric editor lost its numeric blur validation',
);

for (const section of ['llm_provider', 'openai_codex', 'ollama', 'kimi', 'personality', 'discord']) {
  assert.match(config, new RegExp(`CONFIG_EXCLUDED_SECTIONS[\\s\\S]*['"]${section}['"]`), `${section} returned to Config`);
}
for (const prefix of ['web.api_tokens', 'outbound_webhooks.targets']) {
  assert.match(config, new RegExp(`CONFIG_EXCLUDED_PATH_PREFIXES[\\s\\S]*['"]${prefix.replaceAll('.', '\\.') }['"]`), `${prefix} returned to Config`);
}
assert.match(config, /path === prefix \|\| path\.startsWith\(`\$\{prefix\}\.\`\)/, 'owned container exclusion is not prefix-aware');
assert.match(discord, /Global defaults[\s\S]*saveGlobalDefaults/s, 'Discord owner page did not absorb global defaults');
assert.match(discord, /api\.put\('\/api\/config', \{ discord:/, 'Discord global defaults do not save their canonical section');
assert.doesNotMatch(discord, /Bot credential configured/, 'Discord page reports an unverified credential state');
assert.match(apiTokens, /Manage API tokens[\s\S]*api\.get\('\/api\/tokens'\)/s, 'API Tokens owner page does not own the token collection');
assert.doesNotMatch(config, /OWNER_LINKS|sectionOwner\(|Temporary expert JSON editor|setJsonFieldValue|Edit section|meta\.value\?\.status\?\.counts/, 'legacy owner/edit/JSON gate returned');
const expandedFunction = namedFunction(configAst, 'isSectionExpanded');
const expandedStatements = expandedFunction.body.body;
assert.equal(expandedStatements.at(-1)?.type, 'ReturnStatement', 'section expansion has no desktop default');
assert.equal(expandedStatements.at(-1)?.argument?.type, 'BooleanLiteral', 'desktop section default is not a boolean');
assert.equal(expandedStatements.at(-1)?.argument?.value, true, 'desktop sections are not default-expanded');
assert.match(config, /if \(isMobile\.value\) return mobileDefaultSection\(section\) === section;/, 'mobile one-section model is missing');
assert.match(config, /fieldGroups\(section\)/, 'nested schema leaves are not grouped');
assert.match(config, /descriptionRecord\?\.group_description \|\| null/, 'nested groups do not consume registry group descriptions');
assert.doesNotMatch(config, /descendants\.find\(field => field\.group_description\)/, 'synthetic parent metadata still aggregates leaf descriptions');
assert.match(config, /field\.type === 'integer' \|\| field\.type === 'number'/, 'typed numeric editor missing');
assert.doesNotMatch(config, /Number\.parseInt\(raw/, 'integer controls silently truncate decimals');
assert.match(config, /inputDrafts/, 'numeric intermediate state missing');
assert.match(config, /if \(!segments\.length\) return value;/, 'scalar root sections are not editable');
assert.match(config, /setFieldValue\(field, parsed, \{ coalesce: true \}\)/, 'typed numeric drafts do not commit on blur');
assert.match(config, /UNDO_COALESCE_MS/, 'text edit undo coalescing missing');
assert.match(config, /agents\.final_warning_iterations/, 'warning-threshold chip editor missing');
assert.match(config, /No unsaved changes/, 'honest draft copy missing');
assert.match(config, /groupRuntimeSummaries[\s\S]*fieldRuntimeCopy/, 'grouped plain-language save/runtime effects missing');
assert.match(config, /field\.action_available === true/, 'honest action gate missing');
const restartButtons = [];
walkTemplate(configTemplateAst, node => {
  if (node.type !== NodeTypes.ELEMENT || node.tag !== 'button') return;
  if (directives(node, 'click').some(directive => directive.exp?.content === 'restartOdin')) restartButtons.push(node);
});
assert.ok(restartButtons.length > 0, 'restart affordance missing');
for (const button of restartButtons) {
  const disabled = button.props.filter(property =>
    property.type === NodeTypes.DIRECTIVE
    && property.name === 'bind'
    && property.arg?.isStatic
    && property.arg.content === 'disabled'
  );
  assert.equal(disabled.map(directive => directive.exp?.content).join(','), 'restartScheduled', 'restart action bypasses its in-flight guard');
}
const restartFunction = namedFunction(configAst, 'restartOdin');
const restartGuard = restartFunction.body.body[0];
assert.equal(restartGuard?.type, 'IfStatement', 'restartOdin() lost its in-flight guard');
assert.ok(isRefMember(restartGuard.test, 'restartScheduled'), 'restartOdin() guard does not check restartScheduled');
assert.ok(isBareReturn(restartGuard.consequent), 'restartOdin() does not stop an overlapping restart');
const pollFunction = namedFunction(configAst, 'pollRestartStatus');
const pollGuard = pollFunction.body.body[0];
assert.equal(pollGuard?.type, 'IfStatement', 'restart polling lost its scheduled-state guard');
assert.equal(pollGuard.test?.type, 'UnaryExpression', 'restart polling guard must negate restartScheduled');
assert.equal(pollGuard.test?.operator, '!', 'restart polling guard must negate restartScheduled');
assert.ok(isRefMember(pollGuard.test?.argument, 'restartScheduled'), 'restart polling guard does not check restartScheduled');
assert.ok(isBareReturn(pollGuard.consequent), 'restart polling continues without a scheduled restart');
let freshMetaAssignment = false;
let proofBoundClear = false;
walkJs(pollFunction.body, node => {
  if (node.type === 'AssignmentExpression'
      && isRefMember(node.left, 'meta')
      && node.right?.type === 'AwaitExpression'
      && node.right.argument?.type === 'CallExpression'
      && node.right.argument.callee?.name === 'loadConfigMeta') {
    freshMetaAssignment = true;
  }
  if (node.type !== 'IfStatement' || node.test?.type !== 'BinaryExpression' || node.test.operator !== '===') return;
  const comparesPendingZero = (isRefMember(node.test.left, 'pendingRestartCount') && node.test.right?.value === 0)
    || (isRefMember(node.test.right, 'pendingRestartCount') && node.test.left?.value === 0);
  if (!comparesPendingZero) return;
  walkJs(node.consequent, child => {
    if (child.type === 'AssignmentExpression'
        && isRefMember(child.left, 'restartScheduled')
        && child.right?.type === 'BooleanLiteral'
        && child.right.value === false) proofBoundClear = true;
  });
});
assert.ok(freshMetaAssignment, 'restart polling does not refresh authoritative metadata');
assert.ok(proofBoundClear, 'restart success is not bound to fresh zero-pending metadata');

for (const provider of ['codex', 'ollama', 'kimi']) {
  assert.match(llm, new RegExp(`advancedOpen\\.${provider}`), `${provider} advanced expander missing`);
}
for (const field of ['request_timeout_seconds', 'stream_stall_timeout_seconds', 'retry.max_retries', 'connection_pool.max_connections', 'context_compression.max_context_chars']) {
  const parts = field.split('.');
  assert.ok(parts.every(part => llm.includes(part)), `Codex advanced field missing: ${field}`);
}
assert.ok((llm.match(/v-model\.number="(?:ollama|kimi)Form\.timeout"/g) || []).length === 2, 'provider timeout controls drifted');
assert.match(llm, /Unsupported by the current Codex provider/, 'unsupported max_tokens is not labelled');
for (const field of ['effective_connection_pool', 'connection_pool_pending_restart', 'effective_context_compression', 'context_compression_pending_restart']) {
  assert.ok(llm.includes(field), `Codex owner page does not consume status truth: ${field}`);
}
assert.doesNotMatch(llm, /These settings reload through the Codex provider endpoint|Connection-pool changes rebuild its transport/, 'boot-bound settings are falsely described as live');
assert.match(llm, /Transport and retry changes apply now[\s\S]*saved for the next restart/, 'advanced apply-boundary copy is missing');
assert.match(css, /\.cfgc-field\s*\{[^}]*grid-template-columns:\s*minmax\([^}]*4fr[^}]*5fr/s, 'wide two-column field grid missing');
assert.match(css, /\.config-center-page\s*\{[^}]*max-width:\s*1600px/s, 'wide shell has no readable max width');

assert.match(css, /\.cfgc-field-copy\s*\{[^}]*padding-inline:\s*var\(--hm-space-4\)/s, 'field-card copy still rides the inner vertical rule');
for (const page of [hostAccess, discord]) {
  assert.match(page, /DiscordUserCombobox/, 'Discord user picker is not shared with both owner pages');
  assert.match(page, /<discord-user-combobox/, 'owner page does not render the shared Discord user picker');
}
for (const key of ['allowed_users', 'ignore_bot_ids']) {
  assert.match(discord, new RegExp(`key: ['"]${key}['"][^}]*userAutocomplete: true`), `${key} lost Discord user autocomplete`);
}
assert.match(discord, /api\.get\(['"]\/api\/discord\/members['"]\)/, 'Discord defaults do not load the known-user source');
assert.match(discord, /:members="globalMembers"/, 'Discord defaults do not pass known users into the shared picker');
assert.match(discordUserCombobox, /emits:\s*\[['"]select['"]\]/, 'shared Discord user picker lost selection output');
assert.match(discordUserCombobox, /\^\\d\{15,25\}\$/, 'shared Discord user picker lost raw snowflake support');

console.log('config-center-ui2: de-dup, typed editing, restart flow, and provider advanced controls pinned');

const internals = readFileSync('ui/js/pages/internals.js', 'utf8');
assert.doesNotMatch(config, /<div class="cfgc-field-runtime">/, 'repetitive per-field save/runtime boxes returned');
assert.match(config, /runtime_summaries:\s*groupRuntimeSummaries\(group\.entries\)/, 'runtime behavior is not summarized once per field group');
assert.match(config, /No activation control exists in this release/, 'activation-required fields still lead to a dead end');
assert.match(css, /\.config-center-page\s*\{[^}]*height:\s*calc\(100vh[^}]*display:\s*flex[^}]*overflow:\s*hidden/s, 'Config Center does not own an internal scrolling viewport');
assert.match(css, /\.cfgc-main\s*\{[^}]*overflow-y:\s*auto/s, 'settings list is not the scrolling region');
assert.match(css, /\.cfgc-workspace\s*\{[^}]*align-items:\s*stretch[^}]*overflow:\s*hidden/s, 'desktop workspace no longer constrains its grid items to the internal viewport');
assert.match(css, /\.cfgc-main\s*\{[^}]*height:\s*100%[^}]*overflow-y:\s*auto/s, 'settings list can grow to content height instead of shrinking into its scroll region');
assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.cfgc-workspace\s*\{[^}]*align-items:\s*start[^}]*overflow:\s*visible[^}]*\}[\s\S]*?\.cfgc-main\s*\{[^}]*height:\s*auto[^}]*overflow:\s*visible/s, 'mobile Config Center no longer restores document-flow scrolling');
assert.match(internals, /failedEndpointSummary/, 'Internals does not name failed endpoints');
for (const endpoint of ['/api/pools/ssh', '/api/compression/stats']) {
  assert.ok(internals.includes(endpoint), `Internals endpoint inventory missing ${endpoint}`);
}
