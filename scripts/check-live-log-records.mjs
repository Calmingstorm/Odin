import assert from 'node:assert/strict';
import { groupLogEntries, logAttribution, parseLogEntry, serializeLogRecord } from '../ui/js/log-records.js';

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
