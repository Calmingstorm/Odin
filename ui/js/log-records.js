/** Lossless, local-only live audit presentation. Never re-fetch retained output. */
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : '';

export function logAttribution(record) {
  const r = object(record) ? record : {};
  const m = object(r.metadata) ? r.metadata : {};
  const a = object(r.audit_metadata) ? r.audit_metadata : {};
  const t = object(r.turn) ? r.turn : {};
  const field = key => text(r[key] ?? m[key] ?? a[key] ?? t[key]);
  return {
    agentId: field('agent_id'),
    label: field('agent_label') || field('label'),
    parentId: field('parent_agent_id'),
    rootId: field('root_agent_id'),
    turnId: field('originating_turn_id') || field('turn_id'),
    iteration: field('iteration'),
    callId: field('call_id'),
  };
}

export function serializeLogRecord(entry) {
  return entry.record ? JSON.stringify(retainedLogRecord(entry), null, 2) : entry.text;
}

export function retainedLogRecord(entry) {
  return entry.events?.length > 1 ? entry.events : entry.record;
}

function toolPhase(record) {
  if (!record?.tool_name) return '';
  if (['tool_start', 'loop_tool_start'].includes(record.type)) return 'start';
  if (['tool_end', 'loop_tool'].includes(record.type)) return 'end';
  if ((!record.type || record.type === 'execution') && 'result_summary' in record) return 'execution';
  return '';
}

// Provider call IDs are scoped, not globally unique. Missing identity is not
// permission to guess by tool name, timestamp, result text or completion order.
function toolCallKey(entry) {
  if (!toolPhase(entry.record)) return '';
  const a = entry.attribution, r = entry.record;
  if (!a.callId || (!a.turnId && !a.agentId)) return '';
  return JSON.stringify([a.turnId, a.agentId, a.iteration, a.callId,
    entry.tool, text(r.channel_id), text(r.user_id ?? r.actor)]);
}

/** Coalesce only retained, explicitly correlated lifecycle evidence. No cache
 * survives clear/eviction. First arrival owns row identity and chronological slot.
 * Raw events remain verbatim for inspection, search, copy and export. */
export function appendLogEntry(entries, incoming, limit = 2000) {
  const key = toolCallKey(incoming);
  const index = key ? entries.findIndex(entry => toolCallKey(entry) === key) : -1;
  if (index < 0) entries.push(incoming);
  else {
    const previous = entries[index];
    const events = [...(previous.events || [previous.record])];
    const serialized = JSON.stringify(incoming.record);
    if (events.some(record => JSON.stringify(record) === serialized)) return;
    events.push(incoming.record);
    // Lifecycle terminal beats start; canonical execution owns full body/input
    // even when an older terminal detail is clipped or empty. Receipt order is
    // not lifecycle order (reconnects and observers may deliver out of order).
    const rank = record => 'result_summary' in record ? 2 : toolPhase(record) === 'end' ? 1 : 0;
    const ordered = [...events].sort((a, b) => rank(a) - rank(b));
    const record = Object.assign({}, ...ordered);
    record.type = ordered[ordered.length - 1].type || 'execution';
    for (const field of ['metadata', 'audit_metadata', 'turn']) {
      const values = ordered.filter(event => object(event[field])).map(event => event[field]);
      if (values.length) record[field] = Object.assign({}, ...values);
    }
    const terminal = events.some(event => toolPhase(event) !== 'start');
    const failure = events.find(event => parseLogEntry(event, 0).level === 'ERROR');
    const failedStatus = failure?.status || failure?.metadata?.status;
    record.status = failure
      ? ['failed', 'error', 'cancelled', 'denied', 'outcome_unknown'].includes(failedStatus) ? failedStatus : 'failed'
      : terminal ? record.status || record.metadata?.status || 'succeeded' : 'started';
    if (terminal && record.status === 'started') record.status = 'succeeded';
    if (failure) record.error = failure.error || failure.metadata?.error || record.error;
    const merged = parseLogEntry(record, previous.id, previous._time);
    Object.assign(merged, { events, ts: previous.ts, _time: previous._time,
      searchText: events.map(event => JSON.stringify(event)).join('\n') });
    entries.splice(index, 1, merged);
  }
  if (entries.length > limit) entries.splice(0, entries.length - limit);
}

export function parseLogEntry(data, id, now = new Date()) {
  let source = data;
  if (object(data) && data.type === 'log' && 'line' in data) source = data.line;
  else if (object(data) && 'payload' in data) source = data.payload;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch { /* plain output stays byte-for-byte text */ }
  }
  const record = object(source) ? source : null;
  const candidate = record?.timestamp ? new Date(record.timestamp) : now;
  const time = Number.isNaN(candidate.getTime()) ? now : candidate;
  const body = record
    ? (record.result_summary ?? record.detail ?? record.message ?? JSON.stringify(record))
    : (typeof source === 'string' ? source : JSON.stringify(source) ?? '');
  const failed = record?.error || record?.metadata?.error || record?.success === false
    || [record?.status, record?.metadata?.status].some(status => ['failed', 'error', 'cancelled', 'denied', 'outcome_unknown'].includes(status));
  const level = failed ? 'ERROR' : text(record?.level).toUpperCase() || 'INFO';
  const entry = {
    id, record, ts: time.toLocaleTimeString(), _time: time, level,
    text: typeof body === 'string' ? body : JSON.stringify(body),
    tool: text(record?.tool_name), raw: record ? null : body,
    attribution: logAttribution(record),
  };
  // Search the complete retained record, including arguments and correlation.
  entry.searchText = record ? JSON.stringify(record) : entry.text;
  return entry;
}

/** Group only retained/filter-matching rows; no hidden ownership cache to go stale. */
export function groupLogEntries(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const { turnId, agentId, rootId, label, parentId } = entry.attribution;
    // Never imply unrelated unattributed records belong to a known turn.
    const key = turnId ? `turn:${turnId}` : agentId ? `root:${rootId || agentId}` : 'unattributed';
    if (!groups.has(key)) groups.set(key, {
      key, title: turnId ? `Turn ${turnId}` : agentId ? `Agent root ${rootId || agentId} (turn unavailable)` : 'Unattributed / legacy records',
      count: 0, sections: [], _sections: new Map(),
    });
    const group = groups.get(key);
    const sectionKey = agentId ? `agent:${agentId}` : 'main';
    if (!group._sections.has(sectionKey)) {
      const section = {
        key: sectionKey, agentId, label, parentId, rootId,
        title: agentId ? `${label || 'Agent'} (${agentId})` : 'Main thread / turn events',
        entries: [],
      };
      group._sections.set(sectionKey, section);
      group.sections.push(section);
    }
    group._sections.get(sectionKey).entries.push(entry);
    group.count++;
  }
  return [...groups.values()].map(({ _sections, ...group }) => group);
}
