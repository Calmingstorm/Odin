import { api } from '../api.js';
import { toast } from '../toast.js';
import { confirmDialog } from '../confirm.js';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  codexAdvancedPayload, codexBasicPayload,
  kimiAdvancedPayload, kimiBasicPayload,
  ollamaAdvancedPayload, ollamaBasicPayload,
} from '../llm-config-payloads.js';


// Trailing debounce: selects fire @change on EVERY arrow keypress, and each
// save costs a PUT + status refetches — rapid keyboard scrubbing could burn
// the API rate-limit window (120 req/min) and 429 the status panels.
function debounce(fn, ms = 500) {
  let t = null;
  const wrapper = (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
  wrapper.pending = () => t !== null;
  wrapper.cancel = () => { if (t) { clearTimeout(t); t = null; } };
  return wrapper;
}

export default {
  template: `
    <div class="p-6 page-fade-in">
      <div class="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 class="text-xl font-semibold">LLM Configuration</h1>
          <p class="page-lede">Provider routing, model selection, credentials, and Codex accounts.</p>
        </div>
        <button @click="fetchAll" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>

      <div v-if="loading && !llmStatus" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>

      <div v-else class="space-y-6">

        <!-- ==================== Active Provider ==================== -->
        <div class="hm-card">
          <h2 class="text-sm font-semibold text-gray-300 mb-3">Active Provider</h2>
          <div v-if="llmStatus" class="provider-choice-list">
            <div class="provider-choice">
              <label class="provider-choice-label">
                <input type="radio" value="codex" v-model="selectedProvider" @change="switchProvider"
                       :disabled="!llmStatus.codex.configured"
                       class="provider-control" />
                <span class="text-sm" :class="llmStatus.codex.configured ? 'text-gray-200' : 'text-gray-500'">
                  Codex (OpenAI)
                </span>
                <span v-if="llmStatusLoadFailed" class="text-xs text-amber-500">— status unavailable</span>
                <span v-else-if="!llmStatus.codex.configured" class="text-xs text-yellow-500">— not configured</span>
                <span v-else-if="llmStatus.codex.configured" class="text-xs text-gray-500">
                  {{ llmStatus.codex.model }}
                </span>
                <span v-if="llmStatus.active_provider === 'codex'" class="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">active</span>
              </label>
            </div>
            <div class="provider-choice">
              <label class="provider-choice-label">
                <input type="radio" value="ollama" v-model="selectedProvider" @change="switchProvider"
                       :disabled="!llmStatus.ollama.configured"
                       class="provider-control" />
                <span class="text-sm" :class="llmStatus.ollama.configured ? 'text-gray-200' : 'text-gray-500'">
                  Ollama (Local/Remote)
                </span>
                <span v-if="llmStatusLoadFailed" class="text-xs text-amber-500">— status unavailable</span>
                <span v-else-if="!llmStatus.ollama.configured" class="text-xs text-yellow-500">— not configured</span>
                <span v-else-if="llmStatus.ollama.configured" class="text-xs text-gray-500">
                  {{ llmStatus.ollama.model }}
                </span>
                <span v-if="llmStatus.active_provider === 'ollama'" class="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">active</span>
              </label>
            </div>
            <div class="provider-choice">
              <label class="provider-choice-label">
                <input type="radio" value="kimi" v-model="selectedProvider" @change="switchProvider"
                       :disabled="!llmStatus.kimi.configured"
                       class="provider-control" />
                <span class="text-sm" :class="llmStatus.kimi.configured ? 'text-gray-200' : 'text-gray-500'">
                  Kimi (Moonshot AI)
                </span>
                <span v-if="llmStatusLoadFailed" class="text-xs text-amber-500">— status unavailable</span>
                <span v-else-if="!llmStatus.kimi.configured" class="text-xs text-yellow-500">— not configured</span>
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
                <span class="provider-status text-green-400"><span class="status-dot online" aria-hidden="true"></span>Connected</span>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="codexForm.enabled" @change="saveCodexConfigDebounced" class="provider-control" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-xs text-gray-400 block">Model
              <select v-model="codexForm.model" @change="saveCodexConfigDebounced"
                      class="hm-input">
                <option v-for="m in codexModelOptions" :key="m" :value="m"
                        :disabled="mainModelOptionDisabled(m)">{{ m }}</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Agent Model
              <select v-model="codexForm.agent_model" @change="saveCodexConfigDebounced"
                      class="hm-input">
                <option value="">Inherit chat model</option>
                <option value="auto">Auto — choose per spawn</option>
                <option v-for="m in codexAgentModelOptions" :key="m" :value="m"
                        :disabled="agentModelOptionDisabled(m)">{{ m }}</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Reasoning
              <select v-model="codexForm.reasoning_effort" @change="saveCodexConfigDebounced"
                      class="hm-input">
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="xhigh">Extra High</option>
                <option v-if="mainMaxAllowed" value="max">Max</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Agent Reasoning
              <select v-model="codexForm.agent_reasoning_effort" @change="saveCodexConfigDebounced"
                      class="hm-input">
                <option value="">Inherit chat setting</option>
                <option value="auto">Auto — choose per spawn</option>
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="xhigh">Extra High</option>
                <option v-if="agentMaxAllowed" value="max">Max</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Auxiliary Model
              <select :value="auxForm.enabled ? auxForm.model : ''" @change="onAuxModelChange"
                      class="hm-input">
                <option value="">Off — use primary model</option>
                <option v-for="m in auxModelOptions" :key="m" :value="m">{{ m }}</option>
              </select>
              </label>
            </div>
            <div class="llm-context-summary">
              <span>Effective context</span>
              <div class="llm-context-summary-value">
                <span class="llm-context-summary-pair">
                  <strong>{{ formatCount(activeContextBudget?.effective?.effective_budget) }} <small>tokens</small></strong>
                  <span class="llm-budget-provenance" :class="provenanceClass(activeContextBudget?.provenance)">{{ activeContextBudget?.provenance || 'unavailable' }}</span>
                  <span v-if="activeContextBudget?.density_source === 'calibrated'" class="llm-budget-density">density-calibrated · {{ formatDensity(activeContextBudget.density_milli) }} chars/token</span>
                </span>
                <small v-if="activeContextBudget?.clamp_expires_at">Expires {{ formatExpiry(activeContextBudget.clamp_expires_at) }}</small>
              </div>
            </div>
          </div>
          <p class="text-xs text-gray-500 mt-3">
            The Auxiliary Model runs the background jobs (compaction, reflection, consolidation,
            background follow-up) on a cheaper Codex model, with automatic fallback to the primary
            on error. It shares the main Codex login; only the model differs.
            "Off" runs those jobs on the primary model.
          </p>
          <div v-if="auxData.unavailable_reason"
               class="text-sm text-yellow-400 bg-yellow-900/20 rounded p-2 border border-yellow-800 mt-3">
            {{ auxData.unavailable_reason }}
          </div>
          <details class="llm-advanced" :open="advancedOpen.codex" @toggle="advancedOpen.codex = $event.target.open">
            <summary>
              <span>Advanced Settings</span>
              <small>Transport, retries, and model-aware context policy</small>
            </summary>
            <div class="llm-advanced-body">
              <section class="llm-advanced-group">
                <header><strong>Transport</strong><span>Request lifecycle limits</span></header>
                <label><span class="llm-field-label">Request timeout <small>seconds</small></span>
                  <input v-model.number="codexForm.request_timeout_seconds" type="number" min="60" max="86400" class="hm-input" />
                </label>
                <label><span class="llm-field-label">Stream stall timeout <small>seconds</small></span>
                  <input v-model.number="codexForm.stream_stall_timeout_seconds" type="number" min="10" max="3600" class="hm-input" />
                </label>
              </section>
              <section class="llm-advanced-group">
                <header><strong>Retry policy</strong><span>Transient request failures</span></header>
                <label><span class="llm-field-label">Maximum retries</span>
                  <input v-model.number="codexForm.retry.max_retries" type="number" min="0" class="hm-input" />
                </label>
                <label><span class="llm-field-label">Base delay <small>seconds</small></span>
                  <input v-model.number="codexForm.retry.base_delay" type="number" min="0" step="any" class="hm-input" />
                </label>
                <label><span class="llm-field-label">Maximum delay <small>seconds</small></span>
                  <input v-model.number="codexForm.retry.max_delay" type="number" min="0" step="any" class="hm-input" />
                </label>
              </section>
              <section class="llm-advanced-group">
                <header><strong>Connection pool</strong><span>Shared Codex HTTP transport</span></header>
                <p v-if="llmStatus?.codex?.connection_pool_pending_restart === true" class="llm-advanced-state pending" role="status">
                  Saved values need a restart. This process still uses {{ llmStatus.codex.effective_connection_pool?.max_connections }} connections with {{ llmStatus.codex.effective_connection_pool?.keepalive_timeout }}s keepalive.
                </p>
                <p v-else-if="llmStatus?.codex?.connection_pool_pending_restart === false" class="llm-advanced-state">
                  Saved values match this process. Future changes take effect after restart.
                </p>
                <p v-else class="llm-advanced-state">Future changes take effect after restart; current process values are unavailable.</p>
                <label><span class="llm-field-label">Maximum connections</span>
                  <input v-model.number="codexForm.connection_pool.max_connections" type="number" min="1" class="hm-input" />
                </label>
                <label><span class="llm-field-label">Keepalive timeout <small>seconds</small></span>
                  <input v-model.number="codexForm.connection_pool.keepalive_timeout" type="number" min="0" class="hm-input" />
                </label>
              </section>
              <section class="llm-advanced-group">
                <header><strong>Context compression</strong><span>Long-conversation compaction</span></header>
                <p v-if="llmStatus?.codex?.context_compression_pending_restart === true" class="llm-advanced-state pending" role="status">
                  Saved values need a restart. This process still uses compression {{ llmStatus.codex.effective_context_compression?.enabled ? 'on' : 'off' }}, {{ formatContextCeiling(llmStatus.codex.effective_context_compression?.max_context_chars) }}, and {{ llmStatus.codex.effective_context_compression?.keep_recent_iterations }} recent iterations.
                </p>
                <p v-else-if="llmStatus?.codex?.context_compression_pending_restart === false" class="llm-advanced-state">
                  Saved values match this process. Future changes take effect after restart.
                </p>
                <p v-else class="llm-advanced-state">Future changes take effect after restart; current process values are unavailable.</p>
                <label class="llm-advanced-toggle"><span class="llm-field-label">Enabled</span>
                  <span class="llm-toggle-control"><span class="toggle-switch"><input v-model="codexForm.context_compression.enabled" type="checkbox" /><span class="toggle-slider"></span></span></span>
                </label>
                <label><span class="llm-field-label">Maximum context characters</span>
                  <input v-model.number="codexForm.context_compression.max_context_chars" type="number" min="1" class="hm-input" />
                </label>
                <label><span class="llm-field-label">Recent iterations to keep</span>
                  <input v-model.number="codexForm.context_compression.keep_recent_iterations" type="number" min="1" class="hm-input" />
                </label>
              </section>
              <section class="llm-context-budget-panel">
                <div class="llm-context-budget-heading">
                  <div>
                    <strong>Context budgets</strong>
                    <span>Capability, working-set policy, and temporary evidence</span>
                  </div>
                  <label class="llm-utilization-field">
                    <span>Context utilization</span>
                    <span class="llm-utilization-input"><input :value="codexForm.context_utilization" @input="setContextUtilization($event)" type="number" min="30" max="100" class="hm-input" /><small>%</small></span>
                  </label>
                </div>
                <p class="llm-context-budget-copy">
                  Overrides describe usable input capability. Utilization is the working-set policy applied to larger models; budgets at or below 272,000 tokens keep legacy behavior. Learned clamps are temporary evidence from successful overflow recovery, not operator policy.
                </p>
                <div v-if="contextWindowsLoading && !contextWindows" class="llm-context-budget-loading" role="status">
                  <span class="spinner" aria-hidden="true"></span><span>Loading context budgets…</span>
                </div>
                <div v-else-if="contextWindowsError" class="llm-context-budget-error" role="alert">
                  <span>{{ contextWindowsError }}</span>
                  <button type="button" class="btn btn-ghost text-xs" @click="fetchContextWindows">Retry</button>
                </div>
                <template v-else>
                  <div class="llm-context-budget-table-wrap">
                    <table class="hm-table llm-context-budget-table">
                      <thead>
                        <tr>
                          <th>Canonical model</th>
                          <th>Built-in floor</th>
                          <th>Configured override</th>
                          <th>Effective budget</th>
                          <th>Configured target</th>
                          <th>Runtime target</th>
                          <th>Provenance</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in contextBudgetRows" :key="row.model" :class="{ 'has-clamp': row.provenance === 'temporary learned clamp' }">
                          <td data-label="Canonical model"><code>{{ row.model }}</code></td>
                          <td data-label="Built-in floor"><span class="llm-budget-value">{{ formatCount(row.floor) }}</span><small>tokens</small></td>
                          <td data-label="Configured override">
                            <div class="llm-budget-override">
                              <input :value="codexForm.context_budget_overrides[row.model] ?? ''" @input="setContextOverride(row.model, $event)"
                                     type="number" min="50192" max="2000000" step="1"
                                     :placeholder="'No override'" class="hm-input"
                                     :aria-label="'Configured context budget override for ' + row.model" />
                              <button v-if="row.override != null || codexForm.context_budget_overrides[row.model] != null" type="button"
                                      class="llm-budget-reset" @click="resetContextOverride(row.model)" :aria-label="'Reset ' + row.model + ' to its built-in budget'">Reset</button>
                            </div>
                            <small v-if="overrideAboveFloor(row)" class="llm-budget-warning">Above the known-safe floor</small>
                          </td>
                          <td data-label="Effective budget"><span class="llm-budget-value llm-budget-effective">{{ formatCount(row.effectiveBudget) }}</span><small>tokens</small></td>
                          <td data-label="Configured target"><span class="llm-budget-value">{{ formatCount(row.configuredPrimaryChars) }}</span><small>characters · saved policy</small></td>
                          <td data-label="Runtime target">
                            <span class="llm-budget-value llm-budget-effective">{{ formatCount(row.primaryChars) }}</span><small>characters · active process</small>
                            <span v-if="contextWindows.max_context_chars_pending_restart === true && row.configuredPrimaryChars !== row.primaryChars" class="llm-budget-pending">Restart pending</span>
                          </td>
                          <td data-label="Provenance">
                            <span class="llm-budget-provenance" :class="provenanceClass(row.provenance)">{{ row.provenance }}</span>
                            <span v-if="row.densitySource === 'calibrated'" class="llm-budget-density">density-calibrated · {{ formatDensity(row.densityMilli) }} chars/token</span>
                            <small v-if="row.clampExpiresAt">Expires {{ formatExpiry(row.clampExpiresAt) }}</small>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div v-if="activeClampRows.length" class="llm-clamp-list">
                    <div class="llm-clamp-list-heading">
                      <div><strong>Temporary learned clamps</strong><span>Account-scoped recovery evidence. Clearing never changes the configured override.</span></div>
                      <span class="badge badge-warning">{{ activeClampRows.length }} active</span>
                    </div>
                    <div class="llm-clamp-grid">
                      <article v-for="clamp in activeClampRows" :key="clamp.account_key + ':' + clamp.model" class="llm-clamp-card">
                        <div><code>{{ clamp.model }}</code><span>{{ formatCount(clamp.value) }} tokens</span></div>
                        <p>Account {{ shortAccountKey(clamp.account_key) }} · expires {{ formatExpiry(clamp.expires_at) }}</p>
                        <button type="button" class="btn btn-ghost text-xs" @click="clearContextClamp(clamp)"
                                :disabled="clearingClamp === clamp.account_key + ':' + clamp.model">
                          {{ clearingClamp === clamp.account_key + ':' + clamp.model ? 'Clearing…' : 'Clear clamp' }}
                        </button>
                      </article>
                    </div>
                  </div>
                </template>
              </section>
              <div class="llm-advanced-footer">
                <p>Transport and retry changes apply to the primary client now. Context budgets and utilization apply to the next logical generation. An existing auxiliary client keeps the transport and retry settings captured when it was built until it is rebuilt. Connection-pool and context-compression changes are saved for the next restart.</p>
                <button type="button" class="btn btn-primary text-xs" @click="saveCodexAdvancedConfigNow" :disabled="savingCodex">{{ savingCodex ? 'Saving…' : 'Save advanced settings' }}</button>
              </div>
            </div>
          </details>
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
              <div class="table-responsive">
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
                      <button v-if="editingLabel !== a.index" type="button" class="text-gray-200 cursor-pointer hover:text-indigo-300 inline-flex items-center"
                            @click="startEditLabel(a.index, a.label)" :aria-label="'Edit label for account ' + (a.index + 1)">
                        {{ a.label || '—' }}
                        <span class="text-gray-600 ml-1" aria-hidden="true"><odin-icon name="edit" :size="12" /></span>
                      </button>
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
                  <div class="provider-status text-xs text-gray-500"><span class="status-dot starting animate-pulse" aria-hidden="true"></span>Waiting...</div>
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
              <div v-if="kimiStatusLoadFailed" class="text-sm"><span class="provider-status text-amber-500">Status unavailable</span></div>
              <div v-else-if="kimiStatus.configured" class="text-sm">
                <span v-if="kimiStatus.health && kimiStatus.health.healthy" class="provider-status text-green-400"><span class="status-dot online" aria-hidden="true"></span>Connected</span>
                <span v-else class="provider-status text-red-400"><span class="status-dot offline" aria-hidden="true"></span>Unreachable</span>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="kimiForm.enabled" @change="saveKimiConfigDebounced" class="provider-control" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400 block">Model
              <select v-model="kimiForm.model" @change="saveKimiConfigDebounced"
                      class="hm-input">
                <option v-if="!kimiModels.length" value="" disabled>No models available</option>
                <option v-for="m in kimiModels" :key="m" :value="m">{{ m }}</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Max Tokens
              <input v-model.number="kimiForm.max_tokens" type="number" @keydown.enter="saveKimiConfigNow"
                     class="hm-input" />
              </label>
            </div>
            <div>
              <span class="text-xs text-gray-400">API Key</span>
              <div class="flex items-center gap-2">
                <span v-if="llmStatus && llmStatus.kimi.has_api_key && !kimiForm.api_key" class="provider-status text-xs text-green-400"><span class="status-dot online" aria-hidden="true"></span>Configured</span>
                <input v-model="kimiForm.api_key" type="password" aria-label="Kimi API key" @keydown.enter="saveKimiConfigNow" @input="kimiKeyDirty = true"
                       :placeholder="llmStatus && llmStatus.kimi.has_api_key ? '••••••••  (press Enter to replace)' : 'sk-...'"
                       class="hm-input flex-1" />
              </div>
            </div>
          </div>
          <details class="llm-advanced compact" :open="advancedOpen.kimi" @toggle="advancedOpen.kimi = $event.target.open">
            <summary><span>Advanced Settings</span><small>Provider request timeout</small></summary>
            <div class="llm-advanced-body">
              <section class="llm-advanced-group single">
                <label><span class="llm-field-label">Request timeout <small>seconds</small></span>
                  <input v-model.number="kimiForm.timeout" type="number" min="10" max="3600" class="hm-input" />
                </label>
              </section>
              <div class="llm-advanced-footer"><button type="button" class="btn btn-primary text-xs" @click="saveKimiAdvancedConfigNow" :disabled="savingKimi">Save timeout</button></div>
            </div>
          </details>
          <div v-if="kimiStatus?.health && kimiStatus.health.error"
               class="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800 mt-3">
            {{ kimiStatus.health.error }}
          </div>
        </div>

        <!-- ==================== Ollama Config ==================== -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">Ollama (Local/Remote)</h2>
            <div class="flex items-center gap-3">
              <div v-if="ollamaStatusLoadFailed" class="text-sm"><span class="provider-status text-amber-500">Status unavailable</span></div>
              <div v-else-if="ollamaStatus.configured" class="text-sm">
                <span v-if="ollamaStatus.health && ollamaStatus.health.healthy" class="provider-status text-green-400"><span class="status-dot online" aria-hidden="true"></span>Connected</span>
                <span v-else class="provider-status text-red-400"><span class="status-dot offline" aria-hidden="true"></span>Unreachable</span>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="ollamaForm.enabled" @change="saveOllamaConfigDebounced" class="provider-control" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400 block">Model
              <select v-model="ollamaForm.model" @change="saveOllamaConfigDebounced"
                      class="hm-input">
                <option v-if="!ollamaModels.length" value="" disabled>No models available</option>
                <option v-for="m in ollamaModels" :key="m.name" :value="m.name">{{ m.name }} ({{ formatSize(m.size) }})</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Max Tokens
              <input v-model.number="ollamaForm.max_tokens" type="number" @keydown.enter="saveOllamaConfigNow"
                     class="hm-input" />
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">API Key <span class="text-gray-600">(optional, for remote)</span>
              <input v-model="ollamaForm.api_key" type="password" placeholder="Leave empty for local" @keydown.enter="saveOllamaConfigNow" @input="ollamaKeyDirty = true"
                     class="hm-input" />
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Base URL
              <input v-model="ollamaForm.base_url" placeholder="http://127.0.0.1:11434" @keydown.enter="saveOllamaConfigNow"
                     class="hm-input" />
              </label>
            </div>
          </div>
          <details class="llm-advanced compact" :open="advancedOpen.ollama" @toggle="advancedOpen.ollama = $event.target.open">
            <summary><span>Advanced Settings</span><small>Provider request timeout</small></summary>
            <div class="llm-advanced-body">
              <section class="llm-advanced-group single">
                <label><span class="llm-field-label">Request timeout <small>seconds</small></span>
                  <input v-model.number="ollamaForm.timeout" type="number" min="10" max="3600" class="hm-input" />
                </label>
              </section>
              <div class="llm-advanced-footer"><button type="button" class="btn btn-primary text-xs" @click="saveOllamaAdvancedConfigNow" :disabled="savingOllama">Save timeout</button></div>
            </div>
          </details>
          <div v-if="ollamaStatus?.health && ollamaStatus.health.error"
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
    const llmStatusLoadFailed = ref(false);
    const selectedProvider = ref('codex');

    // --- Config forms ---
    // agent_reasoning_effort / agent_model: '' = inherit the chat setting
    // (the server normalizes ''/null to inherit; distinct from the literal
    // effort "none")
    const codexForm = ref({
      enabled: false, model: 'gpt-5.6-sol', reasoning_effort: 'xhigh', agent_reasoning_effort: 'auto', agent_model: 'auto',
      request_timeout_seconds: 3600, stream_stall_timeout_seconds: 180,
      retry: { max_retries: 3, base_delay: 1, max_delay: 30 },
      connection_pool: { max_connections: 10, keepalive_timeout: 30 },
      context_compression: { enabled: true, max_context_chars: null, keep_recent_iterations: 30 },
      context_budget_overrides: {}, context_utilization: 60,
    });

    // Codex model catalog — ONE ordered list renders the Model, Agent Model,
    // and Auxiliary Model selects so the dropdowns can never drift apart.
    // The 5.6 family first, then gpt-5.5 beneath it. The defunct gpt-4.1/
    // gpt-4o/gpt-4o-mini/gpt-5/gpt-5-mini entries were removed.
    const CODEX_MODELS = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5'];
    // model/agent_model are free strings server-side: an unknown configured
    // value (hand-edited or future model) must render as a temporary option —
    // a blank select would let the next save silently replace it.
    const codexModelOptions = computed(() => {
      const v = codexForm.value.model;
      return v && !CODEX_MODELS.includes(v) ? [v, ...CODEX_MODELS] : CODEX_MODELS;
    });
    const codexAgentModelOptions = computed(() => {
      const v = codexForm.value.agent_model;
      // '' (inherit) and 'auto' are already fixed template options — do not
      // inject them as a temporary/unknown option, which would duplicate them.
      return v && v !== 'auto' && !CODEX_MODELS.includes(v) ? [v, ...CODEX_MODELS] : CODEX_MODELS;
    });
    // "max" is gpt-5.6-family only (mirrors config.schema
    // CODEX_MODEL_UNSUPPORTED_EFFORTS; the server 400s the pair). Both
    // directions are guarded here because the full-form debounced save would
    // otherwise carry a hidden-but-still-selected invalid value: the Max
    // option hides when its governing model can't serve it, AND an excluded
    // model can't be selected while "max" is (or would become) that axis's
    // effective effort. Agent Model "auto" always offers Max — the per-spawn
    // pair is validated at execution.
    const MAX_EXCLUDED_MODELS = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'];
    const mainMaxAllowed = computed(() =>
      !MAX_EXCLUDED_MODELS.includes(codexForm.value.model)
      // A fixed excluded agent model inheriting the chat effort would turn
      // "max" here into an invalid agent pair — hide Max then too.
      && !(MAX_EXCLUDED_MODELS.includes(codexForm.value.agent_model)
           && codexForm.value.agent_reasoning_effort === ''));
    const agentMaxAllowed = computed(() => {
      const am = codexForm.value.agent_model;
      if (am === 'auto') return true;
      return !MAX_EXCLUDED_MODELS.includes(am || codexForm.value.model);
    });
    const agentEffortEffectiveMax = computed(() => {
      const ae = codexForm.value.agent_reasoning_effort;
      if (ae === 'auto') return false;
      return (ae || codexForm.value.reasoning_effort) === 'max';
    });
    const mainModelOptionDisabled = (m) =>
      MAX_EXCLUDED_MODELS.includes(m)
      && (codexForm.value.reasoning_effort === 'max'
          // Inherit-chain: agents inheriting this model while their effective
          // effort is max would become an invalid pair.
          || (codexForm.value.agent_model === '' && agentEffortEffectiveMax.value));
    const agentModelOptionDisabled = (m) =>
      MAX_EXCLUDED_MODELS.includes(m) && agentEffortEffectiveMax.value;
    // --- Auxiliary (cheap-model) ---
    const auxForm = ref({ enabled: false, model: 'gpt-5.6-luna' });
    const auxData = ref({ unavailable_reason: null });
    // Same free-string contract as the main model dropdown: an unknown
    // configured value renders as a temporary first option so the debounced
    // save can't silently replace it.
    const auxModelOptions = computed(() => {
      const v = auxForm.value.model;
      return v && !CODEX_MODELS.includes(v) ? [v, ...CODEX_MODELS] : CODEX_MODELS;
    });
    // The single dropdown carries the enabled state: "Off" (empty value)
    // disables the aux model (background jobs fall to the primary); picking a
    // model enables it. We keep the last model so re-enabling restores it.
    function onAuxModelChange(e) {
      const v = e.target.value;
      auxForm.value.enabled = v !== '';
      if (v !== '') auxForm.value.model = v;
      saveAuxConfigDebounced();
    }
    const savingAux = ref(false);
    const advancedOpen = ref({ codex: false, ollama: false, kimi: false });
    const contextWindows = ref(null);
    const contextWindowsLoading = ref(false);
    const contextWindowsError = ref('');
    const clearingClamp = ref(null);
    const contextPolicyDirty = ref(false);
    let contextWindowsRequestSeq = 0;
    const contextBudgetRows = computed(() => Object.entries(contextWindows.value?.models || {}).map(([model, details]) => ({
      model,
      floor: details.floor,
      override: details.override,
      effectiveBudget: details.effective?.effective_budget,
      configuredPrimaryChars: details.configured?.primary_chars,
      primaryChars: details.effective?.primary_chars,
      provenance: details.provenance,
      clampExpiresAt: details.clamp_expires_at,
      densityMilli: details.density_milli,
      densitySource: details.density_source,
    })));
    const activeClampRows = computed(() => contextWindows.value?.clamps || []);
    const activeContextBudget = computed(() => contextWindows.value?.models?.[codexForm.value.model] || null);
    const ollamaForm = ref({ enabled: false, base_url: '', model: '', api_key: '', max_tokens: 4096, timeout: 300 });
    const kimiForm = ref({ enabled: false, api_key: '', model: '', max_tokens: 4096 , timeout: 300 });
    const ollamaKeyDirty = ref(false);
    const kimiKeyDirty = ref(false);
    const savingCodex = ref(false);
    const savingOllama = ref(false);
    const savingKimi = ref(false);
    const probingOllama = ref(false);
    const switching = ref(false);

    // --- Ollama ---
    const ollamaStatus = ref({ configured: null });
    const ollamaStatusLoadFailed = ref(false);
    const ollamaModels = ref([]);
    const ollamaSelectedModel = ref('');
    const reloading = ref(false);
    const settingModel = ref(false);

    // --- Kimi ---
    const kimiStatus = ref({ configured: null });
    const kimiStatusLoadFailed = ref(false);
    const kimiModels = ref([]);
    const kimiSelectedModel = ref('');
    const reloadingKimi = ref(false);
    const settingKimiModel = ref(false);

    // --- Codex ---
    const codexLoading = ref(true);
    const codexError = ref('');
    const codexData = ref({ configured: null, accounts: [] });
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

    function formatCount(value) {
      return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '—';
    }

    function formatContextCeiling(value) {
      return value == null
        ? 'automatic (model-derived)'
        : Number(value).toLocaleString() + ' characters';
    }

    function formatExpiry(value) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    }

    function shortAccountKey(value) {
      return typeof value === 'string' && value.length > 12 ? value.slice(0, 8) + '…' + value.slice(-4) : value;
    }

    function formatDensity(milli) {
      if (typeof milli !== 'number' || !Number.isFinite(milli)) return '—';
      return (milli / 1000).toFixed(2);
    }
    function provenanceClass(value) {
      if (value === 'temporary learned clamp') return 'is-clamp';
      if (value === 'override') return 'is-override';
      return 'is-built-in';
    }

    function overrideAboveFloor(row) {
      const value = codexForm.value.context_budget_overrides[row.model];
      return row.floor != null && Number.isFinite(Number(value)) && Number(value) > row.floor;
    }

    function setContextOverride(model, event) {
      const next = { ...codexForm.value.context_budget_overrides };
      if (event.target.value === '') delete next[model];
      else next[model] = Number(event.target.value);
      codexForm.value.context_budget_overrides = next;
      contextPolicyDirty.value = true;
    }

    function setContextUtilization(event) {
      codexForm.value.context_utilization = event.target.value === '' ? '' : Number(event.target.value);
      contextPolicyDirty.value = true;
    }

    function resetContextOverride(model) {
      const next = { ...codexForm.value.context_budget_overrides };
      delete next[model];
      codexForm.value.context_budget_overrides = next;
      contextPolicyDirty.value = true;
    }

    // --- Fetch all ---
    async function fetchAll() {
      loading.value = true;
      await Promise.all([fetchLLMStatus(), fetchOllamaStatus(), fetchKimiStatus(), fetchCodexStatus(), fetchContextWindows()]);
      loading.value = false;
    }

    async function fetchLLMStatus({ preserveBasic = false, preserveAdvanced = false } = {}) {
      try {
        const data = await api.get('/api/llm/status');
        llmStatus.value = data;
        llmStatusLoadFailed.value = false;
        selectedProvider.value = data.active_provider || 'codex';
        // Never clobber a form that has a NEWER edit waiting in its debounce
        // timer — the stale refresh would get re-saved (last-write-lost).
        if (data.codex && !saveCodexConfigDebounced.pending()) {
          if (!preserveBasic) {
            codexForm.value.enabled = data.codex.enabled;
            codexForm.value.model = data.codex.model || 'gpt-5.6-sol';
            codexForm.value.reasoning_effort = data.codex.reasoning_effort || 'medium';
            // null (inherit) maps to the '' select option
            codexForm.value.agent_reasoning_effort = data.codex.agent_reasoning_effort || '';
            codexForm.value.agent_model = data.codex.agent_model || '';
          }
          if (!preserveAdvanced) {
            codexForm.value.request_timeout_seconds = data.codex.request_timeout_seconds ?? codexForm.value.request_timeout_seconds;
            codexForm.value.stream_stall_timeout_seconds = data.codex.stream_stall_timeout_seconds ?? codexForm.value.stream_stall_timeout_seconds;
            codexForm.value.retry = { ...codexForm.value.retry, ...(data.codex.retry || {}) };
            codexForm.value.connection_pool = { ...codexForm.value.connection_pool, ...(data.codex.connection_pool || {}) };
            codexForm.value.context_compression = { ...codexForm.value.context_compression, ...(data.codex.context_compression || {}) };
            if (!contextPolicyDirty.value && !savingCodex.value) {
              codexForm.value.context_budget_overrides = { ...(data.codex.context_budget_overrides || {}) };
              codexForm.value.context_utilization = data.codex.context_utilization ?? codexForm.value.context_utilization;
            }
          }
        }
        if (data.ollama && !saveOllamaConfigDebounced.pending()) {
          if (!preserveBasic) {
            ollamaForm.value.enabled = data.ollama.enabled;
            ollamaForm.value.base_url = data.ollama.base_url || '';
            ollamaForm.value.model = data.ollama.model || '';
            ollamaForm.value.max_tokens = data.ollama.max_tokens || 4096;
          }
          if (!preserveAdvanced) ollamaForm.value.timeout = data.ollama.timeout ?? ollamaForm.value.timeout;
          // Don't overwrite api_key from server (it's masked)
        }
        if (data.kimi && !saveKimiConfigDebounced.pending()) {
          if (!preserveBasic) {
            kimiForm.value.enabled = data.kimi.enabled;
            kimiForm.value.model = data.kimi.model || '';
            kimiForm.value.max_tokens = data.kimi.max_tokens || 4096;
          }
          if (!preserveAdvanced) kimiForm.value.timeout = data.kimi.timeout ?? kimiForm.value.timeout;
        }
        if (data.auxiliary) {
          auxData.value = data.auxiliary;
          if (!saveAuxConfigDebounced.pending()) {
            auxForm.value.enabled = data.auxiliary.enabled;
            auxForm.value.model = data.auxiliary.model || 'gpt-5.6-luna';
          }
        }
      } catch (e) {
        // Failure provenance is separate from the last successful payload.
        // A refresh failure must not erase known provider configuration.
        // Before the first successful load, use an explicitly unknown shape
        // so the template can render "unavailable" without claiming false.
        if (!llmStatus.value) {
          llmStatus.value = {
            active_provider: '',
            codex: { configured: null },
            ollama: { configured: null },
            kimi: { configured: null },
          };
        }
        llmStatusLoadFailed.value = true;
      }
    }

    async function fetchContextWindows() {
      const requestSeq = ++contextWindowsRequestSeq;
      contextWindowsLoading.value = true;
      contextWindowsError.value = '';
      try {
        const data = await api.get('/api/context/windows');
        if (requestSeq !== contextWindowsRequestSeq) return;
        contextWindows.value = data;
        // GET is the derivation authority. Hydrate the editable Advanced
        // fields only when no provider save is in flight; rows always render
        // server truth and never recompute targets in the browser.
        if (!savingCodex.value && !contextPolicyDirty.value) {
          codexForm.value.context_budget_overrides = Object.fromEntries(
            Object.entries(data.models || {}).filter(([, details]) => details.override != null).map(([model, details]) => [model, details.override])
          );
          codexForm.value.context_utilization = data.utilization ?? codexForm.value.context_utilization;
        }
      } catch (e) {
        if (requestSeq === contextWindowsRequestSeq) {
          contextWindowsError.value = e.message || 'Failed to load context budgets';
        }
      } finally {
        if (requestSeq === contextWindowsRequestSeq) contextWindowsLoading.value = false;
      }
    }

    async function fetchOllamaStatus() {
      try {
        ollamaStatus.value = await api.get('/api/ollama/status');
        ollamaStatusLoadFailed.value = false;
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
        ollamaStatusLoadFailed.value = true;
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
        kimiStatusLoadFailed.value = false;
        if (kimiStatus.value.model) kimiSelectedModel.value = kimiStatus.value.model;
        if (kimiStatus.value.configured) {
          try {
            const m = await api.get('/api/kimi/models');
            kimiModels.value = m.models || [];
          } catch { kimiModels.value = []; }
        }
      } catch {
        kimiStatusLoadFailed.value = true;
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
    // Basic controls auto-save only their own fields. Advanced drafts remain
    // unreachable until the operator presses the panel's explicit Save.
    async function saveCodexConfig() {
      if (savingCodex.value) { saveCodexConfigDebounced(); return; }
      savingCodex.value = true;
      const submitted = codexBasicPayload(codexForm.value);
      try {
        await api.put('/api/llm/codex/config', submitted);
        showToast('Codex config saved');
        await Promise.all([fetchLLMStatus({ preserveBasic: true, preserveAdvanced: true }), fetchCodexStatus()]);
      } catch (e) {
        showToast(e.message || 'Failed', 'error');
        const changedWhileSaving = JSON.stringify(codexBasicPayload(codexForm.value)) !== JSON.stringify(submitted);
        await Promise.all([fetchLLMStatus({ preserveBasic: changedWhileSaving, preserveAdvanced: true }), fetchCodexStatus()]);
      }
      finally { savingCodex.value = false; }
    }

    async function saveCodexAdvancedConfig() {
      if (savingCodex.value) return;
      savingCodex.value = true;
      const submitted = codexAdvancedPayload(codexForm.value);
      try {
        await api.put('/api/llm/codex/config', submitted);
        const policyUnchanged = JSON.stringify({
          context_budget_overrides: codexForm.value.context_budget_overrides,
          context_utilization: codexForm.value.context_utilization,
        }) === JSON.stringify({
          context_budget_overrides: submitted.context_budget_overrides,
          context_utilization: submitted.context_utilization,
        });
        if (policyUnchanged) contextPolicyDirty.value = false;
        showToast('Codex advanced settings saved');
        await Promise.all([fetchLLMStatus({ preserveBasic: true, preserveAdvanced: true }), fetchCodexStatus(), fetchContextWindows()]);
      } catch (e) {
        showToast(e.message || 'Failed', 'error');
        const changedWhileSaving = JSON.stringify(codexAdvancedPayload(codexForm.value)) !== JSON.stringify(submitted);
        await Promise.all([fetchLLMStatus({ preserveBasic: true, preserveAdvanced: changedWhileSaving }), fetchCodexStatus(), fetchContextWindows()]);
      }
      finally { savingCodex.value = false; }
    }

    async function saveOllamaConfig() {
      if (savingOllama.value) { saveOllamaConfigDebounced(); return; }
      savingOllama.value = true;
      try {
        const sentKey = ollamaKeyDirty.value ? ollamaForm.value.api_key : null;
        const payload = ollamaBasicPayload(ollamaForm.value, { includeApiKey: sentKey !== null });
        await api.put('/api/llm/ollama/config', payload);
        showToast('Ollama config saved');
        if (sentKey !== null && ollamaForm.value.api_key === sentKey) {
          ollamaForm.value.api_key = '';
          ollamaKeyDirty.value = false;
        }
        await Promise.all([fetchLLMStatus({ preserveBasic: true, preserveAdvanced: true }), fetchOllamaStatus()]);
      } catch (e) { showToast(e.message || 'Failed', 'error'); }
      finally { savingOllama.value = false; }
    }

    async function saveOllamaAdvancedConfig() {
      if (savingOllama.value) return;
      savingOllama.value = true;
      try {
        await api.put('/api/llm/ollama/config', ollamaAdvancedPayload(ollamaForm.value));
        showToast('Ollama timeout saved');
        await Promise.all([fetchLLMStatus({ preserveBasic: true, preserveAdvanced: true }), fetchOllamaStatus()]);
      } catch (e) { showToast(e.message || 'Failed', 'error'); }
      finally { savingOllama.value = false; }
    }

    async function saveKimiConfig() {
      if (savingKimi.value) { saveKimiConfigDebounced(); return; }
      savingKimi.value = true;
      try {
        const sentKey = kimiKeyDirty.value ? kimiForm.value.api_key : null;
        const payload = kimiBasicPayload(kimiForm.value, { includeApiKey: sentKey !== null });
        await api.put('/api/llm/kimi/config', payload);
        showToast('Kimi config saved');
        if (sentKey !== null && kimiForm.value.api_key === sentKey) {
          kimiForm.value.api_key = '';
          kimiKeyDirty.value = false;
        }
        await Promise.all([fetchLLMStatus({ preserveBasic: true, preserveAdvanced: true }), fetchKimiStatus()]);
      } catch (e) { showToast(e.message || 'Failed', 'error'); }
      finally { savingKimi.value = false; }
    }

    async function saveKimiAdvancedConfig() {
      if (savingKimi.value) return;
      savingKimi.value = true;
      try {
        await api.put('/api/llm/kimi/config', kimiAdvancedPayload(kimiForm.value));
        showToast('Kimi timeout saved');
        await Promise.all([fetchLLMStatus({ preserveBasic: true, preserveAdvanced: true }), fetchKimiStatus()]);
      } catch (e) { showToast(e.message || 'Failed', 'error'); }
      finally { savingKimi.value = false; }
    }

    // Rapid-fire bindings (selects/checkboxes) go through these; explicit
    // actions (Enter on an input) keep the immediate savers.
    async function saveAuxConfig() {
      if (savingAux.value) { saveAuxConfigDebounced(); return; }
      savingAux.value = true;
      try {
        await api.put('/api/llm/auxiliary/config', auxForm.value);
        showToast('Auxiliary config saved');
        await fetchLLMStatus();
      } catch (e) {
        showToast(e.message || 'Failed', 'error');
        await fetchLLMStatus();
      }
      finally { savingAux.value = false; }
    }

    const saveCodexConfigDebounced = debounce(saveCodexConfig);
    const saveAuxConfigDebounced = debounce(saveAuxConfig);
    const saveOllamaConfigDebounced = debounce(saveOllamaConfig);
    const saveKimiConfigDebounced = debounce(saveKimiConfig);
    // Explicit saves (Enter) cancel the pending timer, then save immediately —
    // otherwise the timer would fire a duplicate PUT afterward.
    const saveCodexConfigNow = () => { saveCodexConfigDebounced.cancel(); return saveCodexConfig(); };
    const saveOllamaConfigNow = () => { saveOllamaConfigDebounced.cancel(); return saveOllamaConfig(); };
    const saveKimiConfigNow = () => { saveKimiConfigDebounced.cancel(); return saveKimiConfig(); };
    // Advanced Save never cancels a pending basic auto-save. If both overlap,
    // the basic saver requeues behind the explicit advanced request.
    const saveCodexAdvancedConfigNow = () => saveCodexAdvancedConfig();
    const saveOllamaAdvancedConfigNow = () => saveOllamaAdvancedConfig();
    const saveKimiAdvancedConfigNow = () => saveKimiAdvancedConfig();

    async function clearContextClamp(clamp) {
      const key = clamp.account_key + ':' + clamp.model;
      clearingClamp.value = key;
      try {
        const result = await api.post('/api/context/windows/clear', { account_key: clamp.account_key, model: clamp.model });
        showToast(result.cleared ? 'Temporary clamp cleared' : 'Clamp was already inactive');
        await fetchContextWindows();
      } catch (e) {
        showToast(e.message || 'Failed to clear clamp', 'error');
        await fetchContextWindows();
      } finally {
        clearingClamp.value = null;
      }
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
    onUnmounted(() => {
      if (pollController) pollController.cancelled = true;
      saveCodexConfigDebounced.cancel();
      saveAuxConfigDebounced.cancel();
      saveOllamaConfigDebounced.cancel();
      saveKimiConfigDebounced.cancel();
    });

    return {
      loading, llmStatus, llmStatusLoadFailed, selectedProvider, switching, advancedOpen,
      codexForm, codexModelOptions, codexAgentModelOptions,
      mainMaxAllowed, agentMaxAllowed, mainModelOptionDisabled, agentModelOptionDisabled,
      auxForm, auxData, auxModelOptions, onAuxModelChange, savingAux, saveAuxConfigDebounced,
      ollamaForm, kimiForm, savingCodex, savingOllama, savingKimi, probingOllama, ollamaKeyDirty, kimiKeyDirty,
      fetchCodexStatus,
      ollamaStatus, ollamaStatusLoadFailed, ollamaModels, ollamaSelectedModel, reloading, settingModel,
      kimiStatus, kimiStatusLoadFailed, kimiModels, kimiSelectedModel, reloadingKimi, settingKimiModel,
      codexLoading, codexError, codexData, refreshing, editingLabel, labelValue,
      contextWindows, contextWindowsLoading, contextWindowsError, contextBudgetRows, activeClampRows, activeContextBudget, clearingClamp, contextPolicyDirty,
      deviceState, deviceLoading, deviceInfo, deviceResult, deviceError,
      fetchAll, fetchLLMStatus, fetchOllamaStatus, fetchKimiStatus,
      switchProvider, reloadOllama, setOllamaModel,
      reloadKimi, setKimiModel, probeOllamaModels,
      saveCodexConfig, saveOllamaConfig, saveKimiConfig,
      saveCodexAdvancedConfig, saveOllamaAdvancedConfig, saveKimiAdvancedConfig,
      saveCodexConfigDebounced, saveOllamaConfigDebounced, saveKimiConfigDebounced,
      saveCodexConfigNow, saveOllamaConfigNow, saveKimiConfigNow,
      saveCodexAdvancedConfigNow, saveOllamaAdvancedConfigNow, saveKimiAdvancedConfigNow,
      activateAccount, refreshAccount, startEditLabel, saveLabel, deleteAccount,
      startDeviceLogin, cancelDeviceLogin, formatSize,
      fetchContextWindows, clearContextClamp, setContextOverride, setContextUtilization, resetContextOverride, overrideAboveFloor,
      formatCount, formatContextCeiling, formatExpiry, shortAccountKey, provenanceClass, formatDensity,
    };
  },
};
