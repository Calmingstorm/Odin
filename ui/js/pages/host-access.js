import { api } from '../api.js';

const { ref, computed, onMounted, nextTick } = Vue;

export default {
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
            <span class="text-xs text-gray-500">Default host:</span>
            <select v-model="defaultPolicy.default_host" @change="saveDefaultPolicy"
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
              <div class="relative w-72">
                <input ref="searchInput" v-model="searchQuery" placeholder="Search users..."
                       @input="onSearchInput" @keydown.down.prevent="highlightNext"
                       @keydown.up.prevent="highlightPrev" @keydown.enter.prevent="selectHighlighted"
                       @keydown.escape="closeDropdown" @blur="onBlur"
                       class="bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-300 w-full" />
                <div v-if="showDropdown && (filteredMembers.length > 0 || isRawId)"
                     class="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-gray-900 border border-gray-600 rounded shadow-lg">
                  <div v-if="isRawId && !filteredMembers.length"
                       @mousedown.prevent="addRawId"
                       class="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-gray-800">
                    <div class="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">?</div>
                    <span class="text-gray-200">Add by ID: {{ searchQuery.trim() }}</span>
                    <span class="text-gray-500 text-xs ml-auto">press Enter</span>
                  </div>
                  <div v-for="(m, idx) in filteredMembers" :key="m.id"
                       @mousedown.prevent="selectMember(m)"
                       class="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm"
                       :class="idx === highlightIdx ? 'bg-gray-700' : 'hover:bg-gray-800'">
                    <img v-if="m.avatar_url" :src="m.avatar_url + '?size=24'" class="w-5 h-5 rounded-full" />
                    <div v-else class="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                      {{ m.display_name.charAt(0) }}
                    </div>
                    <span class="text-gray-200">{{ m.display_name }}</span>
                    <span class="text-gray-500 text-xs">{{ m.username }}</span>
                    <span v-if="m.bot" class="text-xs px-1 rounded bg-indigo-900 text-indigo-300 ml-auto">BOT</span>
                  </div>
                </div>
              </div>
              <button @click="showAddUser = false; searchQuery = ''" class="btn btn-ghost text-xs">Cancel</button>
            </div>
          </div>

          <!-- Users table -->
          <table v-if="Object.keys(users).length > 0" class="hm-table">
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
                         @change="toggleUserHost(uid, host, $event.target.checked)"
                         class="rounded border-gray-600 bg-gray-800" />
                </td>
                <td class="text-center">
                  <select :value="entry.default_host" @change="setUserDefault(uid, $event.target.value)"
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
          <p v-else class="text-xs text-gray-500">No user overrides configured. All users follow the default policy.</p>
        </div>
      </div>

      <!-- Status toast -->
      <div v-if="toast" class="fixed bottom-6 right-6 px-4 py-2 rounded text-sm shadow-lg z-50"
           :class="toast.type === 'error' ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'">
        {{ toast.message }}
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
    const searchQuery = ref('');
    const showDropdown = ref(false);
    const highlightIdx = ref(0);
    const toast = ref(null);
    const members = ref([]);
    const searchInput = ref(null);

    let toastTimer = null;
    function showToast(message, type = 'success') {
      toast.value = { message, type };
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.value = null; }, 3000);
    }

    const membersById = computed(() => {
      const map = {};
      for (const m of members.value) map[m.id] = m;
      return map;
    });

    function getMember(uid) {
      return membersById.value[uid] || null;
    }

    const isRawId = computed(() => /^\d{15,25}$/.test(searchQuery.value.trim()));

    const filteredMembers = computed(() => {
      const q = searchQuery.value.toLowerCase().trim();
      if (!q) return members.value.filter(m => !users.value[m.id]);
      return members.value.filter(m =>
        !users.value[m.id] &&
        (m.display_name.toLowerCase().includes(q) ||
         m.username.toLowerCase().includes(q) ||
         m.id.includes(q))
      );
    });

    function normalizeEntry(entry, hosts) {
      if (!entry) return { allowed_hosts: [...hosts], default_host: hosts[0] || '', allow_all: true };
      if (entry.allowed_hosts === null || entry.allowed_hosts === undefined) {
        return { allowed_hosts: [...hosts], default_host: entry.default_host || '', allow_all: true };
      }
      return { allowed_hosts: entry.allowed_hosts, default_host: entry.default_host || '', allow_all: false };
    }

    async function fetchData() {
      loading.value = true;
      error.value = '';
      try {
        const hostResp = await api.get('/api/host-access');
        data.value = hostResp;
        availableHosts.value = hostResp.available_hosts || [];
        defaultPolicy.value = normalizeEntry(hostResp.default_policy, availableHosts.value);
        const rawUsers = hostResp.users || {};
        const normalized = {};
        for (const [uid, entry] of Object.entries(rawUsers)) {
          normalized[uid] = normalizeEntry(entry, availableHosts.value);
        }
        users.value = normalized;
      } catch (e) {
        error.value = e.message || 'Failed to fetch host access data';
      } finally {
        loading.value = false;
      }
      try {
        members.value = await api.get('/api/discord/members') || [];
      } catch {
        members.value = [];
      }
    }

    async function saveDefaultPolicy() {
      try {
        const hosts = defaultPolicy.value.allow_all ? null : defaultPolicy.value.allowed_hosts;
        await api.put('/api/host-access/default-policy', {
          allowed_hosts: hosts,
          default_host: defaultPolicy.value.default_host,
        });
        showToast('Default policy updated');
      } catch (e) {
        showToast(e.message || 'Failed to save', 'error');
      }
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

    async function saveUser(uid) {
      const entry = users.value[uid];
      if (!entry) return;
      try {
        const hosts = entry.allow_all ? null : entry.allowed_hosts;
        await api.put(`/api/host-access/user/${uid}`, {
          allowed_hosts: hosts,
          default_host: entry.default_host,
        });
        const m = getMember(uid);
        showToast(`Updated access for ${m ? m.display_name : uid}`);
      } catch (e) {
        showToast(e.message || 'Failed to save', 'error');
      }
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
      searchQuery.value = '';
      highlightIdx.value = 0;
      nextTick(() => { if (searchInput.value) searchInput.value.focus(); });
    }

    function onSearchInput() {
      showDropdown.value = true;
      highlightIdx.value = 0;
    }

    function highlightNext() {
      if (highlightIdx.value < filteredMembers.value.length - 1) highlightIdx.value++;
    }

    function highlightPrev() {
      if (highlightIdx.value > 0) highlightIdx.value--;
    }

    function selectHighlighted() {
      const m = filteredMembers.value[highlightIdx.value];
      if (m) { selectMember(m); return; }
      if (isRawId.value) addRawId();
    }

    function addRawId() {
      const uid = searchQuery.value.trim();
      if (!/^\d{15,25}$/.test(uid)) return;
      users.value[uid] = { allowed_hosts: [...availableHosts.value], default_host: availableHosts.value[0] || '', allow_all: false };
      saveUser(uid);
      searchQuery.value = '';
      showDropdown.value = false;
      showAddUser.value = false;
    }

    function selectMember(m) {
      users.value[m.id] = { allowed_hosts: [...availableHosts.value], default_host: availableHosts.value[0] || '', allow_all: false };
      saveUser(m.id);
      searchQuery.value = '';
      showDropdown.value = false;
      showAddUser.value = false;
    }

    function closeDropdown() {
      showDropdown.value = false;
    }

    function onBlur() {
      setTimeout(() => { showDropdown.value = false; }, 150);
    }

    async function deleteUser(uid) {
      try {
        await api.delete(`/api/host-access/user/${uid}`);
        delete users.value[uid];
        const m = getMember(uid);
        showToast(`Removed override for ${m ? m.display_name : uid}`);
      } catch (e) {
        showToast(e.message || 'Failed to delete', 'error');
      }
    }

    onMounted(fetchData);

    return {
      loading, error, data, availableHosts, defaultPolicy, users,
      showAddUser, searchQuery, showDropdown, highlightIdx, toast,
      members, filteredMembers, isRawId, searchInput,
      fetchData, saveDefaultPolicy, toggleDefaultHost, getMember,
      toggleUserHost, setUserDefault, openAddUser, deleteUser,
      onSearchInput, highlightNext, highlightPrev, selectHighlighted,
      selectMember, closeDropdown, onBlur, addRawId,
    };
  },
};
