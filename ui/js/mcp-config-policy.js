/**
 * MCP management form policy.
 *
 * The P4 API intentionally never returns secret values and accepts partial
 * updates.  This module keeps the WebUI honest about those contracts: blank
 * edit fields mean "leave unchanged" unless the operator explicitly enables
 * a replacement, while secret rotation uses only *_set/*_remove operations.
 */

export class MCPFormError extends Error {
  constructor(message, field = '') {
    super(message);
    this.name = 'MCPFormError';
    this.field = field;
  }
}

const SERVER_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function splitMcpLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function secretPatch(rows, removals, label) {
  const set = {};
  const remove = [...new Set((removals || []).map(key => String(key)))];
  const removeSet = new Set(remove);
  for (const row of rows || []) {
    const key = String(row?.key || '').trim();
    const value = String(row?.value ?? '');
    if (!key && !value) continue;
    if (!key) throw new MCPFormError(`${label} key is required when a value is entered.`, 'authentication');
    if (/[\r\n\0]/.test(key)) throw new MCPFormError(`${label} keys cannot contain line breaks or NUL bytes.`, 'authentication');
    if (Object.hasOwn(set, key)) throw new MCPFormError(`${label} key “${key}” appears more than once.`, 'authentication');
    if (removeSet.has(key)) throw new MCPFormError(`${label} key “${key}” cannot be replaced and removed in the same save.`, 'authentication');
    set[key] = value;
  }
  return { set, remove };
}

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** Build a POST/PUT body without inventing values that P4 did not return. */
export function buildMCPServerPayload(form, { mode = 'add', originalTransport = '' } = {}) {
  const add = mode === 'add';
  const name = String(form.name || '').trim();
  if (!name) throw new MCPFormError('Server name is required.', 'name');
  if (name.length > 128 || !SERVER_NAME.test(name)) {
    throw new MCPFormError('Use at most 128 letters, digits, or underscores, with no leading digit.', 'name');
  }

  const transport = form.transport === 'http' ? 'http' : 'stdio';
  const transportChanged = !add && Boolean(originalTransport) && transport !== originalTransport;
  const payload = { enabled: Boolean(form.enabled), transport };
  if (add) payload.name = name;

  if (transport === 'stdio') {
    const command = String(form.command || '').trim();
    if ((add || transportChanged) && !command) {
      throw new MCPFormError('An executable path is required for a new stdio connection.', 'command');
    }
    if (command) payload.command = command;
    if (add || form.replaceArgs) payload.args = splitMcpLines(form.argsText);
    if (add || form.replaceCwd) {
      const cwd = String(form.cwd || '').trim();
      if (cwd && (!cwd.startsWith('/') || cwd.includes('\0'))) {
        throw new MCPFormError('Working directory must be an absolute path.', 'cwd');
      }
      payload.cwd = cwd;
    }
  } else {
    const url = String(form.url || '').trim();
    if ((add || transportChanged) && !url) {
      throw new MCPFormError('An HTTP endpoint is required for this connection.', 'url');
    }
    if (url && !validHttpUrl(url)) {
      throw new MCPFormError('Endpoint must be a valid http:// or https:// URL.', 'url');
    }
    if (url) payload.url = url;
  }

  if (add || form.replaceTimeout) {
    const timeout = Number(form.timeoutSeconds);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3600) {
      throw new MCPFormError('Timeout must be a whole number from 1 to 3600 seconds.', 'timeout');
    }
    payload.timeout_seconds = timeout;
  }
  if (add || form.replaceAllowlist) payload.tool_allowlist = splitMcpLines(form.allowlistText);

  const headers = secretPatch(form.headerRows, form.headersRemove, 'Header');
  const env = secretPatch(form.envRows, form.envRemove, 'Environment variable');
  if (Object.keys(headers.set).length) payload.headers_set = headers.set;
  if (headers.remove.length) payload.headers_remove = headers.remove;
  if (Object.keys(env.set).length) payload.env_set = env.set;
  if (env.remove.length) payload.env_remove = env.remove;
  return payload;
}

/**
 * Any effective edit replaces the manager's server runtime. Compare the
 * already-normalized update payload to the two fields returned by status;
 * every other key is present only when the operator explicitly changed it.
 */
export function mcpConnectionEditNeedsConfirmation(payload, originalServer) {
  if (!originalServer) return false;
  if (payload.transport !== originalServer.transport) return true;
  if (Boolean(payload.enabled) !== Boolean(originalServer.enabled)) return true;
  return Object.keys(payload).some(key => !['enabled', 'transport'].includes(key));
}

export function normalizeMCPState(value) {
  const state = String(value || '').toLowerCase();
  return ['disabled', 'connecting', 'connected', 'stale', 'error', 'blocked'].includes(state)
    ? state
    : 'error';
}

export function mcpToolMatches(tool, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  return [tool?.original_name, tool?.published_name, tool?.description, tool?.exclusion_reason]
    .filter(Boolean)
    .some(value => String(value).toLowerCase().includes(needle));
}
