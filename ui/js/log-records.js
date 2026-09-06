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
  return entry.record ? JSON.stringify(entry.record, null, 2) : entry.text;
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
  const status = record?.metadata?.status ?? record?.status;
  const failed = record?.error || record?.metadata?.error || ['failed', 'error', 'cancelled', 'denied', 'outcome_unknown'].includes(status);
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
