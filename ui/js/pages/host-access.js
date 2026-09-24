import { api } from '../api.js';
import { toast } from '../toast.js';
import { confirmDialog } from '../confirm.js';
import { computed, nextTick, onDeactivated, onMounted, onUnmounted, ref } from 'vue';
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
          <div class="host-chip-summary mb-3"><span v-for="chip in hostChips(defaultPolicy)" :key="chip" class="host-chip">{{ chip }}</span></div>
          <button class="btn btn-ghost text-xs" @click="openEditor('default')" aria-label="Edit hosts for Default Policy">Edit hosts</button>
          <p class="text-xs text-gray-500 mt-3">Default host: {{ defaultPolicy.default_host || 'None' }}</p>
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
                <td><div class="host-chip-summary"><span v-for="chip in visibleHostChips(uid)" :key="chip" class="host-chip">{{ chip }}</span></div><button class="btn btn-ghost text-xs mt-2" @click="openEditor(uid)" :aria-label="'Edit hosts for ' + (getMember(uid)?.display_name || uid)">Edit hosts</button></td>
                <td class="text-center">
                  <span class="host-default-summary">{{ (users[uid] || defaultPolicy).default_host || 'None' }}</span>
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

      <Teleport to="body">
        <dialog ref="hostDialog" class="host-access-modal" tabindex="-1" aria-labelledby="host-editor-title" @cancel.prevent="closeEditor" @keydown="trapEditorFocus">
          <form v-if="draft" class="host-access-modal-form" @submit.prevent="saveEditor">
            <header><h2 id="host-editor-title" class="text-lg font-semibold">Edit hosts</h2><p class="text-sm text-gray-500">{{ editor === 'default' ? 'Default Policy' : (getMember(editor)?.display_name || editor) }}</p></header>
            <fieldset :disabled="saving" class="host-access-modal-body">
              <label class="flex gap-2 text-sm"><input v-model="draft.allow_all" type="checkbox" role="switch" /> All hosts, including hosts added later</label>
              <input v-model="hostQuery" autofocus class="hm-input w-full" placeholder="Search hosts…" aria-label="Search hosts" />
              <div class="host-access-checklist" role="group" aria-label="Allowed hosts">
                <label v-for="host in filteredHosts" :key="host" class="flex gap-2 text-sm"><input v-model="draft.allowed_hosts" type="checkbox" :value="host" :disabled="draft.allow_all" /><span>{{ host }}<small v-if="hostDescriptions[host]" class="block text-gray-500">{{ hostDescriptions[host] }}</small></span></label>
                <p v-if="!filteredHosts.length" class="text-sm text-gray-500">No matching hosts.</p>
              </div>
              <label for="host-editor-default" class="text-sm">Default host</label>
              <select id="host-editor-default" v-model="draft.default_host" class="hm-input w-full" :aria-invalid="!!defaultHostError" aria-describedby="host-editor-validation">
                <option v-if="draft.default_host && !defaultHostOptions.includes(draft.default_host)" :value="draft.default_host" disabled>Choose a new default host</option>
                <option value="" :disabled="requiresDefault && defaultHostOptions.length > 0">None</option>
                <option v-for="host in defaultHostOptions" :key="host" :value="host">{{ host }}</option>
              </select>
              <p id="host-editor-validation" class="text-sm text-amber-300">{{ defaultHostError }}</p>
              <p v-if="saveError" role="alert" class="text-sm text-red-400">{{ saveError }}</p>
            </fieldset>
            <footer class="flex justify-end gap-2"><button type="button" class="btn btn-ghost" :disabled="saving" @click="closeEditor">Cancel</button><button type="submit" class="btn btn-primary" :disabled="saving || !!defaultHostError">{{ saving ? 'Saving…' : 'Save' }}</button></footer>
          </form>
        </dialog>
      </Teleport>
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
    const hostDialog = ref(null);
    const draft = ref(null);
    const saving = ref(false);
    const saveError = ref('');
    const requiresDefault = ref(false);
    const hostQuery = ref('');
    const userQuery = ref('');
    const filteredHosts = computed(() => availableHosts.value.filter(h => `${h} ${hostDescriptions.value[h] || ''}`.toLowerCase().includes(hostQuery.value.toLowerCase())));
    const defaultHostOptions = computed(() => availableHosts.value.filter(h => draft.value?.allow_all || draft.value?.allowed_hosts.includes(h)));
    const defaultHostError = computed(() => {
      if (!draft.value) return '';
      if (draft.value.default_host && !defaultHostOptions.value.includes(draft.value.default_host)) return defaultHostOptions.value.length ? 'Choose a new default from the allowed hosts before saving.' : 'No hosts are allowed. Select None for the default before saving.';
      if (requiresDefault.value && defaultHostOptions.value.length && !draft.value.default_host) return 'Choose a new default from the allowed hosts before saving.';
      return '';
    });
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
    async function openEditor(key) {
      if (saving.value) return;
      const entry = key === 'default' ? defaultPolicy.value : (users.value[key] || defaultPolicy.value);
      editor.value = key;
      draft.value = { ...entry, allowed_hosts: [...entry.allowed_hosts] };
      requiresDefault.value = !!entry.default_host;
      hostQuery.value = '';
      saveError.value = '';
      await nextTick();
      // Native top-layer modal supplies background inertness, viewport placement
      // and return-to-opener focus. Tab wrapping also excludes browser chrome.
      if (draft.value && !hostDialog.value?.open) hostDialog.value?.showModal();
    }
    function closeEditor() {
      if (saving.value) return;
      hostDialog.value?.close();
      draft.value = null;
      editor.value = '';
    }
    function trapEditorFocus(event) {
      if (event.key !== 'Tab') return;
      const controls = [...hostDialog.value.querySelectorAll('button, input, select')].filter(el => !el.matches(':disabled'));
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    async function saveEditor() {
      if (!draft.value || saving.value || defaultHostError.value) return;
      const key = editor.value;
      const attempted = { ...draft.value, allowed_hosts: [...draft.value.allowed_hosts] };
      saving.value = true;
      saveError.value = '';
      await nextTick();
      if (hostDialog.value?.open) hostDialog.value.focus();
      try {
        if (key === 'default') {
          defaultPolicy.value = attempted;
          await coordinator.saveDefault(attempted);
        } else {
          users.value[key] = attempted;
          if (!hostOverrideIds.value.includes(key)) hostOverrideIds.value.push(key);
          await coordinator.saveUser(key, attempted);
        }
      } finally {
        saving.value = false;
      }
      if (!saveError.value) closeEditor();
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
        if (saving.value) saveError.value = e.message || 'Failed to save. Your draft is retained; try again.';
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
      // Deliberate button actions commit through the same serialized queue.
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
      await coordinator.deleteUser(uid);
      // The coordinator publishes only after the server confirms deletion and
      // participates in the same ordering protocol as in-flight PUTs.
      if (!users.value[uid]) {
        toast.success(`Removed override for ${m ? m.display_name : uid}`);
      }
    }

    onMounted(fetchData);
    // Unsaved modal drafts never become policy on navigation. Close even during
    // an already submitted save so a kept-alive tab cannot strand an inert page.
    function dismissEditor() { hostDialog.value?.close(); draft.value = null; editor.value = ''; }
    onDeactivated(dismissEditor);
    onUnmounted(dismissEditor);

    return {
      loading, error, data, availableHosts, hostDescriptions, defaultPolicy, users,
      showAddUser, members,
      hostOverrideIds,
      fetchData, getMember, openAddUser, addUserById, deleteUser,
      permissions, validTiers, repairTiers, repairTier, tierValue, setTier,
      editor, hostQuery, userQuery, filteredHosts, allUserIds, visibleUserIds, hostSummary, hostChips, visibleHostChips,
      hostDialog, draft, saving, saveError, requiresDefault, defaultHostOptions, defaultHostError, openEditor, closeEditor, saveEditor, trapEditorFocus,
    };
  },
};
