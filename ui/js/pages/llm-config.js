import { api } from '../api.js';
import { toast } from '../toast.js';
import { confirmDialog } from '../confirm.js';
import { onMounted, onUnmounted, ref } from 'vue';


export default {
  template: `
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">LLM Configuration</h1>
        <button @click="fetchAll" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
      <p class="text-xs text-gray-500 mb-6">
        Configure which LLM backend Odin uses. Switch between OpenAI Codex (ChatGPT subscription),
        Kimi (Moonshot AI), and Ollama (local/remote open-source models) at any time.
      </p>

      <div v-if="loading && !llmStatus" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>

      <div v-else class="space-y-6">

        <!-- ==================== Active Provider ==================== -->
        <div class="hm-card">
          <h2 class="text-sm font-semibold text-gray-300 mb-3">Active Provider</h2>
          <div v-if="llmStatus" class="space-y-3">
            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" value="codex" v-model="selectedProvider" @change="switchProvider"
                       :disabled="!llmStatus.codex.configured"
                       class="accent-indigo-500" />
                <span class="text-sm" :class="llmStatus.codex.configured ? 'text-gray-200' : 'text-gray-500'">
                  Codex (OpenAI)
                </span>
                <span v-if="!llmStatus.codex.configured" class="text-xs text-yellow-500">— not configured</span>
                <span v-else-if="llmStatus.codex.configured" class="text-xs text-gray-500">
                  {{ llmStatus.codex.model }}
                </span>
                <span v-if="llmStatus.active_provider === 'codex'" class="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">active</span>
              </label>
            </div>
            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" value="ollama" v-model="selectedProvider" @change="switchProvider"
                       :disabled="!llmStatus.ollama.configured"
                       class="accent-indigo-500" />
                <span class="text-sm" :class="llmStatus.ollama.configured ? 'text-gray-200' : 'text-gray-500'">
                  Ollama (Local/Remote)
                </span>
                <span v-if="!llmStatus.ollama.configured" class="text-xs text-yellow-500">— not configured</span>
                <span v-else-if="llmStatus.ollama.configured" class="text-xs text-gray-500">
                  {{ llmStatus.ollama.model }}
                </span>
                <span v-if="llmStatus.active_provider === 'ollama'" class="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">active</span>
              </label>
            </div>
            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" value="kimi" v-model="selectedProvider" @change="switchProvider"
                       :disabled="!llmStatus.kimi.configured"
                       class="accent-indigo-500" />
                <span class="text-sm" :class="llmStatus.kimi.configured ? 'text-gray-200' : 'text-gray-500'">
                  Kimi (Moonshot AI)
                </span>
                <span v-if="!llmStatus.kimi.configured" class="text-xs text-yellow-500">— not configured</span>
                <span v-else-if="llmStatus.kimi.configured" class="text-xs text-gray-500">
                  {{ llmStatus.kimi.model }}
                </span>
                <span v-if="llmStatus.active_provider === 'kimi'" class="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">active</span>
              </label>
            </div>
            <div v-if="llmStatus.active_model" class="mt-2">
              <span class="text-xs text-gray-400">
                Current: <code class="bg-gray-800 px-1 rounded">{{ llmStatus.active_model }}</code>
              </span>
            </div>
          </div>
        </div>

        <!-- ==================== Codex (OpenAI) — Config + Auth ==================== -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">Codex (OpenAI)</h2>
            <div class="flex items-center gap-3">
              <div v-if="codexData.configured" class="text-sm">
                <span class="text-green-400">● Connected</span>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="codexForm.enabled" @change="saveCodexConfig" class="accent-indigo-500" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-xs text-gray-400">Model</label>
              <select v-model="codexForm.model" @change="saveCodexConfig"
                      class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200">
                <option value="gpt-5.6-sol">gpt-5.6-sol</option>
                <option value="gpt-5.6-terra">gpt-5.6-terra</option>
                <option value="gpt-5.5">gpt-5.5</option>
                <option value="gpt-5">gpt-5</option>
                <option value="gpt-5-mini">gpt-5-mini</option>
                <option value="gpt-4.1">gpt-4.1</option>
                <option value="gpt-4o">gpt-4o</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-400">Max Tokens</label>
              <input v-model.number="codexForm.max_tokens" type="number" @keydown.enter="saveCodexConfig"
                     class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200" />
            </div>
            <div>
              <label class="text-xs text-gray-400">Reasoning</label>
              <select v-model="codexForm.reasoning_effort" @change="saveCodexConfig"
                      class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200">
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="xhigh">Extra High</option>
              </select>
            </div>
          </div>
          <div class="border-t border-gray-700 pt-4">
          <h3 class="text-xs font-semibold text-gray-400 mb-2">Authentication</h3>
          <p class="text-xs text-gray-500 mb-4">
            OAuth credentials for ChatGPT subscription. Supports automatic refresh and pool rotation.
          </p>

          <div v-if="codexLoading && !codexData.configured" class="space-y-2">
            <div v-for="n in 2" :key="n" class="skeleton skeleton-row"></div>
          </div>
          <div v-else-if="codexError" class="text-red-400 text-sm">
            {{ codexError }}
            <button @click="fetchCodexStatus" class="btn btn-ghost text-xs ml-2">Retry</button>
          </div>

          <div v-else class="space-y-4">
            <!-- Status -->
            <div v-if="!codexData.configured" class="text-yellow-400 text-sm">
              No Codex credentials configured. Use the device login below or run
              <code class="bg-gray-800 px-1 rounded">python scripts/codex_login.py</code>
            </div>
            <div v-else class="text-sm text-gray-300">
              {{ codexData.account_count }} account{{ codexData.account_count !== 1 ? 's' : '' }} configured,
              active: #{{ codexData.current_index + 1 }}
            </div>

            <!-- Accounts table -->
            <div v-if="codexData.configured && codexData.accounts.length">
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
                  <tr v-for="a in codexData.accounts" :key="a.index">
                    <td class="text-gray-400">{{ a.index + 1 }}</td>
                    <td>
                      <span v-if="editingLabel !== a.index" class="text-gray-200 cursor-pointer hover:text-indigo-300"
                            @click="startEditLabel(a.index, a.label)">
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
                        {{ refreshing === a.index ? '...' : 'Refresh' }}
                      </button>
                      <button @click="deleteAccount(a.index, a.label || a.email)"
                              class="text-red-400 hover:text-red-300">Delete</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Device login -->
            <div class="mt-4 pt-4 border-t border-gray-700">
              <div v-if="!deviceState" class="flex items-center justify-end gap-3">
                <h3 class="text-xs font-semibold text-gray-400">Add Account (Device Login)</h3>
                <button @click="startDeviceLogin" class="btn btn-primary text-xs" :disabled="deviceLoading">
                  {{ deviceLoading ? 'Requesting code...' : 'Start Device Login' }}
                </button>
              </div>
              <div v-if="false"></div>
              <div v-else-if="deviceState === 'pending'" class="p-3 bg-gray-800 rounded border border-gray-700">
                <div class="text-sm text-gray-300 mb-2">
                  <p class="mb-1">1. Open: <a :href="deviceInfo.verify_url" target="_blank"
                       class="text-indigo-400 hover:text-indigo-300 underline">{{ deviceInfo.verify_url }}</a></p>
                  <p>2. Enter code: <code class="bg-gray-900 px-2 py-1 rounded text-lg font-bold text-white">{{ deviceInfo.user_code }}</code></p>
                </div>
                <div class="flex items-center gap-3">
                  <div class="text-xs text-gray-500">Waiting... <span class="inline-block animate-pulse">●</span></div>
                  <button @click="cancelDeviceLogin" class="btn btn-ghost text-xs">Cancel</button>
                </div>
              </div>
              <div v-else-if="deviceState === 'success'" class="p-3 bg-green-900/30 rounded border border-green-800">
                <p class="text-green-400 text-sm">Authenticated as {{ deviceResult.email }}.</p>
                <button @click="deviceState = null" class="btn btn-ghost text-xs mt-1">Done</button>
              </div>
              <div v-else-if="deviceState === 'error'" class="p-3 bg-red-900/30 rounded border border-red-800">
                <p class="text-red-400 text-sm">{{ deviceError }}</p>
                <button @click="deviceState = null" class="btn btn-ghost text-xs mt-1">Try Again</button>
              </div>
            </div>
          </div>
        </div>
      </div>

        <!-- ==================== Kimi Config ==================== -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">Kimi (Moonshot AI)</h2>
            <div class="flex items-center gap-3">
              <div v-if="kimiStatus.configured" class="text-sm">
                <span v-if="kimiStatus.health && kimiStatus.health.healthy" class="text-green-400">● Connected</span>
                <span v-else class="text-red-400">● Unreachable</span>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="kimiForm.enabled" @change="saveKimiConfig" class="accent-indigo-500" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400">Model</label>
              <select v-model="kimiForm.model" @change="saveKimiConfig"
                      class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200">
                <option v-if="!kimiModels.length" value="" disabled>No models available</option>
                <option v-for="m in kimiModels" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-400">Max Tokens</label>
              <input v-model.number="kimiForm.max_tokens" type="number" @keydown.enter="saveKimiConfig"
                     class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200" />
            </div>
            <div>
              <label class="text-xs text-gray-400">API Key</label>
              <div class="flex items-center gap-2">
                <span v-if="llmStatus && llmStatus.kimi.has_api_key && !kimiForm.api_key" class="text-xs text-green-400">● Configured</span>
                <input v-model="kimiForm.api_key" type="password" @keydown.enter="saveKimiConfig" @input="kimiKeyDirty = true"
                       :placeholder="llmStatus && llmStatus.kimi.has_api_key ? '••••••••  (press Enter to replace)' : 'sk-...'"
                       class="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200" />
              </div>
            </div>
          </div>
          <div v-if="kimiStatus.health && kimiStatus.health.error"
               class="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800 mt-3">
            {{ kimiStatus.health.error }}
          </div>
        </div>

        <!-- ==================== Ollama Config ==================== -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">Ollama (Local/Remote)</h2>
            <div class="flex items-center gap-3">
              <div v-if="ollamaStatus.configured" class="text-sm">
                <span v-if="ollamaStatus.health && ollamaStatus.health.healthy" class="text-green-400">● Connected</span>
                <span v-else class="text-red-400">● Unreachable</span>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="ollamaForm.enabled" @change="saveOllamaConfig" class="accent-indigo-500" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400">Model</label>
              <select v-model="ollamaForm.model" @change="saveOllamaConfig"
                      class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200">
                <option v-if="!ollamaModels.length" value="" disabled>No models available</option>
                <option v-for="m in ollamaModels" :key="m.name" :value="m.name">{{ m.name }} ({{ formatSize(m.size) }})</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-400">Max Tokens</label>
              <input v-model.number="ollamaForm.max_tokens" type="number" @keydown.enter="saveOllamaConfig"
                     class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200" />
            </div>
            <div>
              <label class="text-xs text-gray-400">API Key <span class="text-gray-600">(optional, for remote)</span></label>
              <input v-model="ollamaForm.api_key" type="password" placeholder="Leave empty for local" @keydown.enter="saveOllamaConfig" @input="ollamaKeyDirty = true"
                     class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200" />
            </div>
            <div>
              <label class="text-xs text-gray-400">Base URL</label>
              <input v-model="ollamaForm.base_url" placeholder="http://127.0.0.1:11434" @keydown.enter="saveOllamaConfig"
                     class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200" />
            </div>
          </div>
          <div v-if="ollamaStatus.health && ollamaStatus.health.error"
               class="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800 mt-3">
            {{ ollamaStatus.health.error }}
          </div>
        </div>
      </div>

    </div>
  `,

  setup() {
    const loading = ref(true);

    // --- LLM Provider ---
    const llmStatus = ref(null);
    const selectedProvider = ref('codex');

    // --- Config forms ---
    const codexForm = ref({ enabled: false, model: 'gpt-5.5', max_tokens: 4096, reasoning_effort: 'medium' });
    const ollamaForm = ref({ enabled: false, base_url: '', model: '', api_key: '', max_tokens: 4096 });
    const kimiForm = ref({ enabled: false, api_key: '', model: '', max_tokens: 4096 });
    const ollamaKeyDirty = ref(false);
    const kimiKeyDirty = ref(false);
    const savingCodex = ref(false);
    const savingOllama = ref(false);
    const savingKimi = ref(false);
    const probingOllama = ref(false);
    const switching = ref(false);

    // --- Ollama ---
    const ollamaStatus = ref({ configured: false });
    const ollamaModels = ref([]);
    const ollamaSelectedModel = ref('');
    const reloading = ref(false);
    const settingModel = ref(false);

    // --- Kimi ---
    const kimiStatus = ref({ configured: false });
    const kimiModels = ref([]);
    const kimiSelectedModel = ref('');
    const reloadingKimi = ref(false);
    const settingKimiModel = ref(false);

    // --- Codex ---
    const codexLoading = ref(true);
    const codexError = ref('');
    const codexData = ref({ configured: false, accounts: [] });
    const refreshing = ref(null);
    const editingLabel = ref(null);
    const labelValue = ref('');
    const deviceState = ref(null);
    const deviceLoading = ref(false);
    const deviceInfo = ref(null);
    const deviceResult = ref(null);
    const deviceError = ref('');
    let pollController = null;

    function showToast(message, type = 'success') {
      toast(message, type === 'error' ? 'error' : 'success');
    }

    function formatSize(bytes) {
      if (!bytes) return '?';
      const gb = bytes / (1024 * 1024 * 1024);
      if (gb >= 1) return gb.toFixed(1) + ' GB';
      return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
    }

    // --- Fetch all ---
    async function fetchAll() {
      loading.value = true;
      await Promise.all([fetchLLMStatus(), fetchOllamaStatus(), fetchKimiStatus(), fetchCodexStatus()]);
      loading.value = false;
    }

    async function fetchLLMStatus() {
      try {
        const data = await api.get('/api/llm/status');
        llmStatus.value = data;
        selectedProvider.value = data.active_provider || 'codex';
        if (data.codex) {
          codexForm.value.enabled = data.codex.enabled;
          codexForm.value.model = data.codex.model || 'gpt-5.5';
          codexForm.value.reasoning_effort = data.codex.reasoning_effort || 'medium';
          codexForm.value.max_tokens = data.codex.max_tokens || 4096;
        }
        if (data.ollama) {
          ollamaForm.value.enabled = data.ollama.enabled;
          ollamaForm.value.base_url = data.ollama.base_url || '';
          ollamaForm.value.model = data.ollama.model || '';
          ollamaForm.value.max_tokens = data.ollama.max_tokens || 4096;
          // Don't overwrite api_key from server (it's masked)
        }
        if (data.kimi) {
          kimiForm.value.enabled = data.kimi.enabled;
          kimiForm.value.model = data.kimi.model || '';
          kimiForm.value.max_tokens = data.kimi.max_tokens || 4096;
        }
      } catch (e) {
        llmStatus.value = { active_provider: 'codex', codex: { configured: false }, ollama: { configured: false }, kimi: { configured: false } };
      }
    }

    async function fetchOllamaStatus() {
      try {
        ollamaStatus.value = await api.get('/api/ollama/status');
        if (ollamaStatus.value.model) ollamaSelectedModel.value = ollamaStatus.value.model;
        if (ollamaStatus.value.configured) {
          try {
            const m = await api.get('/api/ollama/models');
            ollamaModels.value = m.models || [];
          } catch { ollamaModels.value = []; }
        } else if (ollamaForm.value.base_url) {
          try {
            const m = await api.post('/api/ollama/probe-models', { base_url: ollamaForm.value.base_url });
            ollamaModels.value = m.models || [];
          } catch { ollamaModels.value = []; }
        }
      } catch {
        ollamaStatus.value = { configured: false };
      }
    }

    async function fetchCodexStatus() {
      codexLoading.value = true;
      codexError.value = '';
      try {
        codexData.value = await api.get('/api/codex/status');
      } catch (e) {
        codexError.value = e.message || 'Failed to fetch Codex status';
      } finally {
        codexLoading.value = false;
      }
    }

    // --- Provider switch ---
    async function switchProvider() {
      const prev = llmStatus.value ? llmStatus.value.active_provider : 'codex';
      switching.value = true;
      try {
        const result = await api.post('/api/llm/switch', { provider: selectedProvider.value });
        if (result.error) {
          selectedProvider.value = prev;
          showToast(result.error, 'error');
        } else {
          showToast('Switched to ' + selectedProvider.value + ' (' + result.model + ')');
          await fetchAll();
        }
      } catch (e) {
        selectedProvider.value = prev;
        showToast(e.message || 'Switch failed', 'error');
      } finally { switching.value = false; }
    }

    // --- Ollama ---
    async function reloadOllama() {
      reloading.value = true;
      try {
        const r = await api.post('/api/ollama/reload');
        showToast(r.configured ? 'Ollama reloaded' : (r.reason || 'Ollama not configured'), r.configured ? 'success' : 'error');
        await fetchAll();
      } catch (e) { showToast(e.message || 'Reload failed', 'error'); }
      finally { reloading.value = false; }
    }

    async function setOllamaModel() {
      settingModel.value = true;
      try {
        await api.post('/api/ollama/model', { model: ollamaSelectedModel.value });
        showToast('Model set to ' + ollamaSelectedModel.value);
        await fetchAll();
      } catch (e) { showToast(e.message || 'Failed', 'error'); }
      finally { settingModel.value = false; }
    }

    // --- Kimi ---
    async function probeOllamaModels() {
      const url = ollamaForm.value.base_url;
      if (!url) { showToast('Enter a base URL first', 'error'); return; }
      probingOllama.value = true;
      try {
        const r = await api.post('/api/ollama/probe-models', { base_url: url });
        ollamaModels.value = r.models || [];
        if (ollamaModels.value.length) {
          showToast(ollamaModels.value.length + ' model(s) found');
          if (!ollamaForm.value.model && ollamaModels.value.length) {
            ollamaForm.value.model = ollamaModels.value[0].name;
          }
        } else {
          showToast('No models found at ' + url, 'error');
        }
      } catch (e) { showToast(e.message || 'Could not reach Ollama', 'error'); }
      finally { probingOllama.value = false; }
    }

    async function fetchKimiStatus() {
      try {
        kimiStatus.value = await api.get('/api/kimi/status');
        if (kimiStatus.value.model) kimiSelectedModel.value = kimiStatus.value.model;
        if (kimiStatus.value.configured) {
          try {
            const m = await api.get('/api/kimi/models');
            kimiModels.value = m.models || [];
          } catch { kimiModels.value = []; }
        }
      } catch {
        kimiStatus.value = { configured: false };
      }
    }

    async function reloadKimi() {
      reloadingKimi.value = true;
      try {
        const r = await api.post('/api/kimi/reload');
        showToast(r.configured ? 'Kimi reloaded' : (r.reason || 'Kimi not configured'), r.configured ? 'success' : 'error');
        await fetchAll();
      } catch (e) { showToast(e.message || 'Reload failed', 'error'); }
      finally { reloadingKimi.value = false; }
    }

    async function setKimiModel() {
      settingKimiModel.value = true;
      try {
        await api.post('/api/kimi/model', { model: kimiSelectedModel.value });
        showToast('Model set to ' + kimiSelectedModel.value);
        await fetchAll();
      } catch (e) { showToast(e.message || 'Failed', 'error'); }
      finally { settingKimiModel.value = false; }
    }

    // --- Provider config saves ---
    async function saveCodexConfig() {
      savingCodex.value = true;
      try {
        await api.put('/api/llm/codex/config', codexForm.value);
        showToast('Codex config saved');
        await fetchAll();
      } catch (e) { showToast(e.message || 'Failed', 'error'); await fetchAll(); }
      finally { savingCodex.value = false; }
    }

    async function saveOllamaConfig() {
      savingOllama.value = true;
      try {
        const payload = { ...ollamaForm.value };
        if (!ollamaKeyDirty.value) delete payload.api_key;
        await api.put('/api/llm/ollama/config', payload);
        showToast('Ollama config saved');
        ollamaForm.value.api_key = '';
        ollamaKeyDirty.value = false;
        await fetchAll();
      } catch (e) { showToast(e.message || 'Failed', 'error'); }
      finally { savingOllama.value = false; }
    }

    async function saveKimiConfig() {
      savingKimi.value = true;
      try {
        const payload = { ...kimiForm.value };
        if (!kimiKeyDirty.value) delete payload.api_key;
        await api.put('/api/llm/kimi/config', payload);
        showToast('Kimi config saved');
        kimiForm.value.api_key = '';
        kimiKeyDirty.value = false;
        await fetchAll();
      } catch (e) { showToast(e.message || 'Failed', 'error'); }
      finally { savingKimi.value = false; }
    }

    // --- Codex account management ---
    async function activateAccount(index) {
      try {
        await api.post('/api/codex/account/' + index + '/activate');
        showToast('Active account switched');
        await fetchCodexStatus();
      } catch (e) { showToast(e.message || 'Failed', 'error'); }
    }

    async function refreshAccount(index) {
      refreshing.value = index;
      try {
        await api.post('/api/codex/account/' + index + '/refresh');
        showToast('Token refreshed');
        await fetchCodexStatus();
      } catch (e) { showToast(e.message || 'Refresh failed', 'error'); }
      finally { refreshing.value = null; }
    }

    function startEditLabel(index, current) {
      editingLabel.value = index;
      labelValue.value = current || '';
    }

    async function saveLabel(index) {
      try {
        await api.put('/api/codex/account/' + index + '/label', { label: labelValue.value });
        showToast('Label updated');
        editingLabel.value = null;
        await fetchCodexStatus();
      } catch (e) { showToast(e.message || 'Failed', 'error'); }
    }

    async function deleteAccount(index, name) {
      const ok = await confirmDialog({
        title: 'Delete Codex account',
        message: `Delete ${name || 'account #' + (index + 1)}? The pool will reload without it.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.del('/api/codex/account/' + index);
        showToast('Deleted. Pool reloaded.');
        await fetchCodexStatus();
      } catch (e) { showToast(e.message || 'Failed', 'error'); }
    }

    async function startDeviceLogin() {
      deviceLoading.value = true;
      try {
        const info = await api.post('/api/codex/device-code');
        deviceInfo.value = info;
        deviceState.value = 'pending';
        pollForAuth(info);
      } catch (e) { showToast(e.message || 'Failed', 'error'); }
      finally { deviceLoading.value = false; }
    }

    async function pollForAuth(info) {
      pollController = { cancelled: false };
      const ctrl = pollController;
      try {
        const result = await api.post('/api/codex/device-poll', {
          device_auth_id: info.device_auth_id,
          user_code: info.user_code,
          interval: info.interval,
        });
        if (ctrl.cancelled) return;
        deviceResult.value = result;
        deviceState.value = 'success';
        await fetchAll();
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
    }

    onMounted(fetchAll);
    onUnmounted(() => { if (pollController) pollController.cancelled = true; });

    return {
      loading, llmStatus, selectedProvider, switching,
      codexForm, ollamaForm, kimiForm, savingCodex, savingOllama, savingKimi, probingOllama, ollamaKeyDirty, kimiKeyDirty,
      ollamaStatus, ollamaModels, ollamaSelectedModel, reloading, settingModel,
      kimiStatus, kimiModels, kimiSelectedModel, reloadingKimi, settingKimiModel,
      codexLoading, codexError, codexData, refreshing, editingLabel, labelValue,
      deviceState, deviceLoading, deviceInfo, deviceResult, deviceError,
      fetchAll, switchProvider, reloadOllama, setOllamaModel,
      reloadKimi, setKimiModel, probeOllamaModels,
      saveCodexConfig, saveOllamaConfig, saveKimiConfig,
      activateAccount, refreshAccount, startEditLabel, saveLabel, deleteAccount,
      startDeviceLogin, cancelDeviceLogin, formatSize,
    };
  },
};
