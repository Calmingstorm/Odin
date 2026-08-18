import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse as parseJs } from '@babel/parser';
import { parse as parseTemplate, NodeTypes } from '@vue/compiler-dom';
import { guildBehaviorValue } from '../ui/js/discord-config-policy.js';
import { findVerticalScrollOwner } from '../ui/js/config-scroll-owner.js';
import {
  codexAdvancedPayload, codexBasicPayload,
  kimiAdvancedPayload, kimiBasicPayload,
  ollamaAdvancedPayload, ollamaBasicPayload,
} from '../ui/js/llm-config-payloads.js';

const config = readFileSync('ui/js/pages/config.js', 'utf8');
const configAst = parseJs(config, { sourceType: 'module' });
const llm = readFileSync('ui/js/pages/llm-config.js', 'utf8');
const css = readFileSync('ui/css/style.css', 'utf8');
const discord = readFileSync('ui/js/pages/discord-config.js', 'utf8');
const discordPolicy = readFileSync('ui/js/discord-config-policy.js', 'utf8');
const hostAccess = readFileSync('ui/js/pages/host-access.js', 'utf8');
const discordUserCombobox = readFileSync('ui/js/discord-user-combobox.js', 'utf8');
const apiTokens = readFileSync('ui/js/pages/api-tokens.js', 'utf8');
const readme = readFileSync('README.md', 'utf8');

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
assert.match(config, /Read-only here\. Edit this collection in config\.yml\./, 'public structured containers do not name their real edit path');
assert.match(config, /Values are hidden\. <\/template><template v-if="field\.structured_container_child">Part of a structured collection\. <\/template>Read-only here\. Edit this collection in config\.yml\./, 'secret containers do not name their safe read-only shape and edit path');
assert.match(config, /field\.structured_container \|\| field\.structured_container_child/, 'container descendants no longer use the read-only summary path');
assert.match(config, /Part of a structured collection\./, 'container descendants do not explain why they are read-only');
assert.match(config, /!field\.structured_container_child/, 'scalar arrays do not exclude structured-container descendants');
assert.match(config, /!field\.structured_container/, 'scalar arrays do not defer to the registry container marker');
assert.doesNotMatch(config, /STRUCTURED_CONTAINER_PATHS/, 'duplicated local container-path registry returned');
assert.match(config, /function structuredApplyCopy\(field\)/, 'structured containers do not explain their real apply boundary');
assert.ok(config.includes("live_apply: 'Dedicated live apply'"), 'live-apply badge implies generic Config reload');
assert.equal(config.includes("live_apply: 'Reloads live'"), false, 'stale generic-reload badge returned');
assert.match(config, /No activation control exists in this release/, 'activation-required containers imply a nonexistent flow');
assert.doesNotMatch(config, /purpose-built table is required before release/i, 'temporary release-gate copy returned');
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
const reviewPendingFunction = namedFunction(configAst, 'reviewPendingRestart');
let derivesScrollOwner = false;
let resetsDerivedOwner = false;
walkJs(reviewPendingFunction.body, node => {
  if (node.type === 'CallExpression'
      && node.callee?.type === 'Identifier'
      && node.callee.name === 'findVerticalScrollOwner'
      && node.arguments?.some(argument => isRefMember(argument, 'configMain'))) {
    derivesScrollOwner = true;
  }
  if (node.type === 'AssignmentExpression'
      && node.operator === '='
      && node.left?.type === 'MemberExpression'
      && node.left.object?.name === 'scrollOwner'
      && node.left.property?.name === 'scrollTop'
      && node.right?.value === 0) resetsDerivedOwner = true;
});
assert.ok(derivesScrollOwner, 'Review settings does not derive the active scroll owner from rendered geometry');
assert.ok(resetsDerivedOwner, 'Review settings does not reset the geometry-derived scroll owner');
let reviewReadsMobileBreakpoint = false;
walkJs(reviewPendingFunction.body, node => {
  if (isRefMember(node, 'isMobile')) reviewReadsMobileBreakpoint = true;
});
assert.equal(reviewReadsMobileBreakpoint, false, 'Review settings duplicates a JavaScript breakpoint instead of detecting the scroll owner');

function mockElement({ overflowY, clientHeight, scrollHeight, parentElement = null }) {
  return { overflowY, clientHeight, scrollHeight, parentElement, scrollTop: 0 };
}
const documentOwner800 = mockElement({ overflowY: 'auto', clientHeight: 800, scrollHeight: 2400 });
const configMain800 = mockElement({ overflowY: 'visible', clientHeight: 1500, scrollHeight: 1500, parentElement: documentOwner800 });
assert.equal(
  findVerticalScrollOwner(configMain800, { getStyle: element => ({ overflowY: element.overflowY }), fallback: null }),
  documentOwner800,
  '800px intermediate layout does not select the real document-flow scroll owner',
);
const configMainDesktop = mockElement({ overflowY: 'auto', clientHeight: 500, scrollHeight: 5000, parentElement: documentOwner800 });
assert.equal(
  findVerticalScrollOwner(configMainDesktop, { getStyle: element => ({ overflowY: element.overflowY }), fallback: null }),
  configMainDesktop,
  'desktop layout does not select the internal Config Center scroll region',
);
assert.match(config, /<main ref="configMain" class="cfgc-main">/, 'Config Center scroll region is not bound to configMain');

for (const provider of ['codex', 'ollama', 'kimi']) {
  assert.match(llm, new RegExp(`advancedOpen\\.${provider}`), `${provider} advanced expander missing`);
}
for (const field of ['request_timeout_seconds', 'stream_stall_timeout_seconds', 'retry.max_retries', 'connection_pool.max_connections', 'context_compression.max_context_chars']) {
  const parts = field.split('.');
  assert.ok(parts.every(part => llm.includes(part)), `Codex advanced field missing: ${field}`);
}
assert.ok((llm.match(/v-model\.number="(?:ollama|kimi)Form\.timeout"/g) || []).length === 2, 'provider timeout controls drifted');
assert.doesNotMatch(llm, /codexForm\.max_tokens|current Codex provider[\s\S]*max_tokens/, 'removed Codex max_tokens control returned');
assert.doesNotMatch(readme, /openai_codex[^\n]*max tokens/i, 'README restored the removed Codex max-tokens setting');
assert.doesNotMatch(readme, /All providers are configured from the WebUI with inline auto-save/, 'README falsely claims the explicit-save Codex Advanced panel auto-saves');
assert.match(readme, /Codex Advanced panel uses an explicit save action/, 'README does not disclose the Codex Advanced save action');
assert.match(readme, /Codex connection-pool and context-compression changes are saved immediately but require an Odin restart/, 'README falsely claims every provider setting applies without restart');
for (const field of ['effective_connection_pool', 'connection_pool_pending_restart', 'effective_context_compression', 'context_compression_pending_restart']) {
  assert.ok(llm.includes(field), `Codex owner page does not consume status truth: ${field}`);
}
assert.doesNotMatch(llm, /These settings reload through the Codex provider endpoint|Connection-pool changes rebuild its transport/, 'boot-bound settings are falsely described as live');
assert.match(llm, /Transport and retry changes apply to the primary client now[\s\S]*existing auxiliary client keeps the transport and retry settings captured when it was built until it is rebuilt[\s\S]*saved for the next restart/, 'advanced apply-boundary copy drifted from the registry truth');
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
assert.match(discordUserCombobox, /export function discordMemberDisplayName\(member\)/, 'shared Discord display-name precedence is not reusable');
assert.match(discordUserCombobox, /member\?\.display_name \|\| member\?\.username \|\| member\?\.id/, 'Discord display-name precedence drifted');
assert.match(discord, /globalItemLabel\(editor, item\)/, 'Discord global chips still render raw user IDs');
assert.match(discord, /globalMembersById\.value\.get\(id\)/, 'Discord global chips do not resolve IDs through loaded members');
assert.match(discord, /member \? discordMemberDisplayName\(member\) : id/, 'unknown Discord users no longer fall back to raw IDs');
assert.match(discord, /key: ['"]channels['"][^}]*fullWidth: true/, 'Allowed channels is no longer full-width');
assert.match(discord, /'discord-global-list-full': editor\.fullWidth/, 'Discord global list width no longer follows editor metadata');
assert.match(discord, /ordinary conversational intake, allowed users and channels are absolute global gates/, 'Discord page no longer distinguishes scoped absolute intake gates');
assert.match(discord, /Prefix commands use separate authorization[\s\S]*test webhooks bypass the user gate/, 'Discord page hides the non-conversational authorization exceptions');
assert.match(discord, /explicit mention bypasses the ignored-bot list/, 'Discord page no longer discloses the ignored-bot mention bypass');
assert.match(discordPolicy, /guild\?\.config\?\.\[key\] != null[\s\S]*globalDefaults\?\.\[key\]/, 'guild behavior does not treat null as no override and fall back to loaded globals');
assert.equal(guildBehaviorValue({ config: {} }, 'require_mention', { require_mention: true }), true, 'global require_mention=true is displayed as false on a guild without an override');
assert.equal(guildBehaviorValue({ config: {} }, 'respond_to_bots', { respond_to_bots: true }), true, 'global respond_to_bots=true is displayed as false on a guild without an override');
assert.equal(guildBehaviorValue({ config: { require_mention: false } }, 'require_mention', { require_mention: true }), false, 'guild override no longer wins over the loaded global default');
assert.equal(guildBehaviorValue({ config: { require_mention: null } }, 'require_mention', { require_mention: true }), true, 'legacy null guild override does not inherit global require_mention=true');
assert.equal(guildBehaviorValue({ config: {} }, 'require_mention', null), undefined, 'missing globals invent a false behavior value');
assert.match(discord, /async function fetchAll\(\)[\s\S]*api\.get\('\/api\/discord\/guilds'\)[\s\S]*api\.get\('\/api\/config'\)[\s\S]*globalConfig\.value = loadedGlobalConfig;[\s\S]*guilds\.value = loadedGuilds;/, 'initial Discord load does not establish global defaults before guild rendering');
assert.match(discord, /guildBehaviorValue\(guild, 'require_mention', globalConfig\.value\)/, 'guild mention toggle does not use loaded global defaults');
assert.match(discord, /guildBehaviorValue\(guild, 'respond_to_bots', globalConfig\.value\)/, 'guild bot toggle does not use loaded global defaults');


const providerForm = {
  enabled: true,
  model: 'draft-model',
  reasoning_effort: 'high',
  agent_reasoning_effort: 'low',
  agent_model: 'draft-agent',
  base_url: 'http://127.0.0.1:11434',
  api_key: 'replacement-key',
  max_tokens: 8192,
  request_timeout_seconds: 9876,
  stream_stall_timeout_seconds: 876,
  retry: { max_retries: 9, base_delay: 4, max_delay: 40 },
  connection_pool: { max_connections: 19, keepalive_timeout: 41 },
  context_compression: { enabled: false, max_context_chars: 123456, keep_recent_iterations: 11 },
  context_budget_overrides: { 'gpt-5.6-sol': 800000 },
  context_utilization: 72,
  timeout: 777,
};
const expectedPayloadKeys = new Map([
  [codexBasicPayload, ['agent_model', 'agent_reasoning_effort', 'enabled', 'model', 'reasoning_effort']],
  [codexAdvancedPayload, ['connection_pool', 'context_budget_overrides', 'context_compression', 'context_utilization', 'request_timeout_seconds', 'retry', 'stream_stall_timeout_seconds']],
  [ollamaBasicPayload, ['base_url', 'enabled', 'max_tokens', 'model']],
  [ollamaAdvancedPayload, ['timeout']],
  [kimiBasicPayload, ['enabled', 'max_tokens', 'model']],
  [kimiAdvancedPayload, ['timeout']],
]);
for (const [builder, keys] of expectedPayloadKeys) {
  assert.deepEqual(Object.keys(builder(providerForm)).sort(), keys, `${builder.name} crossed its save boundary`);
}
assert.deepEqual(
  Object.keys(ollamaBasicPayload(providerForm, { includeApiKey: true })).sort(),
  ['api_key', 'base_url', 'enabled', 'max_tokens', 'model'],
  'Ollama explicit key replacement left the basic save boundary',
);
assert.deepEqual(
  Object.keys(kimiBasicPayload(providerForm, { includeApiKey: true })).sort(),
  ['api_key', 'enabled', 'max_tokens', 'model'],
  'Kimi explicit key replacement left the basic save boundary',
);
assert.match(llm, /saveCodexConfig\(\)[\s\S]*codexBasicPayload\(codexForm\.value\)/, 'Codex basic auto-save does not use its field-only payload');
assert.match(llm, /saveOllamaConfig\(\)[\s\S]*ollamaBasicPayload\(ollamaForm\.value/, 'Ollama basic auto-save does not use its field-only payload');
assert.match(llm, /saveKimiConfig\(\)[\s\S]*kimiBasicPayload\(kimiForm\.value/, 'Kimi basic auto-save does not use its field-only payload');
assert.match(llm, /saveCodexAdvancedConfig\(\)[\s\S]*codexAdvancedPayload\(codexForm\.value\)/, 'Codex explicit Advanced save does not use its field-only payload');
assert.match(llm, /<strong>Context budgets<\/strong>/, 'Codex Advanced panel lost the Context budgets table');
assert.match(llm, /api\.get\('\/api\/context\/windows'\)/, 'Context budgets do not load backend derivation truth');
assert.match(llm, /api\.post\('\/api\/context\/windows\/clear'/, 'Context budgets lost account-scoped clamp clearing');
assert.match(llm, /details\.effective\?\.effective_budget/, 'effective budget is recomputed or not data-bound');
assert.match(llm, /details\.effective\?\.primary_chars/, 'resulting target is recomputed or not data-bound');
assert.doesNotMatch(llm, /921601|917506|270001|262146|124001/, 'browser duplicated the backend context-budget catalog');
assert.match(llm, /enabled: false, model: 'gpt-5\.6-sol', reasoning_effort: 'xhigh', agent_reasoning_effort: 'auto', agent_model: 'auto'/, 'LLM owner-page fallback defaults drifted from the schema');
assert.match(llm, /saveOllamaAdvancedConfig\(\)[\s\S]*ollamaAdvancedPayload\(ollamaForm\.value\)/, 'Ollama explicit Advanced save does not use its field-only payload');
assert.match(llm, /saveKimiAdvancedConfig\(\)[\s\S]*kimiAdvancedPayload\(kimiForm\.value\)/, 'Kimi explicit Advanced save does not use its field-only payload');
for (const provider of ['Codex', 'Ollama', 'Kimi']) {
  assert.match(llm, new RegExp(`fetchLLMStatus\\(\\{ preserveBasic: true, preserveAdvanced: true \\}\\)[\\s\\S]*fetch${provider}Status\\(\\)`), `${provider} save refresh can erase a live basic or Advanced draft`);
}
for (const mutation of ['setGuildConfig', 'setChannelConfig', 'clearOverride']) {
  const body = namedFunction(parseJs(discord, { sourceType: 'module' }), mutation);
  const source = discord.slice(body.start, body.end);
  assert.match(source, /fetchGuilds\(\{ showLoading: false \}\)/, `${mutation} does not refresh guild/channel data`);
  assert.doesNotMatch(source, /fetchAll|globalConfig|globalDraft|\/api\/config/, `${mutation} can replace a dirty global draft`);
}
const guildRefresh = namedFunction(parseJs(discord, { sourceType: 'module' }), 'fetchGuilds');
const guildRefreshSource = discord.slice(guildRefresh.start, guildRefresh.end);
assert.match(guildRefreshSource, /api\.get\('\/api\/discord\/guilds'\)/, 'override refresh does not reload guild data');
assert.doesNotMatch(guildRefreshSource, /\/api\/config|globalConfig|globalDraft/, 'guild-only refresh can overwrite global-default drafts');

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

const internalsBindings = [
  'sshPool.active_connections', 'sshPool.active_hosts', 'sshPool.total_opened', 'sshPool.total_reused',
  'pool.http_pool_active_connections', 'pool.http_pool_max_connections',
  'pool.http_pool_total_requests', 'pool.http_pool_keepalive_timeout',
  'pool.total_requests', 'pool.model',
  'riskStats.totals?.critical', 'riskStats.totals?.high', 'riskStats.totals?.medium', 'riskStats.totals?.low',
  'recoveryStats.totals?.attempts', 'recoveryStats.totals?.successes', 'recoveryStats.totals?.failures',
  'freshnessStats.total_checks', 'freshnessStats.stale_found', 'freshnessStats.fetch_failures',
];
for (const binding of internalsBindings) {
  assert.ok(internals.includes(binding), `Internals response binding missing: ${binding}`);
}
for (const staleBinding of [
  'sshPool.connections', 'httpPool.connections', 'riskStats.total ||',
  'recoveryStats.total ||', 'freshnessStats.total ||', 'freshnessStats.stale ||',
]) {
  assert.equal(internals.includes(staleBinding), false, `Internals stale response binding returned: ${staleBinding}`);
}
assert.match(internals, /v-for="\(pool, provider\) in httpPool"/, 'HTTP pools are not rendered from provider-keyed responses');
assert.match(internals, /formatAgeSeconds\(s\.last_failure_age_seconds\)/, 'Subsystem failure age is not rendered from the server-computed age');
assert.doesNotMatch(internals, /formatTime\(s\.last_failure_at\)/, 'Subsystem monotonic timestamp is still passed to a wall-clock formatter');
assert.match(internals, /import \{ formatAgeSeconds \} from ['"]\.\.\/utils\.js['"];/, 'Internals does not import the server-age formatter');
assert.match(internals, /s\.last_failure_age_seconds != null/, 'Internals does not gate relative age on the additive server field');
assert.match(internals, /statusColor, formatAgeSeconds/, 'Internals does not expose the server-age formatter to its template');
