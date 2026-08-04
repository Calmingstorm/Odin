import { api } from '../api.js';
import { toast } from '../toast.js';
import { confirmDialog } from '../confirm.js';
import { computed, onMounted, ref } from 'vue';
import { createHostAccessMutationCoordinator } from '../host-access-state.js';
import { DiscordUserCombobox } from '../discord-user-combobox.js';


export default {
  components: { DiscordUserCombobox },
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
          <div class="flex flex-wrap gap-3 mb-3">
            <label v-for="host in availableHosts" :key="'dp-'+host"
                   class="flex items-center gap-2 text-sm">
              <input type="checkbox" :checked="defaultPolicy.allowed_hosts.includes(host)"
                     @change="toggleDefaultHost(host, $event.target.checked)"
                     class="rounded border-gray-600 bg-gray-800" />
              <span class="text-gray-300">{{ host }}</span>
            </label>
          </div>
          <div class="flex items-center gap-3">
            <label for="default-policy-host" class="text-xs text-gray-500">Default host:</label>
            <select id="default-policy-host" v-model="defaultPolicy.default_host" @change="saveDefaultPolicy"
                    class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300">
              <option value="">— none —</option>
              <option v-for="host in defaultPolicy.allowed_hosts" :key="'dpd-'+host" :value="host">
                {{ host }}
              </option>
            </select>
          </div>
        </div>

        <!-- User entries -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">User Overrides</h2>
            <button @click="openAddUser" class="btn btn-ghost text-xs" v-if="!showAddUser">
              + Add User
            </button>
          </div>

          <!-- Add user form with autocomplete -->
          <div v-if="showAddUser" class="mb-4 p-3 bg-gray-800 rounded border border-gray-700">
            <div class="flex items-center gap-3 relative">
              <discord-user-combobox class="w-72" :members="members" :excluded-ids="Object.keys(users)"
                                      options-id="host-user-options" placeholder="Search users…"
                                      aria-label="Search users" autofocus @select="addUserById" />
              <button @click="showAddUser = false" class="btn btn-ghost text-xs">Cancel</button>
            </div>
          </div>

          <!-- Users table -->
          <div v-if="Object.keys(users).length > 0" class="table-responsive">
            <table class="hm-table">
            <thead>
              <tr>
                <th>User</th>
                <th v-for="host in availableHosts" :key="'th-'+host" class="text-center" style="min-width:90px">
                  {{ host }}
                </th>
                <th class="text-center" style="min-width:120px">Default Host</th>
                <th class="text-center" style="width:80px">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(entry, uid) in users" :key="uid">
                <td class="text-sm">
                  <div class="flex items-center gap-2">
                    <img v-if="getMember(uid)?.avatar_url" :src="getMember(uid).avatar_url + '?size=24'"
                         class="w-5 h-5 rounded-full" />
                    <div v-else class="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                      {{ (getMember(uid)?.display_name || '?').charAt(0) }}
                    </div>
                    <span class="text-gray-200">{{ getMember(uid)?.display_name || uid }}</span>
                    <span v-if="getMember(uid)" class="text-gray-500 text-xs">{{ getMember(uid).username }}</span>
                    <span v-if="getMember(uid)?.bot" class="text-xs px-1 rounded bg-indigo-900 text-indigo-300">BOT</span>
                  </div>
                </td>
                <td v-for="host in availableHosts" :key="uid+'-'+host" class="text-center">
                  <input type="checkbox" :checked="entry.allowed_hosts.includes(host)"
                         :aria-label="'Allow ' + (getMember(uid)?.display_name || uid) + ' access to ' + host"
                         @change="toggleUserHost(uid, host, $event.target.checked)"
                         class="rounded border-gray-600 bg-gray-800" />
                </td>
                <td class="text-center">
                  <select :value="entry.default_host" :aria-label="'Default host for ' + (getMember(uid)?.display_name || uid)" @change="setUserDefault(uid, $event.target.value)"
                          class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300">
                    <option value="">— none —</option>
                    <option v-for="host in entry.allowed_hosts" :key="uid+'-def-'+host" :value="host">
                      {{ host }}
                    </option>
                  </select>
                </td>
                <td class="text-center">
                  <button @click="deleteUser(uid)" class="text-red-400 hover:text-red-300 text-xs">Remove</button>
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
    const defaultPolicy = ref({ allowed_hosts: [], default_host: '' });
    const users = ref({});
    const showAddUser = ref(false);
    const members = ref([]);

    const membersById = computed(() => {
      const map = {};
      for (const m of members.value) map[m.id] = m;
      return map;
    });

    function getMember(uid) {
      return membersById.value[uid] || null;
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
      },
      onUserDeleted: (uid) => {
        const next = { ...users.value };
        delete next[uid];
        users.value = next;
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
        defaultPolicy.value = normalizeEntry(hostResp.default_policy, availableHosts.value);
        const rawUsers = hostResp.users || {};
        const normalized = {};
        for (const [uid, entry] of Object.entries(rawUsers)) {
          normalized[uid] = normalizeEntry(entry, availableHosts.value);
        }
        users.value = normalized;
        coordinator.seed(defaultPolicy.value, normalized);
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

    function saveDefaultPolicy() {
      // No parameters: this is bound directly as a @change handler. Passing a
      // snapshot here receives the DOM Event because v-model has already run.
      coordinator.saveDefault(defaultPolicy.value);
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
      const entry = users.value[uid];
      if (!entry) return;
      coordinator.saveUser(uid, entry);
    }

    function toggleUserHost(uid, host, checked) {
      const entry = users.value[uid];
      if (!entry) return;
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
      const entry = users.value[uid];
      if (!entry) return;
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
      saveUser(uid);
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
      await coordinator.deleteUser(uid);
      // The coordinator publishes only after the server confirms deletion and
      // participates in the same ordering protocol as in-flight PUTs.
      if (!users.value[uid]) {
        toast.success(`Removed override for ${m ? m.display_name : uid}`);
      }
    }

    onMounted(fetchData);

    return {
      loading, error, data, availableHosts, defaultPolicy, users,
      showAddUser, members,
      fetchData, saveDefaultPolicy, toggleDefaultHost, getMember,
      toggleUserHost, setUserDefault, openAddUser, addUserById, deleteUser,
    };
  },
};
