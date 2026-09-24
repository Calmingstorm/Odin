import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baseParse } from '@vue/compiler-dom';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
const { api } = await import('../ui/js/api.js');
const { default: HostAccess } = await import('../ui/js/pages/host-access.js');
const { TABS } = await import('../ui/js/pages/system.js');

function walk(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  for (const child of node.children || []) walk(child, predicate, found);
  return found;
}
const tree = baseParse(HostAccess.template);
const tables = walk(tree, node => node.type === 1 && node.tag === 'table');
assert.equal(tables.length, 1);
const headers = walk(tables[0], node => node.type === 1 && node.tag === 'th').map(n => n.children?.[0]?.content);
assert.deepEqual(headers, ['User', 'Tier', 'Hosts', 'Default Host', 'Remove']);
assert.ok(!HostAccess.template.includes('v-for="host in availableHosts" :key="\'th-'), 'no per-host table columns');
assert.match(HostAccess.template, /hostChips\(defaultPolicy\)/, 'default policy renders chips');
assert.match(HostAccess.template, /visibleHostChips\(uid\)/, 'each user renders bounded host chips');
assert.match(readFileSync(new URL('../ui/css/style.css', import.meta.url), 'utf8'), /\.host-access-table\s*\{\s*table-layout:\s*fixed/, 'host list cannot expand the table width');
assert.match(HostAccess.template, /All hosts, including hosts added later/);
assert.match(HostAccess.template, /Search hosts/);
assert.match(HostAccess.template, /Search users/);
assert.match(HostAccess.template, /discord-identity :user-id="uid" :members="members"/);
assert.ok(!TABS.some(tab => tab.id === 'permissions'), 'System Permissions tab is removed');

const original = { get: api.get, put: api.put, del: api.del, post: api.post };
const calls = [];
const warn = console.warn;
console.warn = () => {};
try {
  api.get = async path => {
    if (path === '/api/host-access') return { available_hosts: ['a', 'b'], default_policy: { allowed_hosts: null, default_host: 'a' }, users: { '123456789012345': { allowed_hosts: ['a'], default_host: 'a' } } };
    if (path === '/api/permissions/tiers') return { valid_tiers: ['admin', 'user', 'guest'], default_tier: 'user', config_tiers: {}, overrides: { '123456789012345': 'guest' }, invalid_overrides: {}, store_corrupt: false };
    return [];
  };
  api.put = async (...args) => calls.push(['PUT', ...args]);
  api.del = async (...args) => calls.push(['DELETE', ...args]);
  api.post = async (...args) => calls.push(['POST', ...args]);
  const vm = HostAccess.setup();
  await vm.fetchData();
  const rendered = await renderToString(createSSRApp({
    template: HostAccess.template,
    setup: () => vm,
    components: {
      DiscordIdentity: { props: ['userId'], template: '<span>{{ userId }}</span>' },
      DiscordUserCombobox: { template: '<input />' },
    },
  }));
  assert.equal((rendered.match(/<th(?:\s|>)/g) || []).length, 5, 'rendered table has five fixed columns');
  assert.match(rendered, /host-chip[^>]*>All hosts</, 'default policy renders a bounded chip');
  assert.match(rendered, /<select[^>]*>.*?guest.*?<\/select>/s, 'existing tier is rendered');
  assert.equal(vm.defaultPolicy.value.allow_all, true, 'null host ACL stays all-hosts');
  assert.equal(vm.hostSummary(vm.defaultPolicy.value), 'All hosts');
  assert.equal(vm.tierValue('123456789012345'), 'guest', 'existing override is visible');
  assert.deepEqual(vm.hostChips({ allowed_hosts: ['a', 'b', 'c', 'd'], allow_all: false }), ['a', 'b', '+2']);
  assert.equal(vm.hostChips(vm.defaultPolicy.value)[0], 'All hosts');
  assert.ok(vm.visibleUserIds.value.includes('123456789012345'));
  vm.userQuery.value = 'no matching user';
  assert.equal(vm.visibleUserIds.value.length, 0, 'search filters rows');
  vm.userQuery.value = '';
  await vm.setTier('123456789012345', 'admin');
  assert.deepEqual(calls[0], ['PUT', '/api/permissions/user/123456789012345', { tier: 'admin' }]);
  await vm.setTier('123456789012345', 'default');
  assert.deepEqual(calls[1], ['DELETE', '/api/permissions/user/123456789012345']);
  vm.setAllHosts('default', true);
  vm.flushPendingSaves();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(calls.some(call => call[0] === 'PUT' && call[1] === '/api/host-access/default-policy' && call[2].allowed_hosts === null), 'all-hosts persists as null for future hosts');
  vm.permissions.value.invalid_overrides = { '123456789012346': 'bad tier' };
  assert.ok(vm.visibleUserIds.value.includes('123456789012346'), 'permission-only broken entry gets a row');
  await vm.repairTier('123456789012346');
  assert.ok(!calls.some(call => call[1]?.includes('/repair')), 'repair requires explicit tier');
  vm.repairTiers.value['123456789012346'] = 'guest';
  await vm.repairTier('123456789012346');
  assert.ok(calls.some(call => call[0] === 'POST' && call[1] === '/api/permissions/user/123456789012346/repair' && call[2].tier === 'guest'));
  vm.toggleUserHost('123456789012346', 'b', false);
  vm.flushPendingSaves();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(calls.some(call => call[0] === 'PUT' && call[1] === '/api/host-access/user/123456789012346' && call[2].allowed_hosts?.includes('a') && !call[2].allowed_hosts.includes('b')), 'host editor can create host override on tier-only row');
} finally {
  Object.assign(api, original);
  console.warn = warn;
}
console.log('host-access redesign: rendered layout, future-host semantics, permission tier API, Permissions tab removed');
