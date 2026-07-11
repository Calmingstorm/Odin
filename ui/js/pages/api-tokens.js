import { api } from '../api.js';
import { toast } from '../toast.js';
import { confirmDialog } from '../confirm.js';
import { computed, nextTick, onMounted, ref } from 'vue';


export default {
  template: `
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">API Tokens</h1>
        <button @click="fetchData" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
      <p class="text-xs text-gray-500 mb-6">
        Manage API tokens for programmatic access, orchestrators, and web-chat identity.
        Each token has its own user identity, permission tier, and host access scope.
      </p>

      <div v-if="loading && !tokens" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state">
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchData" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else class="space-y-6">
        <!-- New token created banner -->
        <div v-if="newToken" class="hm-card border-green-800 bg-green-950/30">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-semibold text-green-400">Token Created</span>
            <button @click="newToken = null" class="text-gray-500 hover:text-gray-300 text-xs">Dismiss</button>
          </div>
          <p class="text-xs text-gray-400 mb-2">Copy this token now. It will not be shown again.</p>
          <div class="flex items-center gap-2">
            <code class="bg-gray-900 px-3 py-1.5 rounded text-sm text-green-300 flex-1 overflow-x-auto">{{ newToken }}</code>
            <button @click="copyToken" class="btn btn-primary text-xs">Copy</button>
          </div>
        </div>

        <!-- Create token form -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">Create Token</h2>
            <button @click="showCreate = !showCreate" class="btn btn-ghost text-xs">
              {{ showCreate ? 'Cancel' : '+ New Token' }}
            </button>
          </div>
          <div v-if="showCreate" class="space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-gray-500 block mb-1">User ID (unique identifier)
                <input v-model="createForm.user_id" class="hm-input w-full text-sm"
                       placeholder="e.g. orchestrator-1" />
                </label>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Display Name
                <input v-model="createForm.username" class="hm-input w-full text-sm"
                       placeholder="e.g. Task Orchestrator" />
                </label>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Permission Tier
                <select v-model="createForm.tier" class="hm-input w-full text-sm">
                  <option value="admin">admin — full tool access</option>
                  <option value="user">user — read-only tools</option>
                  <option value="guest">guest — chat only, no tools</option>
                </select>
                </label>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Label (description)
                <input v-model="createForm.label" class="hm-input w-full text-sm"
                       placeholder="e.g. CI/CD pipeline" />
                </label>
              </div>
            </div>
            <div>
              <label class="text-xs text-gray-500 block mb-1">Host Access
              <select v-model="createForm.host_mode" class="hm-input w-full text-sm mb-2">
                <option value="default">Use default host policy</option>
                <option value="select">Restrict to selected hosts</option>
                <option value="none">No host access (chat only)</option>
              </select>
              </label>
              <div v-if="createForm.host_mode === 'select'" class="flex flex-wrap gap-3">
                <label v-for="host in availableHosts" :key="'ch-'+host"
                       class="flex items-center gap-2 text-sm">
                  <input type="checkbox" :checked="createForm.allowed_hosts.includes(host)"
                         @change="toggleCreateHost(host, $event.target.checked)"
                         class="rounded border-gray-600 bg-gray-800" />
                  <span class="text-gray-300">{{ host }}</span>
                </label>
              </div>
            </div>
            <div>
              <label class="text-xs text-gray-500 block mb-1">Default Host
              <select v-model="createForm.default_host" class="hm-input w-full text-sm"
                      :disabled="createForm.host_mode === 'none'">
                <option value="">Use host policy default</option>
                <option v-for="host in createDefaultHostOptions" :key="'cdh-'+host" :value="host">
                  {{ host }}
                </option>
              </select>
              </label>
              <p class="text-xs text-gray-500 mt-1">Used when API requests don't specify a host.</p>
            </div>
            <div>
              <label class="text-xs text-gray-500 block mb-1">Allowed Tools (comma-separated, leave empty for tier default)
              <input v-model="createForm.allowed_tools_str" class="hm-input w-full text-sm"
                     placeholder="e.g. run_command, web_search, fetch_url" />
              </label>
            </div>
            <div class="flex justify-end">
              <button @click="createToken" class="btn btn-primary text-sm" :disabled="!createForm.user_id.trim() || creating">
                {{ creating ? 'Creating...' : 'Create Token' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Token list -->
        <div class="hm-card">
          <h2 class="text-sm font-semibold text-gray-300 mb-3">Active Tokens</h2>
          <div v-if="!tokens || tokens.length === 0" class="text-xs text-gray-500 py-4 text-center">
            No API tokens configured.
          </div>
          <div v-else class="overflow-x-auto">
            <table class="hm-table w-full text-sm">
              <thead>
                <tr>
                  <th class="text-left">User ID</th>
                  <th class="text-left">Label</th>
                  <th class="text-left">Tier</th>
                  <th class="text-left">Hosts</th>
                  <th class="text-left">Default</th>
                  <th class="text-left">Tools</th>
                  <th class="text-left">Source</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in tokens" :key="t.user_id">
                  <td class="font-mono text-xs text-gray-300">{{ t.user_id }}</td>
                  <td class="text-gray-400">{{ t.label || '—' }}</td>
                  <td>
                    <span :class="tierBadge(t.tier)">{{ t.tier }}</span>
                  </td>
                  <td class="text-gray-400 text-xs">
                    {{ t.allowed_hosts === null || t.allowed_hosts === undefined ? 'default policy' : t.allowed_hosts.length === 0 ? 'no host access' : t.allowed_hosts.join(', ') }}
                  </td>
                  <td class="text-gray-400 text-xs font-mono">
                    {{ t.default_host || 'policy' }}
                  </td>
                  <td class="text-gray-400 text-xs">
                    {{ t.allowed_tools && t.allowed_tools.length ? t.allowed_tools.length + ' tools' : 'tier default' }}
                  </td>
                  <td>
                    <span class="text-xs px-1.5 py-0.5 rounded"
                          :class="t.source === 'config' ? 'bg-gray-700 text-gray-400' : 'bg-blue-900/50 text-blue-400'">
                      {{ t.source === 'config' ? 'config.yml' : 'dynamic' }}
                    </span>
                  </td>
                  <td class="text-right space-x-2" v-if="t.source !== 'config'">
                    <button @click="startEdit(t)" class="text-blue-400 hover:text-blue-300 text-xs">Edit</button>
                    <button @click="confirmRegenerate(t)" class="text-yellow-400 hover:text-yellow-300 text-xs">Regen</button>
                    <button @click="confirmDelete(t)" class="text-red-400 hover:text-red-300 text-xs">Delete</button>
                  </td>
                  <td class="text-right text-xs text-gray-600" v-else>read-only</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Edit modal -->
        <div v-if="editing" class="modal-overlay" v-modal-focus @click.self="editing = null" @keyup.escape="editing = null" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="token-edit-title">
          <div class="modal-content" style="max-width:640px">
            <h3 id="token-edit-title" class="text-sm font-semibold text-gray-300 mb-4">Edit Token: {{ editing.user_id }}</h3>
            <div class="space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="text-xs text-gray-500 block mb-1">Display Name
                  <input v-model="editForm.username" class="hm-input w-full text-sm" />
                  </label>
                </div>
                <div>
                  <label class="text-xs text-gray-500 block mb-1">Tier
                  <select v-model="editForm.tier" class="hm-input w-full text-sm">
                    <option value="admin">admin</option>
                    <option value="user">user</option>
                    <option value="guest">guest</option>
                  </select>
                  </label>
                </div>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Label
                <input v-model="editForm.label" class="hm-input w-full text-sm" />
                </label>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Host Access
                <select v-model="editForm.host_mode" class="hm-input w-full text-sm mb-2">
                  <option value="default">Use default host policy</option>
                  <option value="select">Restrict to selected hosts</option>
                  <option value="none">No host access (chat only)</option>
                </select>
                </label>
                <div v-if="editForm.host_mode === 'select'" class="flex flex-wrap gap-3">
                  <label v-for="host in availableHosts" :key="'eh-'+host"
                         class="flex items-center gap-2 text-sm">
                    <input type="checkbox" :checked="editForm.allowed_hosts.includes(host)"
                           @change="toggleEditHost(host, $event.target.checked)"
                           class="rounded border-gray-600 bg-gray-800" />
                    <span class="text-gray-300">{{ host }}</span>
                  </label>
                </div>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Default Host
                <select v-model="editForm.default_host" class="hm-input w-full text-sm"
                        :disabled="editForm.host_mode === 'none'">
                  <option value="">Use host policy default</option>
                  <option v-for="host in editDefaultHostOptions" :key="'edh-'+host" :value="host">
                    {{ host }}
                  </option>
                </select>
                </label>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Allowed Tools (comma-separated, empty for tier default)
                <input v-model="editForm.allowed_tools_str" class="hm-input w-full text-sm" />
                </label>
              </div>
              <div class="flex justify-end gap-2 pt-2">
                <button @click="editing = null" class="btn btn-ghost text-sm">Cancel</button>
                <button @click="saveEdit" class="btn btn-primary text-sm" :disabled="saving">
                  {{ saving ? 'Saving...' : 'Save' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  `,
  setup() {
    const loading = ref(true);
    const error = ref('');
    const tokens = ref(null);
    const availableHosts = ref([]);
    const showCreate = ref(false);
    const creating = ref(false);
    const newToken = ref(null);
    const editing = ref(null);
    const saving = ref(false);

    const createForm = ref({
      user_id: '', username: '', tier: 'admin', label: '',
      host_mode: 'default', allowed_hosts: [], default_host: '', allowed_tools_str: '',
    });

    const editForm = ref({
      username: '', tier: 'admin', label: '',
      host_mode: 'default', allowed_hosts: [], default_host: '', allowed_tools_str: '',
    });

    const createDefaultHostOptions = computed(() => {
      if (createForm.value.host_mode === 'select') return createForm.value.allowed_hosts;
      if (createForm.value.host_mode === 'none') return [];
      return availableHosts.value;
    });

    const editDefaultHostOptions = computed(() => {
      if (editForm.value.host_mode === 'select') return editForm.value.allowed_hosts;
      if (editForm.value.host_mode === 'none') return [];
      return availableHosts.value;
    });

    function tierBadge(tier) {
      if (tier === 'admin') return 'text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400';
      if (tier === 'user') return 'text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400';
      return 'text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400';
    }

    async function fetchData() {
      loading.value = true;
      error.value = '';
      try {
        const data = await api.get('/api/tokens');
        tokens.value = data.tokens || [];
        availableHosts.value = data.available_hosts || [];
      } catch (e) {
        error.value = e.message || 'Failed to load tokens';
      } finally {
        loading.value = false;
      }
    }

    function parseTools(str) {
      if (!str || !str.trim()) return [];
      return str.split(',').map(s => s.trim()).filter(Boolean);
    }

    function toggleCreateHost(host, checked) {
      const h = createForm.value.allowed_hosts;
      if (checked && !h.includes(host)) h.push(host);
      if (!checked) {
        const i = h.indexOf(host);
        if (i >= 0) h.splice(i, 1);
      }
    }

    function toggleEditHost(host, checked) {
      const h = editForm.value.allowed_hosts;
      if (checked && !h.includes(host)) h.push(host);
      if (!checked) {
        const i = h.indexOf(host);
        if (i >= 0) h.splice(i, 1);
      }
    }

    async function createToken() {
      creating.value = true;
      try {
        const tools = parseTools(createForm.value.allowed_tools_str);
        const mode = createForm.value.host_mode;
        const hostPayload = mode === 'none' ? [] : mode === 'select' ? createForm.value.allowed_hosts : null;
        const body = {
          user_id: createForm.value.user_id.trim(),
          username: createForm.value.username.trim() || 'API',
          tier: createForm.value.tier,
          label: createForm.value.label.trim(),
          allowed_tools: tools.length ? tools : [],
        };
        if (hostPayload !== null) body.allowed_hosts = hostPayload;
        body.default_host = createForm.value.default_host || '';
        const data = await api.post('/api/tokens', body);
        newToken.value = data.token;
        createForm.value = { user_id: '', username: '', tier: 'admin', label: '', host_mode: 'default', allowed_hosts: [], default_host: '', allowed_tools_str: '' };
        showCreate.value = false;
        toast.success('Token created');
        await fetchData();
      } catch (e) {
        toast.error(e.data?.error || e.message || 'Failed to create token');
      } finally {
        creating.value = false;
      }
    }

    function startEdit(t) {
      editing.value = t;
      const hosts = t.allowed_hosts;
      let mode = 'default';
      if (hosts === null || hosts === undefined) mode = 'default';
      else if (Array.isArray(hosts) && hosts.length === 0) mode = 'none';
      else if (Array.isArray(hosts)) mode = 'select';
      editForm.value = {
        username: t.username || '',
        tier: t.tier || 'admin',
        label: t.label || '',
        host_mode: mode,
        allowed_hosts: Array.isArray(hosts) ? [...hosts] : [],
        default_host: t.default_host || '',
        allowed_tools_str: (t.allowed_tools || []).join(', '),
      };
    }

    async function saveEdit() {
      if (!editing.value) return;
      saving.value = true;
      try {
        const tools = parseTools(editForm.value.allowed_tools_str);
        const mode = editForm.value.host_mode;
        const body = {
          username: editForm.value.username,
          tier: editForm.value.tier,
          label: editForm.value.label,
          allowed_tools: tools,
        };
        if (mode === 'none') body.allowed_hosts = [];
        else if (mode === 'select') body.allowed_hosts = editForm.value.allowed_hosts;
        else body.allowed_hosts = null;
        body.default_host = editForm.value.default_host || '';
        await api.put('/api/tokens/' + encodeURIComponent(editing.value.user_id), body);
        editing.value = null;
        toast.success('Token updated');
        await fetchData();
      } catch (e) {
        toast.error(e.data?.error || e.message || 'Failed to update');
      } finally {
        saving.value = false;
      }
    }

    async function confirmRegenerate(t) {
      const ok = await confirmDialog({
        title: 'Regenerate token',
        message: `Regenerate token for ${t.username || t.user_id}? The old token will stop working immediately.`,
        confirmLabel: 'Regenerate',
        danger: true,
      });
      if (!ok) return;
      try {
        const data = await api.post('/api/tokens/' + encodeURIComponent(t.user_id) + '/regenerate');
        newToken.value = data.token;
        toast.success('Token regenerated');
      } catch (e) {
        toast.error(e.data?.error || e.message || 'Failed to regenerate');
      }
    }

    async function confirmDelete(t) {
      const ok = await confirmDialog({
        title: 'Delete token',
        message: `Delete token for ${t.username || t.user_id}? This cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.del('/api/tokens/' + encodeURIComponent(t.user_id));
        toast.success('Token deleted');
        await fetchData();
      } catch (e) {
        toast.error(e.data?.error || e.message || 'Failed to delete');
      }
    }

    async function copyToken() {
      if (!newToken.value) return;
      try {
        await navigator.clipboard.writeText(newToken.value);
        toast.success('Copied to clipboard');
      } catch {
        toast.error('Copy failed — select and copy manually');
      }
    }

    onMounted(fetchData);

    return {
      loading, error, tokens, availableHosts, showCreate, creating,
      newToken, editing, saving, createForm, editForm,
      createDefaultHostOptions, editDefaultHostOptions,
      fetchData, tierBadge, toggleCreateHost, toggleEditHost,
      createToken, startEdit, saveEdit, confirmRegenerate, confirmDelete, copyToken,
    };
  },
};
