import { displayText } from './compact-output-format.js';

// Already represented by the event row or its on-demand attribution/arguments.
// This is NOT an audit serializer: entry.record and entry.searchText are untouched.
const rowFields = new Set(['timestamp', 'type', 'level', 'tool_name', 'action', 'method', 'path',
  'status', 'success', 'execution_time_ms', 'duration_ms', 'metadata', 'audit_metadata', 'turn',
  'tool_input', 'audit_observer', '_hmac', '_prev_hmac', 'agent_id', 'agent_label', 'parent_agent_id',
  'root_agent_id', 'originating_turn_id', 'turn_id', 'iteration', 'call_id',
  'result_summary', 'detail', 'message', 'diff', 'error']);

const attributionFields = new Set(['agent_id', 'agent_label', 'label', 'parent_agent_id', 'root_agent_id',
  'originating_turn_id', 'turn_id', 'iteration', 'call_id', 'status', 'duration_ms', 'tool_input_keys', 'audit_observer', '_hmac', '_prev_hmac']);
export function operatorMetadata(record) {
  const result = {};
  for (const field of ['metadata', 'audit_metadata']) {
    if (!record?.[field] || typeof record[field] !== 'object') continue;
    const values = Object.fromEntries(Object.entries(record[field]).filter(([key]) => !attributionFields.has(key)));
    if (Object.keys(values).length) result[field] = values;
  }
  return Object.keys(result).length ? displayText(result) : '';
}

export function logDisplay(entry) {
  const r = entry.record;
  if (!r) return { body: entry.text, action: '', status: '', duration: null };
  let body;
  for (const field of ['result_summary', 'detail', 'message', 'diff', 'error']) {
    if (r[field] !== undefined && r[field] !== null && r[field] !== '') { body = r[field]; break; }
  }
  if (body === undefined && r.metadata?.error) body = r.metadata.error;
  if (body === undefined) {
    const remainder = Object.fromEntries(Object.entries(r).filter(([key]) => !rowFields.has(key)));
    body = Object.keys(remainder).length ? displayText(remainder) : '';
  }
  const status = r.status ?? r.metadata?.status ?? (r.error || r.success === false ? 'failed' : r.success === true ? 'success' : '');
  return { body, action: r.tool_name || r.action || (r.method ? `${r.method} ${r.path || ''}`.trim() : r.type || ''),
    status, duration: r.execution_time_ms ?? r.duration_ms ?? r.metadata?.duration_ms ?? null };
}
