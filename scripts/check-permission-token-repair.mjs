import assert from 'node:assert/strict';
import { baseParse } from '@vue/compiler-dom';

const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
const { api } = await import('../ui/js/api.js');
const { default: hostAccess } = await import('../ui/js/pages/host-access.js');
const { default: tokens } = await import('../ui/js/pages/api-tokens.js');
function elements(node, tag) { return [...(node.type === 1 && node.tag === tag ? [node] : []), ...(node.children || []).flatMap(child => elements(child, tag))]; }
function directive(node, name) { return node.props.find(prop => prop.type === 7 && prop.name === name); }

const hostTree = baseParse(hostAccess.template);
const repair = elements(hostTree, 'button').find(node => directive(node, 'on')?.exp?.content === 'repairTier(uid)');
assert.equal(directive(repair, 'bind')?.arg?.content, 'disabled');
assert.equal(directive(repair, 'bind')?.exp?.content, '!repairTiers[uid]');
assert.ok(elements(hostTree, 'option').some(node => directive(node, 'for')?.exp?.content === 'tier in validTiers'));
assert.match(hostAccess.template, /permissions\.invalid_overrides\?\.\[uid\]/);

const tokenTree = baseParse(tokens.template);
const remove = elements(tokenTree, 'button').find(node => directive(node, 'on')?.exp?.content === 'removeUnusable(item)');
assert.ok(remove, 'remove must use the displayed diagnosis, not only its index');
assert.ok(elements(tokenTree, 'span').some(node => directive(node, 'if')?.exp?.content === 'item.user_id'));

const original = { get: api.get, post: api.post, put: api.put, del: api.del, _request: api._request };
const originalWarning = console.warn;
console.warn = () => {};
try {
  const calls = [];
  api.get = async path => path === '/api/permissions/tiers'
    ? { invalid_overrides: { admin: 'wizard' }, overrides: {}, config_tiers: {}, default_tier: 'user' }
    : { available_hosts: [], default_policy: { allowed_hosts: null, default_host: '' }, users: {} };
  api.post = async (...args) => { calls.push(args); throw Error('write failed'); };
  const page = hostAccess.setup();
  await page.fetchData();
  await page.repairTier('admin');
  assert.equal(calls.length, 0, 'no implicit tier selection');
  page.repairTiers.value.admin = 'guest';
  await page.repairTier('admin');
  assert.deepEqual(calls, [['/api/permissions/user/admin/repair', { tier: 'guest' }]]);
  assert.equal(page.permissions.value.invalid_overrides.admin, 'wizard', 'failed repair retains row state');

  const deletes = [];
  api._request = async (...args) => { deletes.push(args); return {}; };
  api.get = async () => ({ tokens: [] });
  const tokenPage = tokens.setup();
  await tokenPage.removeUnusable({ index: 2, reason: 'invalid tier', user_id: 'alice' });
  await tokenPage.removeUnusable({ index: 3, reason: 'entry is not an object' });
  assert.deepEqual(deletes, [
    ['DELETE', '/api/tokens/unusable/2', { reason: 'invalid tier', user_id: 'alice' }],
    ['DELETE', '/api/tokens/unusable/3', { reason: 'entry is not an object' }],
  ]);
} finally {
  Object.assign(api, original);
  console.warn = originalWarning;
}
console.log('permission/token repair UI: inline explicit tier repair, intact failure state, bound row deletion');
