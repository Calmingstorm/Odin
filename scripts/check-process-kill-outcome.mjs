// Execute the real page setup against mocked transports. No process is killed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../ui/js/pages/processes.js', import.meta.url), 'utf8');
let reply;
const successes = [];
const failures = [];
const context = vm.createContext({
  console, setInterval: () => 1, clearInterval: () => {},
});
const api = { get: async () => [], del: async () => reply };
const vue = {
  ref: value => ({ value }), computed: fn => ({ get value() { return fn(); } }),
  onActivated() {}, onDeactivated() {}, onMounted() {}, onUnmounted() {}, watch() {},
};
const modules = {
  '../api.js': { api, ws: { on() {}, off() {} } },
  '../toast.js': { toast: { success: text => successes.push(text), error: text => failures.push(text) } },
  '../confirm.js': { confirmDialog: async () => true },
  '../utils.js': { formatDuration: String },
  vue,
};
const module = new vm.SourceTextModule(source, { context });
await module.link(async specifier => {
  const exports = modules[specifier];
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
  }, { context });
});
await module.evaluate();
const page = module.namespace.default.setup();
for (const result of [
  { success: false, result: 'Error: read-only evidence.' },
  { success: true, result: 'Process 123 already exited.', outcome: 'already_stopped' },
  { success: true, result: 'Process 123 killed.', outcome: 'killed' },
]) {
  reply = result;
  await page.doKill(123);
  assert.equal(page.killingPid.value, null);
}
assert.deepEqual(failures, ['Error: read-only evidence.']);
assert.deepEqual(successes, ['Process 123 already exited.', 'Process 123 killed.']);
console.log('process-kill: acknowledged outcomes only; refusals never produce a success toast');
