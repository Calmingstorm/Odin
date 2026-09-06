/** Display-only adapters for output_delivery.render_page,
 * ProcessManager._output_page and agents.results.result_page. No cursor calls. */
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const count = v => Number.isSafeInteger(v) && v >= 0;
const cursor = v => v === null || typeof v === 'string';
const range = (a, b) => count(a) && count(b) && b >= a;
const common = v => object(v) && typeof v.status === 'string' && typeof v.truncated === 'boolean' && cursor(v.cursor);
function toolEnvelope(v) {
  if (!common(v) || v.kind !== 'tool_output') return false;
  if (v.retention === 'failed') return typeof v.error === 'string' && typeof v.head === 'string'
    && object(v.tail) && typeof v.tail.text === 'string' && v.cursor === null && v.truncated;
  if (v.retention !== 'retained' || typeof v.result_id !== 'string' || !count(v.total_chars)
      || !count(v.total_bytes) || v.offset_unit !== 'unicode_code_points' || !range(v.start, v.end) || v.end > v.total_chars) return false;
  if ('head' in v) return typeof v.head === 'string' && object(v.tail)
    && typeof v.tail.text === 'string' && range(v.tail.start, v.tail.end) && v.tail.end <= v.total_chars && v.tail_is_context_only === true;
  return typeof v.text === 'string' && !('tail' in v);
}
function processEnvelope(v) {
  return common(v) && v.kind === 'process_output' && count(v.pid) && typeof v.generation === 'string'
    && (v.exit_code === null || Number.isInteger(v.exit_code))
    && ['emitted_bytes', 'retained_bytes', 'shown_bytes', 'capture_limit_loss_bytes', 'not_retained_bytes'].every(k => count(v[k]))
    && v.retained_bytes <= v.emitted_bytes
    && Array.isArray(v.shown_intervals) && v.shown_intervals.every(r => Array.isArray(r) && r.length === 2 && range(...r)
      && r[1] <= ('text' in v ? v.retained_bytes : v.emitted_bytes));
}
function agentEnvelope(v) {
  return common(v) && !('kind' in v) && typeof v.id === 'string' && typeof v.label === 'string'
    && typeof v.preview === 'string' && ['original_bytes', 'result_bytes', 'error_bytes', 'source_original_bytes'].every(k => count(v[k]))
    && range(v.offset, v.end) && v.end <= v.original_bytes && v.result_bytes + v.error_bytes === v.original_bytes
    && Array.isArray(v.tools_used) && v.tools_used.every(t => typeof t === 'string') && count(v.tools_omitted);
}
function json(value) { try { return JSON.parse(value); } catch { return undefined; } }
const pretty = value => JSON.stringify(value, null, 2);
const content = text => { const parsed = json(text); return parsed === undefined ? text : pretty(parsed); };
const interval = (a, b, unit) => `[${a}, ${b}) ${unit}`;

export function parseOutput(value) {
  const raw = typeof value === 'string' ? value : (pretty(value) ?? '');
  let v = typeof value === 'string' ? json(value) : value;
  let previewText = null;
  // Poll preview is a status line + actual text + final JSON metadata line.
  // Decode only JSON: never globally replace literal backslash-n.
  if (typeof value === 'string' && v === undefined) {
    const marker = '\n[output retention] ', at = value.lastIndexOf(marker), first = value.indexOf('\n');
    if (at > first && first > 0) {
      const candidate = json(value.slice(at + marker.length)), status = value.slice(0, first);
      if (processEnvelope(candidate) && !('text' in candidate)
          && status.startsWith(`[PID ${candidate.pid}] status=${candidate.status} `)) {
        v = candidate; previewText = value.slice(first + 1, at);
      }
    }
  }
  const model = { raw, kind: 'text', header: [], sections: [], metadata: null };
  const section = (label, text) => ({ label, text: content(text) });
  if (object(v) && v.kind === 'audit_preview' && v.audit_clipped === true
      && (!('original_chars' in v) || count(v.original_chars)) && (!('preview' in v) || typeof v.preview === 'string')) {
    model.kind = 'audit_preview';
    model.header = ['audit clipped: yes', ...(count(v.original_chars) ? [`original ${v.original_chars} code points`] : [])];
    if (object(v.source)) {
      for (const key of ['kind', 'status', 'retention', 'truncated', 'capture_loss', 'capture_limit_loss_bytes', 'not_retained_bytes', 'cursor_present',
        'total_bytes', 'total_chars', 'retained_bytes', 'emitted_bytes', 'shown_bytes', 'offset_unit', 'capture_error', 'pid', 'exit_code',
        'start', 'end', 'tail_status', 'original_bytes', 'result_bytes', 'error_bytes', 'offset', 'source_original_bytes', 'id',
        'capture_lost_bytes', 'dropped_bytes', 'output_lost', 'capture_truncated', 'retention_seconds_after_exit']) {
        if (['string', 'number', 'boolean'].includes(typeof v.source[key])) model.header.push(`source ${key}: ${v.source[key]}`);
      }
    }
    model.sections.push({ label: 'Audit preview — incomplete source; raw shows stored wrapper', text: v.preview ?? '(no preview retained in audit)' });
    model.metadata = v;
    return model;
  }
  if (toolEnvelope(v)) {
    model.kind = 'tool_output';
    model.header = [v.status, `retention: ${v.retention}`];
    if (v.retention === 'retained') {
      model.header.push(`${v.total_bytes} UTF-8 bytes`, `${v.total_chars} code points`);
      model.sections.push(section(`${'head' in v ? 'Head' : 'Page'} ${interval(v.start, v.end, 'code points')}`, v.head ?? v.text));
      if (v.tail?.text) model.sections.push(section(`Tail context only ${interval(v.tail.start, v.tail.end, 'code points')} — not a continuation`, v.tail.text));
    } else {
      model.header.push(v.error);
      model.sections.push(section('Head — retention failed', v.head), section('Tail context only — may overlap head', v.tail.text));
    }
    if (typeof v.matches?.summary === 'string') model.header.push(v.matches.summary);
  } else if (processEnvelope(v) && (typeof v.text === 'string' || previewText !== null)) {
    model.kind = 'process_output';
    model.header = [v.status, `PID ${v.pid}`, ...(v.exit_code !== null ? [`exit ${v.exit_code}`] : []),
      `emitted ${v.emitted_bytes} B`, `retained ${v.retained_bytes} B`, `shown ${v.shown_bytes} B`,
      `capture-limit loss ${v.capture_limit_loss_bytes} B`, `not retained ${v.not_retained_bytes} B`];
    if (v.capture_error) model.header.push(`capture error: ${v.capture_error}`);
    if (v.tail_status) model.header.push(`recent output: ${v.tail_status}`);
    const ranges = v.shown_intervals.map(r => interval(...r, 'UTF-8 bytes')).join(', ');
    model.sections.push(section(`${previewText !== null ? 'Recent preview — retrieval starts at byte 0' : 'Page'}${ranges ? ' · ' + ranges : ''}`, previewText ?? v.text));
  } else if (agentEnvelope(v)) {
    model.kind = 'agent_result';
    model.header = [v.status, `agent ${v.id}`, v.label, `original ${v.original_bytes} B`, `result ${v.result_bytes} B`,
      `error ${v.error_bytes} B`, `source ${v.source_original_bytes} B`, `tools ${v.tools_used.length} shown / ${v.tools_omitted} omitted`];
    model.sections.push(section(`Result + error page ${interval(v.offset, v.end, 'UTF-8 bytes')}`, v.preview));
  } else {
    model.kind = v === undefined ? 'text' : 'json';
    model.sections.push({ label: '', text: v === undefined ? raw : pretty(v) });
    return model;
  }
  model.metadata = v;
  model.header.push(`source truncated: ${v.truncated ? 'yes' : 'no'}`, `cursor: ${v.cursor ? 'present' : 'none'}`);
  if (typeof v.expires_at === 'string') model.header.push(`expires: ${v.expires_at}`);
  if (typeof v.expires_at === 'number') {
    const date = new Date(v.expires_at * 1000);
    if (!Number.isNaN(date.valueOf())) model.header.push(`expires: ${date.toISOString()}`);
  }
  return model;
}

export function foldText(text, maxLines = 30, maxChars = 6000) {
  let lines = 1, chars = 0, end = 0;
  if (maxLines > 0 && maxChars > 0) {
    for (const character of text) {
      if (chars >= maxChars || (character === '\n' && lines >= maxLines)) break;
      if (character === '\n') lines++;
      chars++; end += character.length;
    }
  }
  return { text: text.slice(0, end), folded: end < text.length, chars, lines };
}
