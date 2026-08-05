const CODEX_BASIC_FIELDS = Object.freeze([
  'enabled',
  'model',
  'reasoning_effort',
  'agent_reasoning_effort',
  'agent_model',
]);

const CODEX_ADVANCED_FIELDS = Object.freeze([
  'request_timeout_seconds',
  'stream_stall_timeout_seconds',
  'retry',
  'connection_pool',
  'context_compression',
]);

const OLLAMA_BASIC_FIELDS = Object.freeze([
  'enabled',
  'base_url',
  'model',
  'max_tokens',
]);

const KIMI_BASIC_FIELDS = Object.freeze([
  'enabled',
  'model',
  'max_tokens',
]);

function pick(form, fields) {
  return Object.fromEntries(fields.map(field => [field, form[field]]));
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

export function kimiBasicPayload(form, { includeApiKey = false } = {}) {
  const payload = pick(form, KIMI_BASIC_FIELDS);
  if (includeApiKey) payload.api_key = form.api_key;
  return payload;
}

export function kimiAdvancedPayload(form) {
  return { timeout: form.timeout };
}
