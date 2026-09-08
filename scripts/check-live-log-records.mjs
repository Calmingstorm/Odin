import assert from 'node:assert/strict';
import { appendLogEntry, groupLogEntries, logAttribution, parseLogEntry, serializeLogRecord } from '../ui/js/log-records.js';
import { compactOutput, displayText } from '../ui/js/compact-output-format.js';
import { logDisplay, operatorMetadata } from '../ui/js/log-display.js';

const at = new Date('2026-09-06T16:00:00Z');
const agent = {
  timestamp: at.toISOString(), tool_name: 'read_file', tool_input: { path: '/example/report.txt' },
  metadata: { agent_id: 'child', agent_label: 'Report review', parent_agent_id: 'parent', root_agent_id: 'root', originating_turn_id: 'turn-one', iteration: 2, call_id: 'call-one' },
  result_summary: JSON.stringify({ rows: ['first\nsecond', 'literal \\n remains'] }),
};
const first = parseLogEntry({ type: 'log', line: JSON.stringify(agent) }, 1, at);
assert.deepEqual(first.record, agent, 'WS JSONL must retain the full record');
assert.deepEqual(parseLogEntry({ payload: agent }, 2, at).record, agent, 'event payload has the same shape');
assert.deepEqual(parseLogEntry(agent, 3, at).record, agent, 'direct object remains structured');
assert.equal(first.text, agent.result_summary, 'envelope body must not be flattened into tool-name text');
assert.equal(first.attribution.callId, 'call-one');
assert.equal(first.attribution.parentId, 'parent');
assert.ok(first.searchText.includes('/example/report.txt'), 'arguments remain searchable');
assert.deepEqual(JSON.parse(serializeLogRecord(first)), agent, 'copy/export retains arguments and metadata');

const plain = 'first\nsecond, literal \\n stays literal';
assert.equal(parseLogEntry({ type: 'log', line: plain }, 4, at).text, plain);
assert.equal(parseLogEntry(null, 5, at).text, 'null');
assert.equal(parseLogEntry({ timestamp: 'broken-date', message: 'safe' }, 6, at).ts, at.toLocaleTimeString());
assert.equal(parseLogEntry({ type: 'log', line: '' }, 7, at).text, '');
assert.equal(parseLogEntry({ type: 'tool_end', metadata: { status: 'cancelled' } }, 8, at).level, 'ERROR');
assert.equal(parseLogEntry({ level: 'warning', message: 'warning' }, 9, at).level, 'WARNING');
assert.equal(parseLogEntry({ tool_name: 'read_file', detail: 'event output' }, 10, at).text, 'event output');
assert.deepEqual(logAttribution({ turn: { turn_id: 'main-turn' } }).turnId, 'main-turn');

const rows = [
  first,
  parseLogEntry({ tool_name: 'read_file', turn: { turn_id: 'turn-one' } }, 11, at),
  parseLogEntry({ ...agent, metadata: { ...agent.metadata, agent_id: 'other', call_id: 'other-call' } }, 12, at),
  parseLogEntry({ ...agent, metadata: { ...agent.metadata, originating_turn_id: 'turn-two' } }, 13, at),
  parseLogEntry('legacy', 14, at),
];
const groups = groupLogEntries(rows);
assert.equal(groups.length, 3);
assert.equal(groups[0].title, 'Turn turn-one');
assert.equal(groups[0].count, 3);
assert.equal(groups[0].sections.length, 3, 'siblings and main must not merge calls');
assert.equal(groups[0].sections[0].parentId, 'parent');
assert.equal(groups[0].sections[0].rootId, 'root');
assert.equal(groups[1].title, 'Turn turn-two');
assert.equal(groups[2].key, 'unattributed');
assert.deepEqual(groupLogEntries(rows.slice(3)).map(g => g.key), ['turn:turn-two', 'unattributed'], 'eviction/filtering cannot leave stale groups');
assert.equal(groupLogEntries([parseLogEntry({ metadata: { agent_id: 'orphan', root_agent_id: 'root' } }, 15, at)])[0].key, 'root:root');
assert.equal(groupLogEntries(rows)[0].sections[0].entries[0].id, 1, 'grouping preserves stable row identity');
console.log('live-log-records: lossless transports, attribution, search/copy, same-name isolation, local grouping and eviction passed');

const lifecycle = (tool = 'run_command', call = 'a') => {
  const base = { tool_name: tool, channel_id: 'channel', user_id: 'user', turn: { turn_id: 'turn' } };
  return [
    { ...base, type: 'tool_start', metadata: { call_id: call, iteration: 1, tool_input_keys: ['command'] }, timestamp: '2026-09-06T16:00:00Z' },
    { ...base, call_id: call, iteration: 1, result_summary: 'complete result', tool_input: { command: 'example' }, execution_time_ms: 7, error: null, timestamp: '2026-09-06T16:00:01Z' },
    { ...base, type: 'tool_end', detail: 'clipped terminal', metadata: { call_id: call, iteration: 1, elapsed_ms: 8 }, timestamp: '2026-09-06T16:00:02Z' },
  ];
};
for (const tool of ['run_command', 'read_file', 'computer_act', 'invoke_skill', 'mcp_example', 'future_tool']) {
  for (const order of [[0, 1, 2], [0, 2, 1], [1, 2, 0], [2, 0, 1]]) {
    const events = lifecycle(tool), entries = [];
    order.forEach((n, i) => appendLogEntry(entries, parseLogEntry(events[n], i + 1, at)));
    assert.equal(entries.length, 1, `${tool}: one call in order ${order}`);
    assert.equal(entries[0].id, 1, 'stable first-arrival identity');
    assert.equal(logDisplay(entries[0]).body, 'complete result');
    assert.equal(logDisplay(entries[0]).status, 'succeeded');
    assert.equal(logDisplay(entries[0]).duration, 7, 'canonical timing beats terminal metadata');
    assert.deepEqual(JSON.parse(serializeLogRecord(entries[0])), order.map(n => events[n]), 'all raw signed evidence preserved, not a fabricated audit record');
    assert.ok(entries[0].searchText.includes('clipped terminal'));
    appendLogEntry(entries, parseLogEntry(events[order[0]], 9, at));
    assert.equal(entries[0].events.length, 3, 'identical replay adds no evidence duplicate');
  }
}
const calls = [], aEvents = lifecycle(), bEvents = lifecycle('run_command', 'b');
[aEvents[0], bEvents[0], bEvents[2], aEvents[1], aEvents[2], bEvents[1]].forEach((e, i) => appendLogEntry(calls, parseLogEntry(e, i, at)));
assert.equal(calls.length, 2, 'reverse completion of parallel same-name calls stays distinct');
for (const change of [{ turn: { turn_id: 'other' } }, { agent_id: 'child' }, { iteration: 2 }, { channel_id: 'elsewhere' }, { user_id: 'other' }]) {
  appendLogEntry(calls, parseLogEntry({ ...aEvents[1], ...change }, 20, at));
}
assert.equal(calls.length, 7, 'call-id reuse across scopes never joins');
const uncorrelated = [];
for (const e of [{ ...aEvents[1], call_id: undefined }, { ...aEvents[1], call_id: undefined }, { ...aEvents[1], turn: undefined }, { ...aEvents[1], turn: undefined }, { ...aEvents[1], type: 'web_action' }]) {
  appendLogEntry(uncorrelated, parseLogEntry(e, 1, at));
}
assert.equal(uncorrelated.length, 5, 'no IDs, no ownership scope, or unrelated events must remain separate');
const failures = [];
[aEvents[0], aEvents[1], { ...aEvents[2], metadata: { ...aEvents[2].metadata, status: 'outcome_unknown', error: 'not verified' } }].forEach((e, i) => appendLogEntry(failures, parseLogEntry(e, i, at)));
assert.equal(logDisplay(failures[0]).status, 'outcome_unknown');
assert.equal(failures[0].level, 'ERROR');
assert.equal(failures[0].record.error, 'not verified');
const capped = [];
appendLogEntry(capped, parseLogEntry(aEvents[0], 1, at), 1);
appendLogEntry(capped, parseLogEntry(bEvents[0], 2, at), 1);
appendLogEntry(capped, parseLogEntry(aEvents[2], 3, at), 1);
assert.equal(capped[0].id, 3, 'evicted calls never resurrect stale start evidence');
assert.equal(capped[0].events, undefined);
const canonical = [];
const canonicalEnd = { ...aEvents[1], type: 'tool_end', action: 'run_command' };
appendLogEntry(canonical, parseLogEntry(aEvents[0], 1, at));
appendLogEntry(canonical, parseLogEntry(canonicalEnd, 2, at));
assert.equal(canonical.length, 1, 'canonical execution-as-terminal uses the same coalescer');
assert.equal(canonical[0].events.length, 2);
assert.equal(logDisplay(canonical[0]).body, 'complete result');
const topLevelFailure = [];
appendLogEntry(topLevelFailure, parseLogEntry({ ...aEvents[0], metadata: { ...aEvents[0].metadata, status: 'started' } }, 1, at));
appendLogEntry(topLevelFailure, parseLogEntry({ ...aEvents[1], status: 'denied' }, 2, at));
assert.equal(topLevelFailure[0].level, 'ERROR', 'start metadata never masks top-level terminal failure');
assert.equal(logDisplay(topLevelFailure[0]).status, 'denied');
for (const status of ['failed', 'error', 'cancelled', 'denied', 'outcome_unknown']) {
  const entries = [];
  appendLogEntry(entries, parseLogEntry({ ...aEvents[2], metadata: { ...aEvents[2].metadata, status } }, 1, at));
  appendLogEntry(entries, parseLogEntry(aEvents[0], 2, at));
  appendLogEntry(entries, parseLogEntry(aEvents[1], 3, at));
  assert.equal(logDisplay(entries[0]).status, status, 'late success cannot hide retained terminal failure');
  assert.equal(entries[0].level, 'ERROR');
}
console.log('live-log coalescing: all tool families, reordered events, parallel scopes, lossless raw evidence, replay, failure precedence and eviction passed');

// Exact promotion boundaries are measured on body, not pretty JSON or the record.
for (const [value, promoted, lines, chars] of [
  ['', false, 0, 0], ['one', false, 1, 3], ['one\r\n', false, 1, 4],
  ['one\r\ntwo\r', true, 2, 8], ['one\n\n', true, 2, 5],
  ['x'.repeat(240), false, 1, 240], ['x'.repeat(241), true, 1, 241],
  ['x'.repeat(239) + '\n', false, 1, 240], ['x'.repeat(240) + '\n', true, 1, 241],
  ['𝄞'.repeat(240), false, 1, 240], ['𝄞'.repeat(241), true, 1, 241],
  ['{"ok":true}', false, 1, 11], ['{\n"ok":true\n}', true, 3, 13],
  ['{broken', false, 1, 7], ['literal \\n', false, 1, 10],
]) {
  const result = compactOutput(value);
  assert.equal(result.promoted, promoted, `promotion: ${JSON.stringify(value)}`);
  assert.equal(result.lines, lines);
  assert.equal(result.chars, chars);
}
const oneLineJSON = compactOutput({ a: 1, b: 2 });
assert.equal(oneLineJSON.promoted, false);
assert.ok(oneLineJSON.formatted.includes('\n'), 'formatting available for explicit inspection without promoting');
const huge = compactOutput('𝄞'.repeat(1000));
assert.equal([...huge.preview.text].length, 600);
assert.equal(huge.preview.folded, true);
assert.equal(compactOutput('1\n2\n3\n4').preview.folded, false);
assert.equal(compactOutput('1\n2\n3\n4\n5').preview.text, '1\n2\n3\n4');
const emptyEnvelope = { kind: 'tool_output', status: 'unknown', retention: 'failed', error: 'unavailable', head: '', tail: { text: '' }, truncated: true, cursor: null };
assert.equal(compactOutput(emptyEnvelope).promoted, false);
assert.deepEqual(compactOutput(emptyEnvelope).warnings, ['source truncated', 'retention unavailable']);
assert.equal(compactOutput({ ...emptyEnvelope, head: 'x' }).promoted, true);
assert.equal(compactOutput({ kind: 'tool_output', text: 'not a real envelope' }).envelope, false);
assert.equal(compactOutput({ kind: 'audit_preview', audit_clipped: true }).promoted, false);

const login = { timestamp: at.toISOString(), type: 'web_action', method: 'POST', path: '/api/auth/login',
  status: 200, success: true, ip: '192.0.2.1', execution_time_ms: 0, _hmac: 'a'.repeat(64), _prev_hmac: 'b'.repeat(64) };
const loginEntry = parseLogEntry(login, 16, at), loginBefore = JSON.stringify(loginEntry);
const loginDisplay = logDisplay(loginEntry);
assert.equal(loginDisplay.action, 'POST /api/auth/login');
assert.equal(loginDisplay.duration, 0);
assert.equal(loginDisplay.status, 200);
assert.equal(compactOutput(loginDisplay.body).promoted, false);
assert.doesNotMatch(displayText(loginDisplay.body), /_hmac|_prev_hmac/);
assert.equal(JSON.stringify(loginEntry), loginBefore, 'projection never mutates retained record or search data');
assert.deepEqual(JSON.parse(serializeLogRecord(loginEntry)), login, 'raw export preserves integrity hashes');
assert.equal(displayText({ _hmac: 'a'.repeat(64), nested: { _prev_hmac: 'b'.repeat(64), useful: 1 } }), '{"nested":{"useful":1}}');
assert.equal(displayText({ _custom_operator_key: 1 }), '{"_custom_operator_key":1}', 'do not broadly erase arbitrary operator fields');
const hugeAttribution = parseLogEntry({ ...agent, result_summary: 'short', tool_input: { text: 'x'.repeat(2000) }, metadata: { agent_label: 'x'.repeat(2000) } }, 17, at);
assert.equal(compactOutput(logDisplay(hugeAttribution).body).promoted, false, 'arguments/attribution are not the output body');
const metadataError = parseLogEntry({ detail: '', metadata: { status: 'failed', error: 'specific error reason', operator_detail: 'useful', agent_id: 'noise' } }, 18, at);
assert.equal(logDisplay(metadataError).body, 'specific error reason');
assert.match(operatorMetadata(metadataError.record), /operator_detail/);
assert.doesNotMatch(operatorMetadata(metadataError.record), /agent_id/);
assert.deepEqual(compactOutput({ kind: 'audit_preview', audit_clipped: true, preview: '', source: { capture_lost_bytes: 12, dropped_bytes: 3 } }).warnings,
  ['audit clipped', 'capture lost 12 B', 'dropped 3 B', 'audit body unavailable']);
console.log('compact-output: 0/1/2 lines, 240/241 Unicode chars, CRLF/final newline, pre-format JSON, schemas, 4/600 caps, projection/raw integrity pass');
