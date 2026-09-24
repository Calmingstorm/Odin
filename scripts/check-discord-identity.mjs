import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage = globalThis.localStorage;
const { api } = await import('../ui/js/api.js');
const { DiscordIdentity, lookupDiscordIdentity } = await import('../ui/js/discord-identity.js');

const originalGet = api.get;
const requested = [];
try {
  api.get = async path => {
    requested.push(path);
    if (path === '/api/discord/members') return [{ id: '12345678901234567', display_name: 'Member', avatar_url: null }];
    if (path === '/api/discord/users/12345678901234568') return { user: { id: '12345678901234568', display_name: 'Former member' } };
    return { user: null };
  };
  assert.equal(await lookupDiscordIdentity('Admin'), null, 'non-Discord identities remain untouched');
  assert.equal((await lookupDiscordIdentity('12345678901234567')).display_name, 'Member');
  assert.equal((await lookupDiscordIdentity('12345678901234568')).display_name, 'Former member');
  assert.equal((await lookupDiscordIdentity('12345678901234568')).display_name, 'Former member');
  assert.deepEqual(requested, ['/api/discord/members', '/api/discord/users/12345678901234568'], 'one guild-list read then cached by-ID fallback');
} finally {
  api.get = originalGet;
}

assert.match(DiscordIdentity.template, /avatar_url/);
assert.match(DiscordIdentity.template, /userId/);
assert.match(DiscordIdentity.template, /showId/);
for (const [page, marker] of [
  ['api-tokens', 't.user_id'], ['learned', 'entry.user_id'], ['traces', 'singleTrace.user_id'],
  ['audit', 'e.user_id'], ['sessions', 'r.user_id'], ['logs', 'entry.user_id'], ['computer', 'status.owner_id'],
]) {
  const source = readFileSync(new URL(`../ui/js/pages/${page}.js`, import.meta.url), 'utf8');
  assert.ok(source.includes("from '../discord-identity.js'"), `${page} imports the shared identity component`);
  assert.ok(source.includes('<discord-identity'), `${page} renders Discord identity`);
  assert.ok(source.includes(marker), `${page} binds the identity to its user ID`);
}
const backend = readFileSync(new URL('../src/web/api/discord_identity.py', import.meta.url), 'utf8');
assert.match(backend, /admin_gate\(bot\)/);
assert.match(backend, /bot\.fetch_user\(int\(user_id\)\)/);
assert.match(backend, /_CACHE_TTL/);
console.log('Discord identity component and covered user-ID surfaces passed.');
