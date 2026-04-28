import { api } from '../api.js';

const { ref, computed, onMounted, onUnmounted } = Vue;

export default {
  template: `
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">Codex Authentication</h1>
        <button @click="fetchStatus" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
      <p class="text-xs text-gray-500 mb-6">
        Manage OpenAI Codex OAuth credentials. Odin uses ChatGPT subscription tokens with automatic refresh and pool rotation.
      </p>

      <div v-if="loading && !data" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state">
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchStatus" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else class="space-y-6">
        <!-- Status overview -->
        <div class="hm-card">
          <h2 class="text-sm font-semibold text-gray-300 mb-3">Status</h2>
          <div v-if="!data.configured" class="text-yellow-400 text-sm">
            No Codex credentials configured. Use the device login below or run
            <code class="bg-gray-800 px-1 rounded">python scripts/codex_login.py</code>
          </div>
          <div v-else class="text-sm text-gray-300">
            {{ data.account_count }} account{{ data.account_count !== 1 ? 's' : '' }} configured,
            active: #{{ data.current_index + 1 }}
          </div>
        </div>

        <!-- Accounts table -->
        <div v-if="data.configured && data.accounts.length" class="hm-card">
          <h2 class="text-sm font-semibold text-gray-300 mb-3">Accounts</h2>
          <table class="hm-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Label</th>
                <th>Email</th>
                <th>Plan</th>
                <th class="text-center">Status</th>
                <th class="text-center">Active</th>
                <th class="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in data.accounts" :key="a.index">
                <td class="text-gray-400">{{ a.index + 1 }}</td>
                <td>
                  <span v-if="editingLabel !== a.index" class="text-gray-200 cursor-pointer hover:text-indigo-300"
                        @click="startEditLabel(a.index, a.label)"
                        :title="a.label ? 'Click to edit' : 'Click to add label'">
                    {{ a.label || '—' }}
                    <span class="text-gray-600 text-xs ml-1">&#9998;</span>
                  </span>
                  <span v-else class="flex items-center gap-1">
                    <input v-model="labelValue" @keydown.enter="saveLabel(a.index)" @keydown.escape="editingLabel = null"
                           class="bg-gray-900 border border-gray-600 rounded px-2 py-0.5 text-sm text-gray-300 w-32" />
                    <button @click="saveLabel(a.index)" class="text-green-400 text-xs">Save</button>
                    <button @click="editingLabel = null" class="text-gray-500 text-xs">Cancel</button>
                  </span>
                </td>
                <td class="text-gray-200">{{ a.email || '—' }}</td>
                <td class="text-xs">
                  <span v-if="a.plan_type" class="px-1.5 py-0.5 rounded"
                        :class="a.plan_type === 'plus' ? 'bg-green-900 text-green-300' : a.plan_type === 'team' ? 'bg-blue-900 text-blue-300' : 'bg-gray-700 text-gray-300'">
                    {{ a.plan_type }}
                  </span>
                  <span v-else class="text-gray-500">—</span>
                </td>
                <td class="text-center">
                  <span v-if="a.error" class="text-red-400 text-xs">Error</span>
                  <span v-else-if="a.expired" class="text-red-400 text-xs">Expired</span>
                  <span v-else-if="a.rate_limited" class="text-yellow-400 text-xs">Rate limited</span>
                  <span v-else class="text-green-400 text-xs">Active</span>
                </td>
                <td class="text-center">
                  <span v-if="a.is_current" class="text-xs px-1 rounded bg-indigo-900 text-indigo-300">Current</span>
                </td>
                <td class="text-center text-xs space-x-2">
                  <button v-if="!a.is_current" @click="activateAccount(a.index)"
                          class="text-green-400 hover:text-green-300">Activate</button>
                  <button @click="refreshAccount(a.index)" :disabled="refreshing === a.index"
                          class="text-blue-400 hover:text-blue-300">
                    {{ refreshing === a.index ? 'Refreshing...' : 'Refresh' }}
                  </button>
                  <button v-if="a.expired || a.error" @click="startReauth(a.index)"
                          class="text-indigo-400 hover:text-indigo-300">Re-auth</button>
                  <button @click="deleteAccount(a.index, a.label || a.email)"
                          class="text-red-400 hover:text-red-300">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Device login -->
        <div class="hm-card">
          <h2 class="text-sm font-semibold text-gray-300 mb-3">Add Account (Device Login)</h2>
          <p class="text-xs text-gray-500 mb-3">
            Authenticate a new Codex account without a local browser. Works on headless servers.
          </p>

          <div v-if="!deviceState">
            <button @click="startDeviceLogin" class="btn btn-primary text-xs" :disabled="deviceLoading">
              {{ deviceLoading ? 'Requesting code...' : 'Start Device Login' }}
            </button>
          </div>

          <div v-else-if="deviceState === 'pending'" class="p-4 bg-gray-800 rounded border border-gray-700">
            <div class="text-sm text-gray-300 mb-3">
              <p class="mb-2">1. Open: <a :href="deviceInfo.verify_url" target="_blank"
                   class="text-indigo-400 hover:text-indigo-300 underline">{{ deviceInfo.verify_url }}</a></p>
              <p>2. Enter code: <code class="bg-gray-900 px-2 py-1 rounded text-lg font-bold text-white">{{ deviceInfo.user_code }}</code></p>
            </div>
            <div class="flex items-center gap-3">
              <div class="text-xs text-gray-500">
                Waiting for authorization...
                <span class="inline-block animate-pulse ml-1">●</span>
              </div>
              <button @click="cancelDeviceLogin" class="btn btn-ghost text-xs">Cancel</button>
            </div>
          </div>

          <div v-else-if="deviceState === 'success'" class="p-4 bg-green-900/30 rounded border border-green-800">
            <p class="text-green-400 text-sm">Authenticated as {{ deviceResult.email }}. Pool reloaded.</p>
            <button @click="deviceState = null" class="btn btn-ghost text-xs mt-2">Done</button>
          </div>

          <div v-else-if="deviceState === 'error'" class="p-4 bg-red-900/30 rounded border border-red-800">
            <p class="text-red-400 text-sm">{{ deviceError }}</p>
            <button @click="deviceState = null" class="btn btn-ghost text-xs mt-2">Try Again</button>
          </div>
        </div>
      </div>

      <!-- Toast -->
      <div v-if="toast" class="fixed bottom-6 right-6 px-4 py-2 rounded text-sm shadow-lg z-50"
           :class="toast.type === 'error' ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'">
        {{ toast.message }}
      </div>
    </div>
  `,

  setup() {
    const loading = ref(true);
    const error = ref('');
    const data = ref({ configured: false, accounts: [] });
    const toast = ref(null);
    const refreshing = ref(null);
    const editingLabel = ref(null);
    const labelValue = ref('');

    const deviceState = ref(null);
    const deviceLoading = ref(false);
    const deviceInfo = ref(null);
    const deviceResult = ref(null);
    const deviceError = ref('');
    const reauthIndex = ref(null);
    let pollController = null;

    let toastTimer = null;
    function showToast(message, type = 'success') {
      toast.value = { message, type };
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.value = null; }, 3000);
    }

    async function fetchStatus() {
      loading.value = true;
      error.value = '';
      try {
        data.value = await api.get('/api/codex/status');
      } catch (e) {
        error.value = e.message || 'Failed to fetch Codex status';
      } finally {
        loading.value = false;
      }
    }

    async function activateAccount(index) {
      try {
        await api.post(`/api/codex/account/${index}/activate`);
        showToast('Active account switched');
        await fetchStatus();
      } catch (e) {
        showToast(e.message || 'Failed to activate', 'error');
      }
    }

    async function refreshAccount(index) {
      refreshing.value = index;
      try {
        await api.post(`/api/codex/account/${index}/refresh`);
        showToast('Token refreshed');
        await fetchStatus();
      } catch (e) {
        showToast(e.message || 'Refresh failed', 'error');
      } finally {
        refreshing.value = null;
      }
    }

    function startEditLabel(index, current) {
      editingLabel.value = index;
      labelValue.value = current || '';
      Vue.nextTick(() => {
        const inputs = document.querySelectorAll('input.bg-gray-900');
        if (inputs.length) inputs[inputs.length - 1].focus();
      });
    }

    async function saveLabel(index) {
      try {
        await api.put(`/api/codex/account/${index}/label`, { label: labelValue.value });
        showToast('Label updated');
        editingLabel.value = null;
        await fetchStatus();
      } catch (e) {
        showToast(e.message || 'Failed to save label', 'error');
      }
    }

    async function deleteAccount(index, name) {
      const label = name && name !== '—' ? name : `account #${index + 1}`;
      if (!confirm(`Delete ${label}?`)) return;
      try {
        await api.del(`/api/codex/account/${index}`);
        showToast(`Deleted ${label}. Pool reloaded.`);
        await fetchStatus();
      } catch (e) {
        showToast(e.message || 'Failed to delete account', 'error');
      }
    }

    function startReauth(index) {
      reauthIndex.value = index;
      startDeviceLogin();
    }

    async function startDeviceLogin() {
      deviceLoading.value = true;
      try {
        const info = await api.post('/api/codex/device-code');
        deviceInfo.value = info;
        deviceState.value = 'pending';
        pollForAuth(info);
      } catch (e) {
        showToast(e.message || 'Failed to request device code', 'error');
      } finally {
        deviceLoading.value = false;
      }
    }

    async function pollForAuth(info) {
      pollController = { cancelled: false };
      const ctrl = pollController;
      try {
        const payload = {
          device_auth_id: info.device_auth_id,
          user_code: info.user_code,
          interval: info.interval,
        };
        if (reauthIndex.value !== null) payload.save_index = reauthIndex.value;
        const result = await api.post('/api/codex/device-poll', payload);
        if (ctrl.cancelled) return;
        deviceResult.value = result;
        deviceState.value = 'success';
        fetchStatus();
      } catch (e) {
        if (ctrl.cancelled) return;
        deviceError.value = e.message || 'Device login failed';
        deviceState.value = 'error';
      }
    }

    function cancelDeviceLogin() {
      if (pollController) pollController.cancelled = true;
      deviceState.value = null;
      deviceInfo.value = null;
      reauthIndex.value = null;
    }

    onMounted(fetchStatus);
    onUnmounted(() => {
      if (pollController) pollController.cancelled = true;
    });

    return {
      loading, error, data, toast, refreshing,
      editingLabel, labelValue,
      deviceState, deviceLoading, deviceInfo, deviceResult, deviceError,
      fetchStatus, activateAccount, refreshAccount, startEditLabel, saveLabel,
      startDeviceLogin, cancelDeviceLogin,
      deleteAccount, startReauth,
    };
  },
};
