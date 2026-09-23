import assert from 'node:assert/strict';
import { baseParse } from '@vue/compiler-dom';

const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
const { api } = await import('../ui/js/api.js');
const { default: permissions } = await import('../ui/js/pages/permissions.js');
const { default: tokens } = await import('../ui/js/pages/api-tokens.js');

function elements(node, tag) {
  return [
    ...(node.type === 1 && node.tag === tag ? [node] : []),
    ...(node.children || []).flatMap(child => elements(child, tag)),
  ];
}
function directive(node, name) {
  return node.props.find(prop => prop.type === 7 && prop.name === name);
}

const permissionTree = baseParse(permissions.template);
const repair = elements(permissionTree, 'button').find(node =>
  directive(node, 'on')?.exp?.content === 'repair(uid)');
assert.equal(directive(repair, 'bind')?.arg?.content, 'disabled');
assert.equal(directive(repair, 'bind')?.exp?.content, '!repairTiers[uid]');
assert.ok(elements(permissionTree, 'option').some(node =>
  directive(node, 'bind')?.arg?.content === 'value' ||
  (node.props.some(prop => prop.name === 'value' && prop.value?.content === '') &&
   node.props.some(prop => prop.name === 'disabled'))));
assert.ok(elements(permissionTree, 'div').some(node => directive(node, 'else-if')?.exp?.content === 'loaded'));
const shownError = elements(permissionTree, 'div').find(node => directive(node, 'if')?.exp?.content === 'error');
assert.ok(shownError && !directive(shownError, 'else-if'));

const tokenTree = baseParse(tokens.template);
const remove = elements(tokenTree, 'button').find(node =>
  directive(node, 'on')?.exp?.content === 'removeUnusable(item)');
assert.ok(remove, 'remove must use the displayed diagnosis, not only its index');
assert.ok(elements(tokenTree, 'span').some(node => directive(node, 'if')?.exp?.content === 'item.user_id'));

const original = { get: api.get, post: api.post, _request: api._request };
const originalWarning = console.warn;
console.warn = () => {}; // setup() outside Vue's mounted lifecycle, which we test directly.
try {
  const calls = [];
  api.get = async () => ({ invalid_overrides: { admin: 'wizard' } });
  api.post = async (...args) => { calls.push(args); throw Error('write failed'); };
  const page = permissions.setup();
  await page.fetchData();
  assert.equal(page.loaded.value, true);
  await page.repair('admin');
  assert.equal(calls.length, 0, 'no implicit user-tier demotion');
  page.repairTiers.value.admin = 'guest';
  await page.repair('admin');
  assert.deepEqual(calls, [['/api/permissions/user/admin/repair', { tier: 'guest' }]]);
  assert.match(page.error.value, /write failed/);
  assert.equal(page.data.value.invalid_overrides.admin, 'wizard', 'failed repair retains page state');
  assert.equal(page.loaded.value, true);

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
console.log('permission/token repair UI: explicit tier, intact error state, bound row deletion');
