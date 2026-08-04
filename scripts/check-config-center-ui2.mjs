import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = readFileSync('ui/js/pages/config.js', 'utf8');
const llm = readFileSync('ui/js/pages/llm-config.js', 'utf8');
const css = readFileSync('ui/css/style.css', 'utf8');
const discord = readFileSync('ui/js/pages/discord-config.js', 'utf8');
const apiTokens = readFileSync('ui/js/pages/api-tokens.js', 'utf8');

for (const section of ['llm_provider', 'openai_codex', 'ollama', 'kimi', 'personality', 'discord']) {
  assert.match(config, new RegExp(`CONFIG_EXCLUDED_SECTIONS[\\s\\S]*['"]${section}['"]`), `${section} returned to Config`);
}
assert.match(config, /CONFIG_EXCLUDED_PATHS[^;]*web\.api_tokens/s, 'web.api_tokens returned to Config');
assert.match(discord, /Global defaults[\s\S]*saveGlobalDefaults/s, 'Discord owner page did not absorb global defaults');
assert.match(discord, /api\.put\('\/api\/config', \{ discord:/, 'Discord global defaults do not save their canonical section');
assert.match(apiTokens, /Manage API tokens[\s\S]*api\.get\('\/api\/tokens'\)/s, 'API Tokens owner page does not own the token collection');
assert.doesNotMatch(config, /OWNER_LINKS|sectionOwner\(|Temporary expert JSON editor|setJsonFieldValue|Edit section|meta\.value\?\.status\?\.counts/, 'legacy owner/edit/JSON gate returned');
assert.match(config, /return true;\s*\n\s*}\s*\n\s*function toggleSection/s, 'desktop sections are not default-expanded');
assert.match(config, /if \(isMobile\.value\) return mobileDefaultSection\(section\) === section;/, 'mobile one-section model is missing');
assert.match(config, /fieldGroups\(section\)/, 'nested schema leaves are not grouped');
assert.match(config, /descriptionRecord\?\.group_description \|\| null/, 'nested groups do not consume registry group descriptions');
assert.doesNotMatch(config, /descendants\.find\(field => field\.group_description\)/, 'synthetic parent metadata still aggregates leaf descriptions');
assert.match(config, /field\.type === 'integer' \|\| field\.type === 'number'/, 'typed numeric editor missing');
assert.doesNotMatch(config, /Number\(\$event\.target\.value\)/, 'empty numeric input can collapse to zero');
assert.doesNotMatch(config, /Number\.parseInt\(raw/, 'integer controls silently truncate decimals');
assert.match(config, /inputDrafts/, 'numeric intermediate state missing');
assert.match(config, /if \(!segments\.length\) return value;/, 'scalar root sections are not editable');
assert.match(config, /setFieldValue\(field, parsed, \{ coalesce: true \}\)/, 'typed numeric drafts do not commit on blur');
assert.match(config, /UNDO_COALESCE_MS/, 'text edit undo coalescing missing');
assert.match(config, /agents\.final_warning_iterations/, 'warning-threshold chip editor missing');
assert.match(config, /No unsaved changes/, 'honest draft copy missing');
assert.match(config, /What saving does[\s\S]*What Odin does now/, 'plain-language save/runtime effects missing');
assert.match(config, /field\.action_available === true/, 'honest action gate missing');
assert.match(config, /pendingRestartCount[\s\S]*api\.post\('\/api\/restart'/, 'restart affordance missing');
assert.match(config, /restartScheduled[\s\S]*pendingRestartCount\.value === 0/s, 'restart banner clears without fresh metadata proof');

for (const provider of ['codex', 'ollama', 'kimi']) {
  assert.match(llm, new RegExp(`advancedOpen\\.${provider}`), `${provider} advanced expander missing`);
}
for (const field of ['request_timeout_seconds', 'stream_stall_timeout_seconds', 'retry.max_retries', 'connection_pool.max_connections', 'context_compression.max_context_chars']) {
  const parts = field.split('.');
  assert.ok(parts.every(part => llm.includes(part)), `Codex advanced field missing: ${field}`);
}
assert.ok((llm.match(/v-model\.number="(?:ollama|kimi)Form\.timeout"/g) || []).length === 2, 'provider timeout controls drifted');
assert.match(llm, /Unsupported by the current Codex provider/, 'unsupported max_tokens is not labelled');
assert.match(css, /\.cfgc-field\s*\{[^}]*grid-template-columns:\s*minmax\([^}]*4fr[^}]*5fr[^}]*3fr/s, 'wide 4/5/3 field grid missing');
assert.match(css, /\.config-center-page\s*\{[^}]*max-width:\s*1600px/s, 'wide shell has no readable max width');

console.log('config-center-ui2: de-dup, direct typed editing, restart flow, and provider advanced controls pinned');
