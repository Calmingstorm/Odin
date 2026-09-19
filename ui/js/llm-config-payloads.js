const CODEX_BASIC_FIELDS = Object.freeze([
  'enabled',
  'model',
  'reasoning_effort',
  'agent_reasoning_effort',
]);

const CODEX_ADVANCED_FIELDS = Object.freeze([
  'request_timeout_seconds',
  'stream_stall_timeout_seconds',
  'retry',
  'connection_pool',
  'context_compression',
  'context_budget_overrides',
  'context_utilization',
]);

const OLLAMA_BASIC_FIELDS = Object.freeze([
  'enabled',
  'base_url',
  'model',
  'max_tokens',
]);

const OPENAI_COMPATIBLE_BASIC_FIELDS = Object.freeze([
  'enabled',
  'base_url',
  'model',
  'max_tokens',
]);

function pick(form, fields) {
  return Object.fromEntries(fields.map(field => [field, form[field]]));
}

export function openaiCompatibleBasicPayload(form, options = {}) {
  const payload = pick(form, OPENAI_COMPATIBLE_BASIC_FIELDS);
  if (options.includeApiKey) payload.api_key = form.api_key;
  return payload;
}

export function openaiCompatibleAdvancedPayload(form) {
  return pick(form, ['timeout', 'context_budget', 'profile', 'quirks']);
}

export function codexBasicPayload(form) {
  return pick(form, CODEX_BASIC_FIELDS);
}

export function codexAdvancedPayload(form) {
  return pick(form, CODEX_ADVANCED_FIELDS);
}

export function ollamaBasicPayload(form, { includeApiKey = false } = {}) {
  const payload = pick(form, OLLAMA_BASIC_FIELDS);
  if (includeApiKey) payload.api_key = form.api_key;
  return payload;
}

export function ollamaAdvancedPayload(form) {
  return { timeout: form.timeout };
}

