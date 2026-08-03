/*
 * Temporary /api/config/meta fixture for the Config Center shell.
 *
 * Keep the returned payload aligned with docs/plans/config-center-plan.md §4.
 * U1 deliberately owns no backend route. Once S2 lands, config.js replaces the
 * fixture loader with api.get('/api/config/meta'); the page consumes the same
 * field records without an adapter.
 */

const REDACTED = '••••••••';

const SECTION_DEFAULTS = {
  timezone: { apply_mode: 'restart', description: 'Locale and scheduling defaults used across Odin.' },
  discord: { apply_mode: 'live_read', description: 'Global Discord defaults. Guild and channel overrides take precedence.' },
  llm_provider: { apply_mode: 'live_apply', owner: 'llm', description: 'Active language-model provider and failover ownership.' },
  openai_codex: { apply_mode: 'live_apply', owner: 'llm', description: 'Codex models, reasoning, transport, and pool behaviour.' },
  ollama: { apply_mode: 'restart', owner: 'llm', description: 'Local or remote Ollama provider settings.' },
  kimi: { apply_mode: 'restart', owner: 'llm', description: 'Kimi provider settings and request limits.' },
  context: { apply_mode: 'restart', description: 'System-prompt sources and prompt-budget controls.' },
  sessions: { apply_mode: 'restart', description: 'Conversation persistence, retention, and history limits.' },
  tools: { apply_mode: 'restart', description: 'Execution policy, hosts, timeouts, pools, and recovery.' },
  logging: { apply_mode: 'restart', description: 'Runtime log verbosity and storage policy.' },
  usage: { apply_mode: 'activation_required', description: 'Usage accounting and durable history storage.' },
  webhook: { apply_mode: 'restart', description: 'Inbound webhook listener and authentication policy.' },
  learning: { apply_mode: 'restart', description: 'Reflection, consolidation, and learned-context limits.' },
  observability: { apply_mode: 'live_read', description: 'Metrics, tracing, and failure-classification controls.' },
  email: { apply_mode: 'restart', description: 'SMTP and IMAP behaviour for email tools.' },
  search: { apply_mode: 'restart', description: 'Knowledge and history search backends.' },
  browser: { apply_mode: 'restart', description: 'Browser automation limits and viewport defaults.' },
  permissions: { apply_mode: 'restart', description: 'Default and per-user execution policy.' },
  comfyui: { apply_mode: 'live_read', description: 'ComfyUI image backend connection settings.' },
  image: { apply_mode: 'live_read', description: 'Image routing and native generation policy.' },
  web: { apply_mode: 'restart', description: 'Management API listener, authentication, and sessions.' },
  attachments: { apply_mode: 'live_read', description: 'Attachment limits, paths, and cleanup policy.' },
  personality: { apply_mode: 'live_read', owner: 'personality', description: 'Response identity, style, and personality presets.' },
  reaction_triggers: { apply_mode: 'activation_required', owner: 'reaction_triggers', description: 'Discord reaction event automation.' },
  message_triggers: { apply_mode: 'activation_required', owner: 'message_triggers', description: 'Discord message event automation.' },
  mcp: { apply_mode: 'activation_required', owner: 'mcp', description: 'Model Context Protocol servers and tool publication.' },
  slack: { apply_mode: 'restart', description: 'Slack destinations and internal alert forwarding.' },
  issue_tracker: { apply_mode: 'activation_required', owner: 'issue_tracker', description: 'Issue tracker provider and tool lifecycle.' },
  audit: { apply_mode: 'restart', description: 'Audit signing, verification, and retention.' },
  agents: { apply_mode: 'live_for_new_work', description: 'Spawned-agent budgets, inheritance, and tree limits.' },
  grafana_alerts: { apply_mode: 'activation_required', owner: 'grafana_alerts', description: 'Grafana alert intake, routing, and remediation.' },
  outbound_webhooks: { apply_mode: 'live_apply', owner: 'outbound_webhooks', description: 'Outbound event targets, delivery, and safety policy.' },
  graceful_degradation: { apply_mode: 'activation_required', description: 'Subsystem failure thresholds and request guarding.' },
  llm_recovery: { apply_mode: 'restart', description: 'Provider recovery, breaker, and retry policy.' },
  turn_state: { apply_mode: 'restart', description: 'Durable turn checkpoints, expiry, and resume behaviour.' },
};

const FIELD_OVERRIDES = {
  'timezone': {
    label: 'Timezone',
    description: 'Timezone used in prompts and scheduled-time parsing.',
    consumers: [
      { name: 'Prompt context', apply_mode: 'live_read', detail: 'Future prompts read the configured value.' },
      { name: 'Time parser', apply_mode: 'restart', detail: 'The parser currently captures the boot value.' },
    ],
    restart_reason: 'The scheduling parser captures timezone during startup.',
  },
  'discord.token': { owner: 'secrets', sensitivity: 'sensitive', description: 'Write-only Discord bot credential.' },
  'discord.allowed_users': { description: 'Global allowlist of Discord user IDs. An empty list allows all users.' },
  'discord.channels': { description: 'Global allowlist of Discord channel IDs. An empty list allows all channels.' },
  'discord.require_mention': { description: 'Require a mention by default unless a guild or channel override says otherwise.' },
  'discord.respond_to_bots': { description: 'Allow replies to bot-authored messages by default.' },
  'llm_provider.active_provider': { enum: ['codex', 'ollama', 'kimi'], description: 'Provider used for new primary requests.' },
  'openai_codex.enabled': {
    apply_mode: 'live_apply',
    description: 'Enable or disable the primary Codex client through the dedicated Codex reload path.',
  },
  'openai_codex.model': {
    apply_mode: 'live_apply',
    description: 'Primary Codex model. Spawned agents may inherit it directly; chat and loops require a Codex reload.',
    consumers: [
      { name: 'Spawned agents inheriting the main model', apply_mode: 'live_read', detail: 'Future agent generations read the configured model at call time.' },
      { name: 'Chat and autonomous loops', apply_mode: 'live_apply', detail: 'The dedicated Codex endpoint reloads the live client.' },
    ],
  },
  'openai_codex.max_tokens': {
    apply_mode: 'live_apply',
    constraints: { minimum: 1, maximum: 128000 },
    unit: 'tokens',
    description: 'Maximum Codex response tokens; requires the dedicated Codex reload path.',
  },
  'openai_codex.reasoning_effort': {
    apply_mode: 'live_apply',
    description: 'Main Codex reasoning effort; requires the dedicated Codex reload path.',
  },
  'openai_codex.agent_reasoning_effort': {
    apply_mode: 'live_read',
    description: 'Reasoning policy for spawned-agent generations; future generations read it at call time.',
  },
  'openai_codex.agent_model': {
    apply_mode: 'live_read',
    description: 'Model policy for spawned-agent generations; future generations read it at call time.',
  },
  'openai_codex.credentials_path': {
    owner: 'secrets',
    sensitivity: 'sensitive',
    apply_mode: 'restart',
    description: 'Write-only Codex credential-store path; an existing client cannot switch stores live.',
    restart_reason: 'The credential pool is constructed from this path when the Codex client starts.',
  },
  'openai_codex.request_timeout_seconds': {
    apply_mode: 'live_apply',
    unit: 'seconds',
    description: 'Whole-request timeout; requires the dedicated Codex reload path.',
  },
  'openai_codex.stream_stall_timeout_seconds': {
    apply_mode: 'live_apply',
    unit: 'seconds',
    description: 'Maximum silent-stream interval; requires the dedicated Codex reload path.',
  },
  'openai_codex.retry.max_retries': {
    apply_mode: 'live_apply',
    description: 'Retry-attempt ceiling; requires the dedicated Codex reload path.',
  },
  'openai_codex.retry.base_delay': {
    apply_mode: 'live_apply',
    unit: 'seconds',
    description: 'Initial retry delay; requires the dedicated Codex reload path.',
  },
  'openai_codex.retry.max_delay': {
    apply_mode: 'live_apply',
    unit: 'seconds',
    description: 'Maximum retry delay; requires the dedicated Codex reload path.',
  },
  'openai_codex.connection_pool.max_connections': {
    apply_mode: 'restart',
    description: 'Maximum Codex transport connections.',
    restart_reason: 'Connection-pool sizing is fixed when the live client transport is constructed.',
  },
  'openai_codex.connection_pool.keepalive_timeout': {
    apply_mode: 'restart',
    unit: 'seconds',
    description: 'Codex connection keepalive timeout.',
    restart_reason: 'Connection-pool keepalive policy is fixed when the live client transport is constructed.',
  },
  'openai_codex.context_compression.enabled': {
    apply_mode: 'restart',
    description: 'Enable context compression for chat and agent tool loops.',
    restart_reason: 'The context-compressor holder is constructed at startup and has no live apply path.',
  },
  'openai_codex.context_compression.max_context_chars': {
    apply_mode: 'restart',
    unit: 'characters',
    description: 'Context size at which compression begins.',
    restart_reason: 'The context-compressor holder retains its startup configuration.',
  },
  'openai_codex.context_compression.keep_recent_iterations': {
    apply_mode: 'restart',
    unit: 'iterations',
    description: 'Recent tool iterations preserved during compression.',
    restart_reason: 'The context-compressor holder retains its startup configuration.',
  },
  'logging.level': { enum: ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'], description: 'Minimum runtime log level.' },
  'browser.default_timeout_ms': { constraints: { minimum: 1000 }, unit: 'ms', description: 'Default browser operation timeout.' },
  'browser.viewport_width': { constraints: { minimum: 100, maximum: 7680 }, unit: 'px' },
  'browser.viewport_height': { constraints: { minimum: 100, maximum: 4320 }, unit: 'px' },
  'sessions.max_history': { constraints: { minimum: 1, maximum: 10000 }, unit: 'messages' },
  'sessions.max_age_hours': { constraints: { minimum: 1 }, unit: 'hours' },
  'tools.command_timeout_seconds': { constraints: { minimum: 10, maximum: 3600 }, unit: 'seconds' },
  'agents.max_children_per_agent': {
    apply_mode: 'activation_required',
    description: 'Child limit adopted by newly spawned parent agents after explicit activation.',
    activation_policy: 'Explicitly apply the configured limit after reviewing worst-case tree breadth.',
  },
  'context.max_system_prompt_tokens': {
    apply_mode: 'activation_required',
    description: 'Optional hard budget for future assembled system prompts.',
    activation_policy: 'Preview mandatory prompt usage and omissions before applying the budget.',
  },
  'usage.directory': {
    apply_mode: 'activation_required',
    description: 'Target for durable usage history; currently no durable store is active.',
    activation_policy: 'Validate the path and explicitly enable durable usage history.',
  },
  'slack.forward_alerts': {
    apply_mode: 'activation_required',
    description: 'Forward normalized internal alerts to tested Slack destinations.',
    activation_policy: 'Requires an effective notifier, tested destination, and activation receipt.',
  },
  'grafana_alerts.enabled': {
    apply_mode: 'activation_required',
    description: 'Adopt explicit Grafana processing control without changing legacy webhook behaviour on upgrade.',
    activation_policy: 'Explicit adoption preserves working legacy-control installations.',
  },
  'graceful_degradation.enabled': {
    apply_mode: 'activation_required',
    description: 'Allow subsystem guards to short-circuit calls while a dependency is unhealthy.',
    activation_policy: 'Explicit adoption resolves the legacy always-on behaviour.',
  },
};

const PARTIAL_LIVE_PREFIXES = [
  'tools.enabled',
  'tools.max_tool_iterations_chat',
  'tools.max_tool_iterations_loop',
  'learning.loop_reflection_enabled',
  'turn_state.retention',
];

const SENSITIVE_SEGMENTS = new Set([
  'token', 'api_token', 'api_key', 'password', 'secret', 'credentials_path',
  'ssh_key_path', 'hmac_key', 'webhook_urls', 'headers', 'env',
]);

function titleCase(value) {
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function valueType(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (Number.isInteger(value)) return 'integer';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object') return 'object';
  return 'string';
}

function flatten(value, prefix = '', out = []) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0 && prefix) out.push([prefix, value]);
    for (const [key, child] of entries) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }
  if (prefix) out.push([prefix, value]);
  return out;
}

function pathIsSensitive(path) {
  const segments = path.split('.');
  return segments.some(segment => SENSITIVE_SEGMENTS.has(segment));
}

function pathOverride(path) {
  if (FIELD_OVERRIDES[path]) return FIELD_OVERRIDES[path];
  if (path.startsWith('mcp.servers.') && (path.endsWith('.headers') || path.endsWith('.env'))) {
    return { owner: 'secrets', sensitivity: 'secret_container' };
  }
  if (path.startsWith('outbound_webhooks.targets.') && path.endsWith('.secret')) {
    return { owner: 'secrets', sensitivity: 'sensitive' };
  }
  if (path.startsWith('outbound_webhooks.targets.') && (path.endsWith('.scrub_secrets') || path.endsWith('.verify_ssl'))) {
    return {
      apply_mode: 'activation_required',
      activation_policy: 'Review this target and acknowledge the target-bound safety override.',
    };
  }
  return {};
}

function configuredValue(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function publicValue(value, sensitivity) {
  if (sensitivity === 'public') return value;
  if (value && typeof value === 'object') return Array.isArray(value) ? [] : {};
  return configuredValue(value) ? REDACTED : '';
}

function deriveApplyState(spec) {
  if (spec.valid === false) return 'invalid';
  if (spec.pending_restart) return 'pending_restart';
  if (spec.drift) return 'drift';
  if (spec.apply_mode === 'activation_required' || spec.apply_mode === 'dormant') return 'dormant';
  return 'applied';
}

function fieldSpec(path, value) {
  const section = path.split('.')[0];
  const leaf = path.split('.').at(-1);
  const sectionDefaults = SECTION_DEFAULTS[section] || {
    apply_mode: 'restart',
    description: `${titleCase(section)} configuration.`,
  };
  const override = pathOverride(path);
  const sensitivity = override.sensitivity || (pathIsSensitive(path) ? 'sensitive' : 'public');
  let applyMode = override.apply_mode || sectionDefaults.apply_mode;
  if (PARTIAL_LIVE_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}.`))) {
    applyMode = 'live_read';
  }
  const owner = override.owner || sectionDefaults.owner || (sensitivity === 'public' ? 'config' : 'secrets');
  const desired = publicValue(value, sensitivity);
  const effective = publicValue(value, sensitivity);
  const configured = configuredValue(value) && !(sensitivity !== 'public' && value === REDACTED);
  const spec = {
    path,
    owner,
    label: override.label || titleCase(leaf),
    description: override.description || `${titleCase(leaf)} setting for ${titleCase(section)}.`,
    aliases: override.aliases || [],
    unit: override.unit || null,
    examples: override.examples || [],
    type: override.type || valueType(value),
    enum: override.enum || null,
    constraints: override.constraints || {},
    default: override.default ?? null,
    sensitivity,
    secret_route: sensitivity === 'public' ? null : `/api/config/secrets/${encodeURIComponent(path)}`,
    apply_mode: applyMode,
    apply_handler: override.apply_handler || null,
    consumers: override.consumers || [],
    restart_reason: override.restart_reason || (applyMode === 'restart' ? `${titleCase(section)} is currently constructed during startup.` : null),
    activation_policy: override.activation_policy || (applyMode === 'activation_required' ? 'Saving configuration does not enable this feature. Explicit activation is required.' : null),
    desired,
    effective,
    configured,
    provenance: configured ? 'config_file' : 'unset',
    valid: true,
    validation_errors: [],
    pending_restart: false,
    drift: false,
    last_apply: null,
  };
  spec.apply_state = deriveApplyState(spec);
  return spec;
}

function countStates(fields) {
  const counts = { applied: 0, pending_restart: 0, dormant: 0, invalid: 0, drift: 0 };
  for (const field of fields) {
    if (Object.hasOwn(counts, field.apply_state)) counts[field.apply_state] += 1;
  }
  return counts;
}

export function createConfigMetaFixture(config) {
  const fields = flatten(config || {}).map(([path, value]) => fieldSpec(path, value));
  return {
    schema_version: 1,
    revision: 'local-fixture',
    generated_at: null,
    fields,
    status: {
      counts: countStates(fields),
      persistence_error: null,
      unsafe_overrides: [],
      desired_revision: null,
      effective_revision: null,
    },
  };
}

export { REDACTED as CONFIG_REDACTED_SENTINEL, SECTION_DEFAULTS as CONFIG_SECTION_FIXTURE };
