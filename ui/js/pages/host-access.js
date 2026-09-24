import { api } from '../api.js';
import { toast } from '../toast.js';
import { confirmDialog } from '../confirm.js';
import { computed, onDeactivated, onMounted, onUnmounted, ref } from 'vue';
import { createHostAccessMutationCoordinator } from '../host-access-state.js';
import { DiscordUserCombobox } from '../discord-user-combobox.js';
import DiscordIdentity from '../discord-identity.js';


export default {
  components: { DiscordUserCombobox, DiscordIdentity },
  template: `
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">Host Access Control</h1>
        <button @click="fetchData" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
      <p class="text-xs text-gray-500 mb-6">
        Control which hosts each user can execute commands on and set per-user defaults.
        Users without an explicit entry fall back to the default policy.
      </p>

      <div v-if="loading && !data" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state">
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchData" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else class="space-y-6">
        <!-- Default policy -->
        <div class="hm-card">
          <h2 class="text-sm font-semibold text-gray-300 mb-3">Default Policy</h2>
          <p class="text-xs text-gray-500 mb-3">Applied to users without an explicit host access entry.</p>
          <div class="relative mb-3">
            <button class="host-chip-editor" @click="toggleEditor('default')" aria-label="Edit default policy hosts"><span v-for="chip in hostChips(defaultPolicy)" :key="chip" class="host-chip">{{ chip }}</span></button>
            <div v-if="editor==='default'" class="hm-card host-access-editor p-3">
              <label class="flex gap-2 text-sm mb-2"><input type="checkbox" :checked="defaultPolicy.allow_all" @change="setAllHosts('default', $event.target.checked)" /> All hosts, including hosts added later</label>
              <input v-model="hostQuery" class="hm-input w-full mb-2" placeholder="Search hosts…" aria-label="Search hosts" />
              <div class="max-h-48 overflow-y-auto space-y-1"><label v-for="host in filteredHosts" :key="'dp-'+host" class="flex items-center gap-2 text-sm"><input type="checkbox" :checked="defaultPolicy.allow_all || defaultPolicy.allowed_hosts.includes(host)" :disabled="defaultPolicy.allow_all" @change="toggleDefaultHost(host, $event.target.checked)" /><span>{{ host }}</span><span v-if="hostDescriptions[host]" class="text-gray-500 text-xs">{{ hostDescriptions[host] }}</span></label></div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <label for="default-policy-host" class="text-xs text-gray-500">Default host:</label>
            <select id="default-policy-host" v-model="defaultPolicy.default_host" @change="saveDefaultPolicy"
                    class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300">
              <option value="">— none —</option>
              <option v-for="host in (defaultPolicy.allow_all ? availableHosts : defaultPolicy.allowed_hosts)" :key="'dpd-'+host" :value="host">
                {{ host }}
              </option>
            </select>
          </div>
        </div>

        <!-- User entries -->
        <div class="hm-card">
          <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 class="text-sm font-semibold text-gray-300">User Overrides</h2>
            <input v-model="userQuery" class="hm-input text-xs mr-2" placeholder="Search users…" aria-label="Search users" />
            <button @click="openAddUser" class="btn btn-ghost text-xs" v-if="!showAddUser">
              + Add User
            </button>
          </div>

          <!-- Add user form with autocomplete -->
          <div v-if="showAddUser" class="mb-4 p-3 bg-gray-800 rounded border border-gray-700">
            <div class="flex items-center gap-3 relative">
              <discord-user-combobox class="w-72" :members="members" :excluded-ids="allUserIds"
                                      options-id="host-user-options" placeholder="Search users…"
                                      aria-label="Search users" autofocus @select="addUserById" />
              <button @click="showAddUser = false" class="btn btn-ghost text-xs">Cancel</button>
            </div>
          </div>

          <!-- Users table -->
          <div v-if="visibleUserIds.length > 0" class="table-responsive">
            <table class="hm-table host-access-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Tier</th><th>Hosts</th>
                <th class="text-center" style="min-width:120px">Default Host</th>
                <th class="text-center" style="width:80px">Remove</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="uid in visibleUserIds" :key="uid">
                <td class="text-sm">
                  <discord-identity :user-id="uid" :members="members" />
                </td>
                <td><div v-if="permissions.invalid_overrides?.[uid]" class="text-xs text-amber-300">Invalid tier: {{ permissions.invalid_overrides[uid] }} <select v-model="repairTiers[uid]" class="hm-input text-xs ml-1"><option value="">Choose tier</option><option v-for="tier in validTiers" :key="tier" :value="tier">{{ tier }}</option></select> <button class="btn btn-ghost text-xs" :disabled="!repairTiers[uid]" @click="repairTier(uid)">Repair</button></div><select v-else :value="tierValue(uid)" @change="setTier(uid, $event.target.value)" :aria-label="'Tier for ' + uid" class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300"><option value="default">default</option><option value="admin">admin</option><option value="user">user</option><option value="guest">guest</option></select></td>
                <td class="host-chip-cell"><button class="host-chip-editor" @click="toggleEditor(uid)" :aria-label="'Edit hosts for ' + uid"><span v-for="chip in visibleHostChips(uid)" :key="chip" class="host-chip">{{ chip }}</span></button><div v-if="editor===uid" class="hm-card host-access-editor p-3"><label class="flex gap-2 text-sm mb-2"><input type="checkbox" :checked="users[uid]?.allow_all || false" @change="setAllHosts(uid, $event.target.checked)" /> All hosts, including hosts added later</label><input v-model="hostQuery" class="hm-input w-full mb-2" placeholder="Search hosts…" aria-label="Search hosts" /><div class="max-h-48 overflow-y-auto space-y-1"><label v-for="host in filteredHosts" :key="uid+host" class="flex gap-2 text-sm"><input type="checkbox" :checked="hostChecked(uid, host)" @change="toggleUserHost(uid, host, $event.target.checked)" />{{ host }}</label></div></div></td>
                <td class="text-center">
                  <select :value="users[uid]?.default_host || ''" :aria-label="'Default host for ' + (getMember(uid)?.display_name || uid)" @change="setUserDefault(uid, $event.target.value)"
                          class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300">
                    <option value="">— none —</option>
                    <option v-for="host in (users[uid]?.allow_all ? availableHosts : (users[uid]?.allowed_hosts || []))" :key="uid+'-def-'+host" :value="host">
                      {{ host }}
                    </option>
                  </select>
                </td>
                <td class="text-center">
                  <button v-if="hostOverrideIds.includes(uid)" @click="deleteUser(uid)" class="text-red-400 hover:text-red-300 text-xs">Remove</button>
                </td>
              </tr>
            </tbody>
          </table>
          </div>
          <p v-else class="text-xs text-gray-500">No user overrides configured. All users follow the default policy.</p>
        </div>
      </div>

    </div>
  `,

  setup() {
    const loading = ref(true);
    const error = ref('');
    const data = ref(null);
    const availableHosts = ref([]);
    const hostDescriptions = ref({});
    const defaultPolicy = ref({ allowed_hosts: [], default_host: '' });
    const users = ref({});
    const hostOverrideIds = ref([]);
    const showAddUser = ref(false);
    const members = ref([]);
    const permissions = ref({ overrides: {}, config_tiers: {}, invalid_overrides: {} });
    const validTiers = ['admin', 'user', 'guest'];
    const repairTiers = ref({});
    const editor = ref('');
    const hostQuery = ref('');
    const userQuery = ref('');
    const filteredHosts = computed(() => availableHosts.value.filter(h => `${h} ${hostDescriptions.value[h] || ''}`.toLowerCase().includes(hostQuery.value.toLowerCase())));
    const allUserIds = computed(() => [...new Set([...Object.keys(users.value), ...Object.keys(permissions.value.overrides || {}), ...Object.keys(permissions.value.config_tiers || {}), ...Object.keys(permissions.value.invalid_overrides || {})])]);
    const visibleUserIds = computed(() => allUserIds.value.filter(uid => `${getMember(uid)?.display_name || ''} ${getMember(uid)?.username || ''} ${uid}`.toLowerCase().includes(userQuery.value.toLowerCase())));

    const membersById = computed(() => {
      const map = {};
      for (const m of members.value) map[m.id] = m;
      return map;
    });

    function getMember(uid) {
      return membersById.value[uid] || null;
    }

    function hostSummary(entry) {
      if (!entry || entry.allow_all) return 'All hosts';
      const hosts = entry.allowed_hosts || [];
      return hosts.length > 3 ? `${hosts.slice(0, 3).join(', ')} +${hosts.length - 3}` : hosts.join(', ') || 'No hosts';
    }
    function hostChips(entry) {
      if (entry.allow_all) return ['All hosts'];
      const hosts = entry.allowed_hosts || [];
      return [...hosts.slice(0, 2), ...(hosts.length > 2 ? [`+${hosts.length - 2}`] : []), ...(hosts.length ? [] : ['None'])];
    }
    function visibleHostChips(uid) {
      if (!hostOverrideIds.value.includes(uid)) return ['Inherit policy'];
      return hostChips(users.value[uid]);
    }
    function toggleEditor(key) { editor.value = editor.value === key ? '' : key; hostQuery.value = ''; }
    function policyFor(key) { return key === 'default' ? defaultPolicy.value : users.value[key]; }
    function ensureUserHostEntry(uid) {
      if (!users.value[uid]) users.value[uid] = { ...defaultPolicy.value, allowed_hosts: [...defaultPolicy.value.allowed_hosts] };
      if (!hostOverrideIds.value.includes(uid)) hostOverrideIds.value.push(uid);
      return users.value[uid];
    }
    function hostChecked(uid, host) {
      if (hostOverrideIds.value.includes(uid)) {
        const entry = users.value[uid];
        return entry.allow_all || entry.allowed_hosts.includes(host);
      }
      return defaultPolicy.value.allow_all || defaultPolicy.value.allowed_hosts.includes(host);
    }
    function setAllHosts(key, enabled) {
      const entry = key === 'default' ? defaultPolicy.value : ensureUserHostEntry(key);
      entry.allow_all = enabled;
      if (enabled) entry.allowed_hosts = [...availableHosts.value];
      if (key === 'default') saveDefaultPolicy(); else saveUser(key);
    }
    function tierValue(uid) { return permissions.value.overrides?.[uid] || permissions.value.config_tiers?.[uid] || 'default'; }
    async function setTier(uid, tier) {
      try {
        if (tier === 'default') {
          if (!permissions.value.overrides?.[uid]) return;
          await api.del(`/api/permissions/user/${encodeURIComponent(uid)}`);
        }
        else await api.put(`/api/permissions/user/${encodeURIComponent(uid)}`, { tier });
        if (tier === 'default') delete permissions.value.overrides[uid];
        else permissions.value.overrides[uid] = tier;
        toast.success('Permission tier updated');
      } catch (e) { toast.error(e.message || 'Failed to update tier'); await fetchData(); }
    }
    async function repairTier(uid) {
      const tier = repairTiers.value[uid]; if (!tier) return;
      try {
        await api.post(`/api/permissions/user/${encodeURIComponent(uid)}/repair`, { tier });
        delete permissions.value.invalid_overrides[uid];
        permissions.value.overrides[uid] = tier;
      } catch (e) { toast.error(e.message || 'Failed to repair tier'); }
    }


    function normalizeEntry(entry, hosts) {
      if (!entry) return { allowed_hosts: [...hosts], default_host: hosts[0] || '', allow_all: true };
      if (entry.allowed_hosts === null || entry.allowed_hosts === undefined) {
        return { allowed_hosts: [...hosts], default_host: entry.default_host || '', allow_all: true };
      }
      return { allowed_hosts: entry.allowed_hosts, default_host: entry.default_host || '', allow_all: false };
    }

    // Security policy writes are serialized through one coordinator. A stale
    // callback must not merely be ignored: if it committed on the server it
    // advances the last-confirmed baseline before a later failure rolls back.
    // Refreshes join the same queue so an old GET cannot overwrite a new PUT.
    const coordinator = createHostAccessMutationCoordinator({
      applyDefault: async (attempted) => {
        const hosts = attempted.allow_all ? null : attempted.allowed_hosts;
        await api.put('/api/host-access/default-policy', {
          allowed_hosts: hosts,
          default_host: attempted.default_host,
        });
      },
      applyUser: async (uid, attempted) => {
        const hosts = attempted.allow_all ? null : attempted.allowed_hosts;
        await api.put(`/api/host-access/user/${uid}`, {
          allowed_hosts: hosts,
          default_host: attempted.default_host,
        });
      },
      applyDelete: (uid) => api.del(`/api/host-access/user/${uid}`),
      onDefaultConfirmed: () => toast.success('Default policy updated'),
      onDefaultRollback: (confirmed) => {
        if (confirmed) defaultPolicy.value = confirmed;
      },
      onUserConfirmed: (uid) => {
        const m = getMember(uid);
        toast.success(`Updated access for ${m ? m.display_name : uid}`);
      },
      onUserRollback: (uid, confirmed) => {
        const next = { ...users.value };
        if (confirmed) next[uid] = confirmed;
        else delete next[uid];
        users.value = next;
        if (!confirmed) hostOverrideIds.value = hostOverrideIds.value.filter(id => id !== uid);
      },
      onUserDeleted: (uid) => {
        const next = { ...users.value };
        delete next[uid];
        users.value = next;
        hostOverrideIds.value = hostOverrideIds.value.filter(id => id !== uid);
      },
      onError: (e, context) => {
        const suffix = context.uid ? ` ${getMember(context.uid)?.display_name || context.uid}` : '';
        toast.error(`${e.message || 'Failed to save'} — reverted${suffix}`);
      },
    });

    let fetchGeneration = 0;
    async function fetchData() {
      const generation = ++fetchGeneration;
      loading.value = true;
      error.value = '';
      try {
        const hostResp = await coordinator.readSnapshot(
          () => api.get('/api/host-access')
        );
        if (generation !== fetchGeneration) return;
        data.value = hostResp;
        availableHosts.value = hostResp.available_hosts || [];
        hostDescriptions.value = hostResp.host_descriptions || {};
        defaultPolicy.value = normalizeEntry(hostResp.default_policy, availableHosts.value);
        const rawUsers = hostResp.users || {};
        hostOverrideIds.value = Object.keys(rawUsers);
        const normalized = {};
        for (const [uid, entry] of Object.entries(rawUsers)) {
          normalized[uid] = normalizeEntry(entry, availableHosts.value);
        }
        users.value = normalized;
        coordinator.seed(defaultPolicy.value, normalized);
        permissions.value = await api.get('/api/permissions/tiers');
      } catch (e) {
        if (generation === fetchGeneration) {
          error.value = e.message || 'Failed to fetch host access data';
        }
      } finally {
        if (generation === fetchGeneration) loading.value = false;
      }
      try {
        const loadedMembers = await api.get('/api/discord/members') || [];
        if (generation === fetchGeneration) members.value = loadedMembers;
      } catch {
        if (generation === fetchGeneration) members.value = [];
      }
    }

    // Select-driven saves used to fire one PUT (and one toast) per arrow
    // keypress (audit 6.3). Saves are debounced per key and read the LATEST
    // draft at fire time, so scrubbing through options commits one final
    // state. The coordinator below still owns serialization and rollback.
    const SAVE_DEBOUNCE_MS = 500;
    const pendingSaves = new Map(); // key -> { timer, run }

    function scheduleSave(key, run) {
      const prior = pendingSaves.get(key);
      if (prior) clearTimeout(prior.timer);
      const entry = { run, timer: null };
      entry.timer = setTimeout(() => {
        pendingSaves.delete(key);
        run();
      }, SAVE_DEBOUNCE_MS);
      pendingSaves.set(key, entry);
    }

    function cancelPendingSave(key) {
      const prior = pendingSaves.get(key);
      if (prior) {
        clearTimeout(prior.timer);
        pendingSaves.delete(key);
      }
    }

    // Flush, never cancel: a user's last edit must not silently vanish when
    // they navigate away before the quiet window elapses.
    function flushPendingSaves() {
      for (const [key, entry] of [...pendingSaves]) {
        clearTimeout(entry.timer);
        pendingSaves.delete(key);
        entry.run();
      }
    }

    function saveDefaultPolicy() {
      // No parameters: this is bound directly as a @change handler. Passing a
      // snapshot here receives the DOM Event because v-model has already run.
      scheduleSave('default', () => coordinator.saveDefault(defaultPolicy.value));
    }

    function toggleDefaultHost(host, checked) {
      defaultPolicy.value.allow_all = false;
      if (checked) {
        if (!defaultPolicy.value.allowed_hosts.includes(host))
          defaultPolicy.value.allowed_hosts.push(host);
      } else {
        defaultPolicy.value.allowed_hosts = defaultPolicy.value.allowed_hosts.filter(h => h !== host);
        if (defaultPolicy.value.default_host === host)
          defaultPolicy.value.default_host = defaultPolicy.value.allowed_hosts[0] || '';
      }
      saveDefaultPolicy();
    }

    function saveUser(uid) {
      // The entry is re-read at fire time: coalesced edits send ONE snapshot
      // carrying every change, and a user deleted during the quiet window
      // resolves to nothing rather than a resurrecting PUT.
      scheduleSave(`user:${uid}`, () => {
        const entry = users.value[uid];
        if (!entry) return;
        coordinator.saveUser(uid, entry);
      });
    }

    function toggleUserHost(uid, host, checked) {
      const entry = ensureUserHostEntry(uid);
      entry.allow_all = false;
      if (checked) {
        if (!entry.allowed_hosts.includes(host))
          entry.allowed_hosts.push(host);
      } else {
        entry.allowed_hosts = entry.allowed_hosts.filter(h => h !== host);
        if (entry.default_host === host)
          entry.default_host = entry.allowed_hosts[0] || '';
      }
      saveUser(uid);
    }

    function setUserDefault(uid, host) {
      const entry = ensureUserHostEntry(uid);
      entry.default_host = host;
      saveUser(uid);
    }

    function openAddUser() {
      showAddUser.value = true;
    }

    function addUserById(uid) {
      if (!/^\d{15,25}$/.test(uid) || users.value[uid]) return;
      users.value[uid] = {
        allowed_hosts: [...availableHosts.value],
        default_host: availableHosts.value[0] || '',
        allow_all: false,
      };
      if (!hostOverrideIds.value.includes(uid)) hostOverrideIds.value.push(uid);
      // A deliberate button action commits immediately — only per-keypress
      // control changes ride the debounce.
      coordinator.saveUser(uid, users.value[uid]);
      showAddUser.value = false;
    }

    async function deleteUser(uid) {
      const m = getMember(uid);
      const ok = await confirmDialog({
        title: 'Remove user override',
        message: `Remove the host access override for ${m ? m.display_name : uid}? They will fall back to the default policy.`,
        confirmLabel: 'Remove',
        danger: true,
      });
      if (!ok) return;
      // A save still sitting in its quiet window must not fire after the
      // delete and resurrect the entry.
      cancelPendingSave(`user:${uid}`);
      await coordinator.deleteUser(uid);
      // The coordinator publishes only after the server confirms deletion and
      // participates in the same ordering protocol as in-flight PUTs.
      if (!users.value[uid]) {
        toast.success(`Removed override for ${m ? m.display_name : uid}`);
      }
    }

    onMounted(fetchData);
    // The tab host keeps this component alive; pending edits are committed,
    // not dropped, when the operator switches away.
    onDeactivated(flushPendingSaves);
    onUnmounted(flushPendingSaves);

    return {
      loading, error, data, availableHosts, hostDescriptions, defaultPolicy, users,
      showAddUser, members,
      hostOverrideIds,
      fetchData, saveDefaultPolicy, toggleDefaultHost, getMember,
      toggleUserHost, setUserDefault, openAddUser, addUserById, deleteUser,
      permissions, validTiers, repairTiers, repairTier, tierValue, setTier,
      editor, hostQuery, userQuery, filteredHosts, allUserIds, visibleUserIds, hostSummary, hostChips, hostChecked, toggleEditor, setAllHosts,
      flushPendingSaves, visibleHostChips,
    };
  },
};
