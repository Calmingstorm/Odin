import { api } from '../api.js';
import { toast } from '../toast.js';
import { confirmDialog } from '../confirm.js';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  codexAdvancedPayload, codexBasicPayload,
  openaiCompatibleAdvancedPayload, openaiCompatibleBasicPayload,
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
          <p v-if="llmStatus && llmStatus.serving_provider === 'codex'" class="text-xs text-green-400 mt-1">Serving through Codex</p>
          <p v-else-if="llmStatus && llmStatus.serving_provider === 'compat'" class="text-xs text-green-400 mt-1">Serving through OpenAI-compatible</p>
          <p v-else-if="llmStatus && llmStatus.serving_provider === 'ollama'" class="text-xs text-green-400 mt-1">Serving through Ollama</p>
          <p v-else-if="llmStatus" class="text-xs text-amber-400 mt-1">Selected model is unavailable</p>
        </div>
        <button @click="fetchAll" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>

      <div v-if="loading && !llmStatus" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>

      <div v-else class="space-y-6">

        <!-- ==================== Shared model selection ==================== -->
        <div class="hm-card">
          <h2 class="text-sm font-semibold text-gray-300">Model Selection</h2>
          <p class="text-xs text-gray-500 mt-1 mb-3">Choose models, not a provider. Disabled or unreachable catalogue entries remain visible.</p>
          <div class="space-y-4">
            <div>
              <label class="text-xs text-gray-400 block">Search model catalogue
                <input v-model="modelSelectorSearch" class="hm-input" placeholder="Filter Main, Agent, and Auxiliary choices" />
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Main model
                <select v-model="modelSelection.main" @change="saveMainModel" class="hm-input">
                  <optgroup v-for="group in modelGroups" :key="group.id" :label="group.label">
                    <option v-for="model in group.models" :key="model.ref" :value="model.ref" :disabled="!model.available">
                      {{ modelOptionLabel(model) }}
                    </option>
                  </optgroup>
                </select>
              </label>
              <label v-if="selectedMainModel?.capability === 'reasoning'" class="text-xs text-gray-400 block mt-2">Reasoning
                <select :value="modelSelection.main_capability" @change="saveMainCapability($event.target.value)" class="hm-input">
                  <option v-for="effort in selectedMainModel.efforts || reasoningEfforts" :key="effort" :value="effort">{{ effort }}</option>
                </select>
              </label>
              <label v-else-if="selectedMainModel?.capability === 'thinking'" class="text-xs text-gray-400 block mt-2">Thinking
                <select :value="modelSelection.main_capability || 'adaptive'" @change="saveMainCapability($event.target.value)" class="hm-input">
                  <option value="adaptive">Adaptive</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Agent model
                <select v-model="agentsConfig.model" @change="saveAgentsModel" class="hm-input">
                  <option value="">Inherit main model</option>
                  <option value="auto">Auto — choose per spawn</option>
                  <optgroup v-for="group in modelGroups" :key="'agent:' + group.id" :label="group.label">
                    <option v-for="model in group.models" :key="model.ref" :value="model.ref" :disabled="!agentModelAvailable(model)">
                      {{ agentModelOptionLabel(model) }}
                    </option>
                  </optgroup>
                </select>
              </label>
              <label v-if="agentCapabilityKind === 'reasoning'" class="text-xs text-gray-400 block mt-2">Agent Reasoning
                <select :value="selectedAgentCapabilityValue" @change="saveAgentCapability($event.target.value)" class="hm-input">
                  <option value="">Inherit main capability</option>
                  <option value="auto">Auto — choose per spawn</option>
                  <option v-for="effort in agentCapabilityEfforts" :key="effort" :value="effort">{{ effort }}</option>
                </select>
              </label>
              <label v-else-if="agentCapabilityKind === 'thinking'" class="text-xs text-gray-400 block mt-2">Agent Thinking
                <select :value="selectedAgentCapabilityValue" @change="saveAgentCapability($event.target.value)" class="hm-input">
                  <option value="">Inherit main capability</option>
                  <option value="auto">Auto — choose per spawn</option>
                  <option value="adaptive">Adaptive</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
              <div class="mt-3">
                <p v-if="agentCapabilityKind === 'mixed' && autoAllowlistModels.some(model => model.capability !== 'none')" class="text-xs text-gray-400 mb-2">
                  Per-spawn reasoning: low / medium / high / max. Each choice maps to the selected model's native capability; omission uses its allowlist default.
                </p>
                <button type="button" class="btn btn-primary" @click="allowlistModalOpen = true">Configure agent allowlist</button>
                <p class="text-xs text-gray-500 mt-2">{{ allowlistSummary }}<span v-if="agentsConfig.model !== 'auto'"> · Used when Agent model is Auto</span></p>
              </div>
              <Teleport to="body">
              <div v-if="allowlistModalOpen" class="modal-overlay" v-modal-focus
                   @click.self="closeAllowlistModal" @keyup.escape="closeAllowlistModal"
                   tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="agent-allowlist-title">
                <div class="modal-content" style="max-width:1000px;width:calc(100vw - 32px)">
                  <div class="flex items-center justify-between gap-3 mb-3">
                    <h2 id="agent-allowlist-title" class="text-lg font-semibold">Agent model allowlist</h2>
                    <button type="button" class="btn btn-ghost" @click="closeAllowlistModal">Close</button>
                  </div>
                  <p class="text-xs text-gray-400 mb-3">{{ allowlistSummary }}. Changes save immediately. Top to bottom is preference order.</p>
                  <p class="text-xs text-gray-500 mb-3">An empty stored list means the default Codex models, not no models. Keep at least one selected, or reset to the default.</p>
                  <button type="button" class="btn btn-ghost text-xs mb-3" :disabled="allowlistSaving || !agentsConfig.auto_model_allowlist.length" @click="resetAgentAllowlist">Reset to Codex default</button>
                  <input v-model="openRouterSearch" aria-label="Search allowlist catalogue" class="hm-input mb-3" placeholder="Search model, vendor, or capability" />
                  <div v-for="group in autoAllowlistGroups" :key="group.id" class="mb-3">
                    <strong class="text-xs text-gray-400">{{ group.label }}</strong>
                    <label v-for="model in group.models" :key="'allow:' + model.ref" class="flex items-center gap-2 text-xs text-gray-300 mt-2">
                      <input type="checkbox" class="provider-control"
                             :checked="effectiveAllowlist.includes(model.ref)"
                             :disabled="allowlistSaving || (!agentModelAvailable(model) && !effectiveAllowlist.includes(model.ref))"
                             @change="toggleAgentAutoAllowlist(model.ref, $event)" />
                      {{ agentModelOptionLabel(model) }}
                    </label>
                  </div>
              <div v-if="openRouterRecognized" class="mt-3 space-y-3">
                <span class="block text-xs text-gray-400">OpenRouter catalogue</span>
                <p class="text-xs text-gray-500">Search the catalogue, add eligible models, then rank the selected list below. Provider pinning is configured per endpoint because routing churn destroys shared-prefix caching.</p>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select v-model="openRouterVendor" class="hm-input">
                    <option value="">All vendors</option>
                    <option v-for="vendor in openRouterVendors" :key="vendor" :value="vendor">{{ vendor }}</option>
                  </select>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input v-model.number="openRouterMaxPromptPrice" type="number" min="0" step="0.01" class="hm-input" placeholder="Maximum prompt $/M" />
                  <select v-model="openRouterQuantization" class="hm-input">
                    <option value="">All quantizations</option>
                    <option v-for="quant in openRouterQuantizations" :key="quant" :value="quant">{{ quant }}</option>
                  </select>
                </div>
                <div class="flex flex-wrap gap-3 text-xs text-gray-400">
                  <label class="flex items-center gap-2"><input v-model="openRouterToolsOnly" type="checkbox" class="provider-control" /> Tool-calling only</label>
                  <label class="flex items-center gap-2"><input v-model="openRouterEligibleOnly" type="checkbox" class="provider-control" /> Agent-eligible only</label>
                  <label class="flex items-center gap-2"><input v-model="openRouterStandardOnly" type="checkbox" class="provider-control" /> Standard variants only</label>
                  <label class="flex items-center gap-2"><input v-model="openRouterMeasuredCacheOnly" type="checkbox" class="provider-control" /> Measured cache only</label>
                </div>
                <div class="max-h-64 overflow-y-auto space-y-1 border border-gray-800 rounded p-2">
                  <div v-if="openRouterCatalogueLoading" class="text-xs text-gray-500">Loading OpenRouter catalogue…</div>
                  <div v-else-if="openRouterCatalogueError" class="text-xs text-red-400">{{ openRouterCatalogueError }}</div>
                  <div v-else class="text-xs text-gray-600 pb-1">Showing {{ openRouterResults.length }} of {{ openRouterMatchCount }} matches</div>
                  <div v-for="model in openRouterResults" :key="model.id" class="flex items-center justify-between gap-3 py-2 border-b border-gray-800 last:border-0">
                    <div class="min-w-0 text-xs">
                      <div class="font-mono text-gray-300 truncate">{{ model.id }}</div>
                      <div class="text-gray-500">{{ openRouterInlineFacts(model) }}</div>
                      <div v-if="!model.agent_eligible" class="text-amber-400">{{ model.agent_unavailable_reason }}</div>
                    </div>
                    <button type="button" class="btn btn-ghost text-xs" :disabled="allowlistSaving || !model.agent_eligible || effectiveAllowlist.includes('compat:' + model.id)" @click="prepareOpenRouterModel(model)">{{ effectiveAllowlist.includes('compat:' + model.id) ? 'Selected' : 'Add' }}</button>
                  </div>
                </div>
                <div v-if="openRouterPendingModel" class="border border-amber-700/50 rounded p-3 space-y-2">
                  <strong class="text-xs text-gray-300">Choose a provider for {{ openRouterPendingModel.id }}</strong>
                  <p class="text-xs text-gray-500">A fixed provider preserves shared-prefix cache locality. The value saved is OpenRouter's lowercase endpoint tag.</p>
                  <div v-if="openRouterPendingLoading" class="text-xs text-gray-500">Loading provider routes…</div>
                  <div v-else class="space-y-2">
                    <label class="text-xs text-gray-400 block">Compare providers by
                      <select v-model="openRouterEndpointSort" class="hm-input">
                        <option value="throughput">Highest p50 throughput</option>
                        <option value="latency_p99">Lowest p99 latency</option>
                        <option value="input_price">Lowest input price</option>
                        <option value="cache_price">Lowest cache-read price</option>
                        <option value="quantization">Quantization</option>
                      </select>
                    </label>
                    <div class="overflow-x-auto"><table class="w-full text-xs">
                      <thead><tr class="text-left text-gray-500"><th>Pin</th><th>Provider/tag</th><th>Input</th><th>Cache read</th><th>TPS p50</th><th>Latency p50 / p99</th><th>Quant</th><th>Tools</th><th>Measured cache</th></tr></thead>
                      <tbody>
                        <tr v-for="(endpoint, index) in openRouterSortedPendingEndpoints" :key="endpoint.tag + ':' + index" :class="!endpoint.supports_tools && 'opacity-50'">
                          <td><input v-model="openRouterPendingTag" type="radio" :value="endpoint.tag" :disabled="!endpoint.supports_tools" /></td>
                          <td>{{ endpoint.provider_name }}<br /><code>{{ endpoint.tag }}</code></td>
                          <td>{{ openRouterRate(endpoint.pricing?.prompt_per_token) }}</td>
                          <td>{{ openRouterRate(endpoint.pricing?.cache_read_per_token) }}</td>
                          <td>{{ openRouterMetric(endpoint.throughput_last_30m, 'p50') }}</td>
                          <td>{{ openRouterMetric(endpoint.latency_last_30m, 'p50') }} / {{ openRouterMetric(endpoint.latency_last_30m, 'p99') }}</td>
                          <td :class="endpoint.quantization === 'fp4' && 'text-amber-400'">{{ endpoint.quantization }}</td>
                          <td>{{ endpoint.supports_tools ? 'yes' : 'no' }}</td>
                          <td>{{ openRouterEndpointCacheFact(openRouterPendingModel.id, endpoint.provider_name) }}<span v-if="openRouterRouteWarning(endpoint)" class="block text-amber-400">{{ openRouterRouteWarning(endpoint) }}</span></td>
                        </tr>
                      </tbody>
                    </table></div>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button type="button" class="btn btn-primary text-xs" :disabled="allowlistSaving || !openRouterPendingTag || openRouterPendingLoading" @click="addOpenRouterModel(openRouterPendingModel, openRouterPendingTag)">Add pinned</button>
                    <button type="button" class="btn btn-ghost text-xs" :disabled="allowlistSaving || openRouterPendingLoading" @click="addOpenRouterModel(openRouterPendingModel, '')">Add unpinned anyway</button>
                    <button type="button" class="btn btn-ghost text-xs" @click="cancelOpenRouterPending">Cancel</button>
                  </div>
                </div>
                <div class="flex gap-2">
                  <button type="button" class="btn btn-ghost text-xs" @click="quickAddOpenRouter" :disabled="allowlistSaving || !openRouterCatalogue?.quick_add?.length">Quick-add curated</button>
                </div>
              </div>
                <div>
                  <strong class="text-xs text-gray-400">Selected order</strong>
                  <div v-for="ref in effectiveAllowlist" :key="'selected:' + ref" class="mt-2 border border-gray-800 rounded p-2">
                    <div class="flex items-center justify-between gap-2">
                      <span class="font-mono text-xs text-gray-300 break-all">{{ ref }}</span>
                      <div class="flex gap-1">
                        <button type="button" class="btn btn-ghost text-xs" :disabled="!canMoveAllowlist(ref, -1)" @click="moveAgentAutoAllowlist(ref, -1)">Up</button>
                        <button type="button" class="btn btn-ghost text-xs" :disabled="!canMoveAllowlist(ref, 1)" @click="moveAgentAutoAllowlist(ref, 1)">Down</button>
                        <button type="button" class="btn btn-ghost text-xs" :disabled="allowlistSaving || effectiveAllowlist.length === 1" @click="removeOpenRouterModel(ref)">Remove</button>
                      </div>
                    </div>
                    <p v-if="selectedUnavailableReason(ref)" class="text-xs text-amber-400 mt-1">Excluded: {{ selectedUnavailableReason(ref) }}</p>
                    <p class="text-xs text-gray-500 mt-1">{{ selectedModelFacts(ref) }}</p>
                    <button v-if="openRouterModelMap.get(ref)" type="button" class="btn btn-ghost text-xs mt-2" @click="prepareOpenRouterModel(openRouterModelMap.get(ref))">
                      {{ openRouterPin(ref) ? 'Change pinned provider: ' + openRouterPin(ref) : 'Choose provider pin' }}
                    </button>
                    <input :value="agentsConfig.model_selection_hints?.[ref] || ''" @change="saveModelHint(ref, $event.target.value)" class="hm-input mt-2" :placeholder="'Operator hint for ' + ref" />
                    <label v-if="allowlistModel(ref)?.capability === 'reasoning'" class="text-xs text-gray-400 block mt-2">Default reasoning
                      <select :value="allowlistEntryCapabilityValue(ref, 'reasoning_effort')" @change="saveAllowlistEntryCapability(ref, 'reasoning_effort', $event.target.value)" class="hm-input mt-1" :disabled="allowlistSaving">
                        <option value="">Inherit family default</option>
                        <option v-for="effort in allowlistModelEfforts(ref)" :key="effort" :value="effort">{{ effort }}</option>
                      </select>
                    </label>
                    <label v-else-if="allowlistModel(ref)?.capability === 'thinking'" class="text-xs text-gray-400 block mt-2">Default thinking
                      <select :value="allowlistEntryCapabilityValue(ref, 'thinking_mode')" @change="saveAllowlistEntryCapability(ref, 'thinking_mode', $event.target.value)" class="hm-input mt-1" :disabled="allowlistSaving">
                        <option value="">Inherit family default</option>
                        <option value="adaptive">Adaptive</option>
                        <option value="enabled">Enabled</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
              </div>
              </Teleport>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Auxiliary model
                <select :value="auxForm.enabled ? auxForm.model : ''" @change="onAuxModelChange" class="hm-input">
                  <option value="">Off — use main model</option>
                  <optgroup v-for="group in modelGroups" :key="'aux:' + group.id" :label="group.label">
                    <option v-for="model in group.models" :key="model.ref" :value="model.ref" :disabled="!model.available">
                      {{ modelOptionLabel(model) }}
                    </option>
                  </optgroup>
                </select>
              </label>
              <p class="text-xs text-gray-500 mt-1">Used for compaction, reflection, consolidation, and background follow-up. Its output feeds sessions and memory, so choose deliberately.</p>
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
          <p class="hidden text-xs text-gray-500 mt-3">
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
                          <th>Fresh-workload target</th>
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
                          <td data-label="Fresh-workload target">
                            <span class="llm-budget-value llm-budget-effective">{{ formatCount(row.primaryChars) }}</span><small>characters · fixed prior for a new workload</small>
                            <span v-if="contextWindows.max_context_chars_pending_restart === true && row.configuredPrimaryChars !== row.primaryChars" class="llm-budget-pending">Restart pending</span>
                          </td>
                          <td data-label="Provenance">
                            <span class="llm-budget-provenance" :class="provenanceClass(row.provenance)">{{ row.provenance }}</span>
                            <span v-if="row.workloadCalibration?.active_workloads" class="llm-budget-density">{{ row.densityScope }} · {{ row.workloadCalibration.active_workloads }} active</span>
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

        <section aria-label="Additional providers" class="space-y-6">
        <div><h2 class="text-sm font-semibold text-gray-300">Additional providers</h2><p class="text-xs text-gray-500 mt-1">Connect compatible endpoints or Ollama. Their models appear above automatically.</p></div>
        <!-- ==================== OpenAI-compatible Config ==================== -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">OpenAI-compatible endpoint</h2>
            <div class="flex items-center gap-3">
              <div v-if="compatibleStatusLoadFailed" class="text-sm"><span class="provider-status text-amber-500">Status unavailable</span></div>
              <div v-else-if="compatibleStatus.configured" class="text-sm">
                <span v-if="compatibleStatus.health && compatibleStatus.health.healthy" class="provider-status text-green-400"><span class="status-dot online" aria-hidden="true"></span>Connected</span>
                <span v-else class="provider-status text-red-400"><span class="status-dot offline" aria-hidden="true"></span>Unreachable</span>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="compatibleForm.enabled" @change="saveCompatibleConfigDebounced" class="provider-control" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400 block">Model catalogue
              <select v-model="compatibleForm.model" @change="saveCompatibleConfigDebounced"
                      class="hm-input">
                <option v-if="!visibleCompatibleModels.length" value="" disabled>No models available</option>
                <option v-for="m in visibleCompatibleModels" :key="m" :value="m">{{ m }}</option>
              </select>
              </label>
              <p class="text-xs mt-1" :class="compatibleCatalogueStatusClass">{{ compatibleCatalogueStatus }}</p>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Max Tokens
              <input v-model.number="compatibleForm.max_tokens" type="number" @keydown.enter="saveCompatibleConfigNow"
                     class="hm-input" />
              </label>
            </div>
            <div>
              <span class="text-xs text-gray-400">API Key</span>
              <div class="flex items-center gap-2">
                <span v-if="llmStatus && llmStatus.openai_compatible.has_api_key && !compatibleForm.api_key" class="provider-status text-xs text-green-400"><span class="status-dot online" aria-hidden="true"></span>Configured</span>
                <input v-model="compatibleForm.api_key" type="password" aria-label="OpenAI-compatible API key" @keydown.enter="saveCompatibleConfigNow" @input="compatibleKeyDirty = true"
                       :placeholder="llmStatus && llmStatus.openai_compatible.has_api_key ? '••••••••  (press Enter to replace)' : 'sk-...'"
                       class="hm-input flex-1" />
              </div>
            </div>
            <div><label class="text-xs text-gray-400 block">Base URL
              <input v-model="compatibleForm.base_url" placeholder="https://api.deepseek.com/v1" @keydown.enter="saveCompatibleConfigNow" class="hm-input" />
            </label></div>
            <div><label class="text-xs text-gray-400 block">Profile
              <select v-model="compatibleForm.preset" @change="applyCompatiblePreset" class="hm-input">
                <option v-for="(preset, key) in (llmStatus?.openai_compatible?.preset_catalogue || {})" :key="key" :value="key">{{ preset.label }}</option>
                <option value="kimi">Kimi compatibility</option><option value="custom">Custom</option>
              </select>
            </label></div>
          </div>
          <details class="llm-advanced compact" :open="advancedOpen.compatible" @toggle="advancedOpen.compatible = $event.target.open">
            <summary><span>Advanced Settings</span><small>Provider request timeout</small></summary>
            <div class="llm-advanced-body">
              <section class="llm-advanced-group single">
                <label><span class="llm-field-label">Request timeout <small>seconds</small></span>
                  <input v-model.number="compatibleForm.timeout" type="number" min="10" max="3600" class="hm-input" />
                </label>
              </section>
              <section class="llm-advanced-group single">
                <label><span class="llm-field-label">Agent context utilization</span><input v-model.number="compatibleForm.context_utilization" type="number" min="30" max="100" class="hm-input" /></label>
              </section>
              <section v-if="openRouterRecognized" class="llm-advanced-group">
                <header><strong>OpenRouter provider pinning</strong><span>Order uses lowercase endpoint tags, never display names. Fallbacks default off so a pin cannot silently drift.</span></header>
                <label><span class="llm-field-label">Default reasoning effort</span>
                  <select v-model="compatibleForm.openrouter.reasoning_effort" class="hm-input">
                    <option value="none">None</option><option value="minimal">Minimal</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="xhigh">X-high</option><option value="max">Max</option>
                  </select>
                </label>
                <label><span class="llm-field-label">Pinned endpoint tags <small>comma-separated</small></span>
                  <input :value="compatibleForm.openrouter.order.join(', ')" @change="setOpenRouterList('order', $event.target.value)" class="hm-input" placeholder="alibaba" />
                </label>
                <label><span class="llm-field-label">Quantizations <small>comma-separated</small></span>
                  <input :value="compatibleForm.openrouter.quantizations.join(', ')" @change="setOpenRouterList('quantizations', $event.target.value)" class="hm-input" placeholder="fp8, bf16" />
                </label>
                <label><span class="llm-field-label">Route sort</span>
                  <select v-model="compatibleForm.openrouter.sort" class="hm-input"><option :value="null">OpenRouter default</option><option value="price">Price</option><option value="throughput">Throughput</option><option value="latency">Latency</option></select>
                </label>
                <label><span class="llm-field-label">Data collection</span>
                  <select v-model="compatibleForm.openrouter.data_collection" class="hm-input"><option :value="null">OpenRouter default</option><option value="deny">Deny</option><option value="allow">Allow</option></select>
                </label>
                <label class="flex items-center gap-2"><input v-model="compatibleForm.openrouter.allow_fallbacks" type="checkbox" class="provider-control" /><span class="text-xs text-amber-400">Allow fallback away from the pin</span></label>
                <p class="text-xs text-gray-500">require_parameters is always sent when tools or reasoning are present. Measured cached-token ratios appear in the selected model list after real calls.</p>
              </section>
              <div class="llm-advanced-footer"><button type="button" class="btn btn-primary text-xs" @click="saveCompatibleAdvancedConfigNow" :disabled="savingCompatible">Save endpoint settings</button></div>
            </div>
          </details>
          <div v-if="compatibleStatus?.health && compatibleStatus.health.error"
               class="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800 mt-3">
            {{ compatibleStatus.health.error }}
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
        </section>
      </div>

    </div>
  `,

  setup() {
    const loading = ref(true);

    // --- LLM Provider ---
    const llmStatus = ref(null);
    const llmStatusLoadFailed = ref(false);
    const modelSelection = ref({ main: '', main_capability: 'medium', agent_capability: 'adaptive' });
    const modelSelectorSearch = ref('');
    const reasoningEfforts = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];

    // --- Config forms ---
    // agent_reasoning_effort: '' = inherit the chat setting (the server
    // normalizes ''/null to inherit; distinct from the literal effort "none").
    // Agent model policy belongs to /api/agents/model, not the Codex provider
    // payload. That boundary preserves provider-qualified agent choices.
    const codexForm = ref({
      enabled: false, model: 'gpt-5.6-sol', reasoning_effort: 'xhigh', agent_reasoning_effort: 'auto',
      request_timeout_seconds: 3600, stream_stall_timeout_seconds: 180,
      retry: { max_retries: 3, base_delay: 1, max_delay: 30 },
      connection_pool: { max_connections: 10, keepalive_timeout: 30 },
      context_compression: { enabled: true, max_context_chars: null, keep_recent_iterations: 30 },
      context_budget_overrides: {}, context_utilization: 60,
    });

    // Codex model catalog — ONE ordered list renders the Model, Agent Model,
    // and Auxiliary Model selects so the dropdowns can never drift apart.
    // gpt-6-astra (GPT-6, served-but-unlisted, Personal/Pro rollout 2026-09-04)
    // first, then the 5.6 family. The defunct
    // gpt-4.1/gpt-4o/gpt-4o-mini/gpt-5/gpt-5-mini entries were removed.
    const CODEX_MODELS = ['gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'];
    const modelCatalog = computed(() => {
      const status = llmStatus.value || {};
      const providerModels = status.model_catalogue || status.model_catalog || {};
      const compatibleProfile = (name) => compatibleForm.value.model_profiles?.[name]
        || compatibleForm.value.openrouter?.catalogue_profiles?.[name]
        || null;
      const fallback = (id, models, state) => models.map(model => {
        const name = typeof model === 'string' ? model : model.name;
        const profile = id === 'compat' ? compatibleProfile(name) : null;
        return {
        ref: id === 'codex' ? model : `${id}:${name}`,
        name,
        provider: id,
        available: Boolean(state?.enabled && (id === 'codex' ? state.configured : state.health?.healthy)),
        unavailable_reason: !state?.enabled ? 'disabled' : !state?.configured ? 'not configured' : !state?.health?.healthy && id !== 'codex' ? 'unreachable' : '',
        capability: id === 'codex' ? 'reasoning' : profile?.supports_reasoning ? 'reasoning' : profile?.supports_thinking_mode ? 'thinking' : 'none',
        efforts: profile?.supported_efforts,
        profile,
      };
      });
      const catalogue = [
        ...(providerModels.codex || fallback('codex', CODEX_MODELS, status.codex)),
        ...(providerModels.compat || providerModels.openai_compatible || []),
        ...(providerModels.ollama || fallback('ollama', ollamaModels.value, status.ollama)),
      ].map(entry => typeof entry === 'string' ? { ref: entry, name: entry, provider: 'codex', available: true, capability: 'reasoning' } : entry);
      const mergeCompatible = (entry) => {
        const index = catalogue.findIndex(model => model.ref === entry.ref);
        if (index === -1) catalogue.push(entry); else catalogue[index] = { ...catalogue[index], ...entry };
      };
      for (const entry of fallback('compat', compatibleModels.value, status.openai_compatible)) mergeCompatible(entry);
      if (openRouterRecognized.value && openRouterModels.value.length) {
        for (const model of openRouterModels.value) {
          const ref = `compat:${model.id}`;
          mergeCompatible({
            ref,
            name: model.name || model.id,
            provider: 'compat',
            available: true,
            unavailable_reason: '',
            capability: model.supports_reasoning ? 'reasoning' : 'none',
            efforts: reasoningEfforts.filter(effort => model.supported_efforts?.includes(effort)),
            agent_available: model.agent_eligible && Boolean(model.profile),
            agent_unavailable_reason: model.agent_unavailable_reason || '',
          });
        }
      }
      const known = new Set(catalogue.map(model => model.ref));
      for (const ref of [modelSelection.value.main, agentsConfig.value.model, ...effectiveAllowlist.value]) {
        if (ref && ref !== 'auto' && !known.has(ref)) catalogue.unshift({ ref, name: ref.replace(/^(compat|ollama):/, ''), provider: ref.split(':')[0] || 'codex', available: false, unavailable_reason: 'unavailable', capability: ref.startsWith('ollama:') ? 'none' : ref.includes(':') ? 'none' : 'reasoning' });
      }
      return catalogue.filter(model => !openRouterRecognized.value || model.provider !== 'compat' || model.ref.slice(7).includes('/'))
        .map(model => model.efforts ? {
          ...model,
          efforts: reasoningEfforts.filter(effort => model.efforts.includes(effort) && !modelRejects(model.ref, effort)),
        } : model);
    });
    const modelGroups = computed(() => [
      ['codex', 'Codex'], ['compat', 'OpenAI-compatible'], ['ollama', 'Ollama'],
    ].map(([id, label]) => ({
      id,
      label,
      models: modelCatalog.value.filter(model => {
        if (model.provider !== id) return false;
        const query = modelSelectorSearch.value.trim().toLowerCase();
        return !query || `${model.name} ${model.ref}`.toLowerCase().includes(query);
      }),
    })).filter(group => group.models.length));
    const agentModelAvailable = (model) => model.available && model.agent_available !== false;
    const agentModelOptionLabel = (model) => {
      if (!model.available) return modelOptionLabel(model);
      return `${model.name}${model.agent_available === false ? ` (${model.agent_unavailable_reason || 'not agent-eligible'})` : ''}`;
    };
    const autoAllowlistGroups = computed(() => [
      ['codex', 'Codex'], ['compat', 'OpenAI-compatible'], ['ollama', 'Ollama'],
    ].map(([id, label]) => ({
      id, label,
      models: modelCatalog.value.filter(model => model.provider === id
        && !(id === 'compat' && openRouterRecognized.value)
        && `${model.ref} ${model.name}`.toLowerCase().includes(openRouterSearch.value.trim().toLowerCase())),
    })).filter(group => group.models.length));
    const selectedMainModel = computed(() => modelCatalog.value.find(model => model.ref === modelSelection.value.main));
    const selectedAgentModel = computed(() => modelCatalog.value.find(model => model.ref === agentsConfig.value.model));
    const allowlistModel = (ref) => modelCatalog.value.find(model => model.ref === ref);
    const allowlistModelEfforts = (ref) => {
      const model = allowlistModel(ref);
      if (model?.provider === 'codex') {
        return ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
          .filter(effort => !modelRejects(ref, effort));
      }
      return model?.efforts || [];
    };
    const allowlistEntry = (ref) => configuredAllowlistEntries.value.find(entry => allowlistEntryRef(entry) === ref);
    const allowlistEntryCapabilityValue = (ref, field) => {
      const entry = allowlistEntry(ref);
      return typeof entry === 'string' ? '' : entry?.[field] || '';
    };
    const autoAllowlistModels = computed(() => effectiveAllowlist.value.map(ref => allowlistModel(ref))
      .filter(model => model && agentModelAvailable(model)));
    const autoCapabilityKinds = computed(() => [...new Set(autoAllowlistModels.value.map(model => {
      if (model.capability !== 'reasoning') return model.capability || 'none';
      return model.provider === 'codex' ? 'codex_reasoning' : 'compatible_reasoning';
    }))]);
    const autoAllowlistMixed = computed(() => autoCapabilityKinds.value.length > 1);
    const agentCapabilityKind = computed(() => {
      if (agentsConfig.value.model !== 'auto') return selectedAgentModel.value?.capability || 'none';
      if (autoAllowlistMixed.value) return 'mixed';
      const kind = autoCapabilityKinds.value[0] || 'none';
      return kind.endsWith('_reasoning') ? 'reasoning' : kind;
    });
    const agentCapabilityEfforts = computed(() => agentsConfig.value.model === 'auto'
      ? reasoningEfforts : (selectedAgentModel.value?.efforts || reasoningEfforts));
    const selectedAgentCapabilityValue = computed(() => agentCapabilityKind.value === 'thinking'
      ? (agentsConfig.value.thinking_mode ?? codexForm.value.agent_reasoning_effort ?? '')
      : (codexForm.value.agent_reasoning_effort ?? ''));
    const modelOptionLabel = (model) => `${model.name}${model.available ? '' : ` (${model.unavailable_reason || 'unavailable'})`}`;
    // model/agent_model are free strings server-side: an unknown configured
    // value (hand-edited or future model) must render as a temporary option —
    // a blank select would let the next save silently replace it.
    const codexModelOptions = computed(() => {
      const v = codexForm.value.model;
      return v && !CODEX_MODELS.includes(v) ? [v, ...CODEX_MODELS] : CODEX_MODELS;
    });
    const codexAgentModelOptions = computed(() => {
      const v = agentsConfig.value.model;
      // '' (inherit) and 'auto' are already fixed template options — do not
      // inject them as a temporary/unknown option, which would duplicate them.
      return v && v !== 'auto' && !CODEX_MODELS.includes(v) ? [v, ...CODEX_MODELS] : CODEX_MODELS;
    });
    // Per-model efforts the server rejects per-request — a MIRROR of
    // config.schema.CODEX_MODEL_UNSUPPORTED_EFFORTS, pinned by
    // tests/test_ui_effort_mirror.py so the dropdowns can never drift from the
    // four server-side boundaries. "max" is gpt-5.6-family-and-newer only;
    // gpt-6-astra rejects "none". Both directions are guarded here because the
    // full-form debounced save would otherwise carry a hidden-but-still-
    // selected invalid value: an effort option hides when its governing model
    // can't serve it, AND a model can't be selected while that axis's
    // effective effort is one the model rejects. Agent Model "auto" always
    // offers every effort — the per-spawn pair is validated at execution.
    const UNSUPPORTED_EFFORTS = {
      'gpt-5.4': ['max'],
      'gpt-5.4-mini': ['max'],
      'gpt-6-astra': ['none'],
    };
    const modelRejects = (model, effort) =>
      Boolean(model) && Boolean(effort) && (UNSUPPORTED_EFFORTS[model] || []).includes(effort);
    // Main (chat) axis: the chat model must serve the effort, and so must a
    // fixed agent model that inherits the chat effort.
    const codexAgentModel = computed(() => {
      const value = agentsConfig.value.model;
      return value && !value.includes(':') ? value : null;
    });
    const mainEffortAllowed = (effort) =>
      !modelRejects(codexForm.value.model, effort)
      && !(codexForm.value.agent_reasoning_effort === ''
           && modelRejects(codexAgentModel.value, effort));
    // Agent axis: governed by the agent model, or the chat model when
    // inheriting; "auto" defers to spawn-time validation.
    const agentEffortAllowed = (effort) => {
      const am = agentsConfig.value.model;
      if (am === 'auto') return true;
      return !modelRejects(am || codexForm.value.model, effort);
    };
    const agentEffectiveEffort = computed(() => {
      const ae = codexForm.value.agent_reasoning_effort;
      if (ae === 'auto') return null;
      return ae || codexForm.value.reasoning_effort;
    });
    const mainModelOptionDisabled = (m) =>
      modelRejects(m, codexForm.value.reasoning_effort)
      // Inherit-chain: agents inheriting this model while their effective
      // effort is one it rejects would become an invalid pair.
      || (agentsConfig.value.model === '' && modelRejects(m, agentEffectiveEffort.value));
    const agentModelOptionDisabled = (m) => modelRejects(m, agentEffectiveEffort.value);
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
      if (v.startsWith('compat:') && openRouterRecognized.value) {
        selectOpenRouterModel(compatibleModelId(v), openRouterPin(v))
          .then(() => saveAuxConfigDebounced())
          .catch(error => showToast(error.message || 'Failed to prepare OpenRouter model', 'error'));
      } else {
        saveAuxConfigDebounced();
      }
    }
    const savingAux = ref(false);
    const advancedOpen = ref({ codex: false, ollama: false, compatible: false });
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
      densityPriorMilli: details.density_prior_milli,
      densityScope: details.density_scope,
      workloadCalibration: details.workload_calibration,
    })));
    const activeClampRows = computed(() => contextWindows.value?.clamps || []);
    const activeContextBudget = computed(() => contextWindows.value?.models?.[codexForm.value.model] || null);
    const ollamaForm = ref({ enabled: false, base_url: '', model: '', api_key: '', max_tokens: 4096, timeout: 300 });
    const compatibleForm = ref({ enabled: false, base_url: 'https://api.deepseek.com/v1', api_key: '', model: 'deepseek-v4-flash', max_tokens: 4096, timeout: 300, preset: 'deepseek', model_profiles: {}, context_utilization: 75, openrouter: { order: [], allow_fallbacks: false, quantizations: [], sort: null, data_collection: null, reasoning_effort: 'medium', model_pins: {}, catalogue_profiles: {} } });
    const ollamaKeyDirty = ref(false);
    const compatibleKeyDirty = ref(false);
    const savingCodex = ref(false);
    const savingOllama = ref(false);
    const savingCompatible = ref(false);
    const probingOllama = ref(false);
    const switching = ref(false);

    // --- Ollama ---
    const ollamaStatus = ref({ configured: null });
    const ollamaStatusLoadFailed = ref(false);
    const ollamaModels = ref([]);
    const ollamaSelectedModel = ref('');
    const reloading = ref(false);
    const settingModel = ref(false);

    // --- OpenAI-compatible ---
    const compatibleStatus = ref({ configured: null });
    const compatibleStatusLoadFailed = ref(false);
    const compatibleModels = ref([]);
    const visibleCompatibleModels = computed(() => openRouterRecognized.value
      ? openRouterModels.value.map(model => model.id)
      : compatibleModels.value);
    const compatibleSelectedModel = ref('');
    const reloadingCompatible = ref(false);
    const settingCompatibleModel = ref(false);
    const agentsConfig = ref({ model: 'auto', thinking_mode: null, auto_model_allowlist: [] });
    const allowlistModalOpen = ref(false);
    const allowlistSaving = ref(false);
    const allowlistEntryRef = (entry) => typeof entry === 'string' ? entry : entry?.model;
    const configuredAllowlistEntries = computed(() => (agentsConfig.value.auto_model_allowlist || [])
      .map(entry => typeof entry === 'string' ? entry : { ...entry })
      .filter(entry => allowlistEntryRef(entry)));
    const effectiveAllowlist = computed(() => configuredAllowlistEntries.value.length
      ? configuredAllowlistEntries.value.map(allowlistEntryRef) : CODEX_MODELS);
    const allowlistSummary = computed(() => agentsConfig.value.auto_model_allowlist?.length
      ? `Allowlist: ${effectiveAllowlist.value.length} models` : 'Default: Codex models');
    function closeAllowlistModal() {
      allowlistModalOpen.value = false;
      cancelOpenRouterPending();
    }
    const selectedUnavailableReason = (ref) => {
      if (openRouterRecognized.value && ref.startsWith('compat:') && !ref.slice(7).includes('/')) {
        return 'OpenRouter requires a namespaced vendor/model ID; this is a direct-endpoint profile.';
      }
      const model = modelCatalog.value.find(item => item.ref === ref);
      if (!model) return 'Model is absent from the current endpoint catalogue.';
      return agentModelAvailable(model) ? '' : model.agent_unavailable_reason || model.unavailable_reason || 'Not agent-eligible';
    };
    const selectedModelFacts = (ref) => {
      if (openRouterModelMap.value.has(ref)) return openRouterSelectedFacts(ref);
      const model = modelCatalog.value.find(item => item.ref === ref);
      const meta = model?.hint_metadata || {};
      return [meta.hint || meta.hint_derived, meta.as_of && `as of ${meta.as_of}`,
        meta.scope_note, meta.evidence && `Evidence: ${meta.evidence}`, model && structuralFacts(model)].filter(Boolean).join(' · ')
        || 'No catalogue hint. Add an operator hint below.';
    };
    const openRouterCatalogue = ref(null);
    const openRouterCatalogueLoading = ref(false);
    const openRouterCatalogueError = ref('');
    // Populate presentation profiles on catalogue arrival, before selection is
    // possible. Selection still persists the conservative route-derived profile
    // through the existing API; catalogue preview never overwrites operator data.
    const openRouterModels = computed(() => (openRouterCatalogue.value?.models || []).map(model => {
      const profile = compatibleForm.value.model_profiles?.[model.id]
        || model.profile
        || compatibleForm.value.openrouter?.catalogue_profiles?.[model.id]
        || (model.context_length > 0 && model.max_completion_tokens > 0 ? {
          total_window_tokens: model.context_length,
          max_output_tokens: model.max_completion_tokens,
        } : null);
      const working = profile ? Math.floor((profile.total_window_tokens - profile.max_output_tokens)
        * compatibleForm.value.context_utilization / 100) : 0;
      const reason = model.variant !== 'standard' ? `${model.variant} variant is not offered for ordinary agents`
        : !model.supports_tools ? 'Model catalogue does not declare tool support'
          : !profile ? 'Catalogue has no complete context profile'
            : working < 63000 ? `Post-utilization working budget is ${working.toLocaleString()} tokens; at least 63,000 are required`
              : '';
      return { ...model, profile, agent_eligible: !reason, agent_unavailable_reason: reason };
    }));
    const openRouterSearch = ref('');
    const openRouterVendor = ref('');
    const openRouterToolsOnly = ref(true);
    const openRouterEligibleOnly = ref(true);
    const openRouterStandardOnly = ref(true);
    const openRouterMeasuredCacheOnly = ref(false);
    const openRouterMaxPromptPrice = ref(null);
    const openRouterQuantization = ref('');
    const openRouterPendingModel = ref(null);
    const openRouterPendingTag = ref('');
    const openRouterPendingEndpoints = ref([]);
    const openRouterPendingLoading = ref(false);
    const openRouterEndpointSort = ref('throughput');
    const endpointMetricNumber = (endpoint, field, percentile = null) => {
      const value = endpoint[field];
      const selected = percentile && value && typeof value === 'object' ? value[percentile] : value;
      const number = Number(selected);
      return Number.isFinite(number) ? number : null;
    };
    const openRouterSortedPendingEndpoints = computed(() => {
      const rows = [...openRouterPendingEndpoints.value];
      const sort = openRouterEndpointSort.value;
      return rows.sort((left, right) => {
        if (sort === 'quantization') return String(left.quantization).localeCompare(String(right.quantization));
        const [field, percentile, descending] = sort === 'throughput'
          ? ['throughput_last_30m', 'p50', true]
          : sort === 'latency_p99'
            ? ['latency_last_30m', 'p99', false]
            : sort === 'cache_price'
              ? ['cache_read_per_token', null, false]
              : ['prompt_per_token', null, false];
        const leftRaw = left.pricing?.[field];
        const rightRaw = right.pricing?.[field];
        const leftValue = percentile ? endpointMetricNumber(left, field, percentile) : leftRaw == null ? null : Number(leftRaw);
        const rightValue = percentile ? endpointMetricNumber(right, field, percentile) : rightRaw == null ? null : Number(rightRaw);
        if (!Number.isFinite(leftValue)) return 1;
        if (!Number.isFinite(rightValue)) return -1;
        return descending ? rightValue - leftValue : leftValue - rightValue;
      });
    });
    const compatibleHostname = computed(() => {
      try { return new URL(compatibleForm.value.base_url).hostname; } catch { return ''; }
    });
    const openRouterRecognized = computed(() => /(^|\.)openrouter\.ai$/i.test(compatibleHostname.value));
    const compatibleCatalogueStatus = computed(() => {
      if (!openRouterRecognized.value) return compatibleModels.value.length
        ? `${compatibleModels.value.length} endpoint models loaded`
        : 'Catalogue not loaded';
      if (openRouterCatalogueLoading.value) return 'OpenRouter recognized · fetching catalogue…';
      if (openRouterCatalogueError.value) return `OpenRouter recognized · catalogue failed: ${openRouterCatalogueError.value}`;
      return `OpenRouter recognized · ${openRouterCatalogue.value?.models?.length || 0} catalogue models loaded`;
    });
    const compatibleCatalogueStatusClass = computed(() => openRouterCatalogueError.value ? 'text-red-400' : 'text-gray-500');
    const openRouterVendors = computed(() => [...new Set((openRouterCatalogue.value?.models || []).map(model => model.vendor))].sort());
    const openRouterQuantizations = computed(() => [...new Set(
      (openRouterCatalogue.value?.models || []).flatMap(model => (model.endpoints || []).map(endpoint => endpoint.quantization)).filter(Boolean),
    )].sort());
    const modelHasMeasuredCache = (model) => (openRouterCatalogue.value?.measured_cache || []).some(row => row.model === model.id && row.samples > 0 && row.cached_percent > 0);
    const openRouterMatches = computed(() => {
      const query = openRouterSearch.value.trim().toLowerCase();
      return openRouterModels.value.filter(model => {
        if (query && !`${model.id} ${model.name} ${model.vendor}`.toLowerCase().includes(query)) return false;
        if (openRouterVendor.value && model.vendor !== openRouterVendor.value) return false;
        if (openRouterToolsOnly.value && !model.supports_tools) return false;
        if (openRouterEligibleOnly.value && !model.agent_eligible) return false;
        if (openRouterStandardOnly.value && model.variant !== 'standard') return false;
        if (openRouterMeasuredCacheOnly.value && !modelHasMeasuredCache(model)) return false;
        if (openRouterMaxPromptPrice.value != null && Number(model.pricing?.prompt_per_token) * 1000000 > Number(openRouterMaxPromptPrice.value)) return false;
        if (openRouterQuantization.value && !(model.endpoints || []).some(endpoint => endpoint.quantization === openRouterQuantization.value)) return false;
        return true;
      });
    });
    const openRouterResults = computed(() => openRouterMatches.value.slice(0, 100));
    const openRouterMatchCount = computed(() => openRouterMatches.value.length);
    const openRouterModelMap = computed(() => new Map(openRouterModels.value.map(model => [`compat:${model.id}`, model])));
    const dollarsPerMillion = (value) => value == null ? 'n/a' : `$${(Number(value) * 1000000).toFixed(3)}/M`;
    const openRouterInlineFacts = (model) => [
      model.vendor,
      model.context_length ? `${Number(model.context_length).toLocaleString()} ctx` : 'context unknown',
      `${dollarsPerMillion(model.pricing?.prompt_per_token)} in`,
      `${dollarsPerMillion(model.pricing?.completion_per_token)} out`,
      `${dollarsPerMillion(model.pricing?.cache_read_per_token)} cache read`,
      `${dollarsPerMillion(model.pricing?.cache_write_per_token)} cache write`,
      model.supports_tools ? 'tools' : 'no tools',
      model.supports_reasoning ? 'reasoning' : 'no reasoning',
      model.variant !== 'standard' ? model.variant : null,
    ].filter(Boolean).join(' · ');
    const openRouterSelectedFacts = (ref) => {
      const model = openRouterModelMap.value.get(ref);
      if (!model) return 'Catalogue facts unavailable';
      const measured = (openRouterCatalogue.value?.measured_cache || []).filter(row => row.model === model.id);
      const cache = measured.length ? measured.map(row => `${row.upstream_provider}: ${row.cached_percent}% cached`).join(' · ') : 'No measured cache evidence yet';
      return `${openRouterInlineFacts(model)} · ${cache}${model.profile_conflict ? ' · operator profile conflicts with catalogue' : ''}`;
    };
    const compatibleAgentModels = computed(() => compatibleModels.value.map(m => typeof m === 'string' ? m : m.name).filter(Boolean));
    const applyCompatiblePreset = async () => {
      const preset = llmStatus.value?.openai_compatible?.preset_catalogue?.[compatibleForm.value.preset];
      if (preset) compatibleForm.value.base_url = preset.base_url;
      saveCompatibleConfigDebounced.cancel();
      await saveCompatibleConfig();
    };
    const setOpenRouterList = (field, value) => {
      compatibleForm.value.openrouter[field] = value.split(',').map(item => item.trim()).filter(Boolean);
    };
    const ollamaAgentModels = computed(() => ollamaModels.value || []);
    const knownAgentModelRefs = computed(() => {
      const known = [
        ...CODEX_MODELS,
        ...compatibleAgentModels.value.map(model => `compat:${model}`),
        ...ollamaAgentModels.value.map(model => `ollama:${model.name}`),
      ];
      // A hand-configured future model or a Codex alias is not catalogue data,
      // but it is still policy. Keep it visible rather than silently dropping
      // it on the next save.
      for (const model of [agentsConfig.value.model, ...effectiveAllowlist.value]) {
        if (model && model !== 'auto' && !known.includes(model)) known.unshift(model);
      }
      return known;
    });
    const agentModelLabel = (model) => {
      if (model === 'codex-auto-review') return 'codex-auto-review (Codex alias → gpt-5.6-luna)';
      return model;
    };
    async function fetchAgentsConfig() {
      try { agentsConfig.value = { ...agentsConfig.value, ...(await api.get('/api/agents/model')) }; } catch { /* config remains unavailable */ }
    }
    async function fetchOpenRouterCatalogue() {
      if (!openRouterRecognized.value) {
        openRouterCatalogue.value = null;
        openRouterCatalogueError.value = '';
        return;
      }
      openRouterCatalogueLoading.value = true;
      try {
        openRouterCatalogue.value = await api.get('/api/openrouter/catalogue');
        openRouterCatalogueError.value = '';
      } catch (error) {
        openRouterCatalogueError.value = error.message || 'Failed to load OpenRouter catalogue';
      } finally {
        openRouterCatalogueLoading.value = false;
      }
    }
    async function saveAgentsModel() {
      try {
        if (agentsConfig.value.model?.startsWith('compat:') && openRouterRecognized.value) {
          await selectOpenRouterModel(
            compatibleModelId(agentsConfig.value.model),
            openRouterPin(agentsConfig.value.model),
          );
        }
        const result = await api.put('/api/agents/model', { model: agentsConfig.value.model || null });
        agentsConfig.value = { ...agentsConfig.value, ...result };
        showToast('Agent model policy saved');
      } catch (e) { showToast(e.message || 'Failed to save agent model policy', 'error'); }
    }

    async function toggleAgentAutoAllowlist(model, event) {
      const next = [...configuredAllowlistEntries.value];
      const index = next.findIndex(entry => allowlistEntryRef(entry) === model);
      if (event.target.checked && index < 0) next.push(model);
      if (!event.target.checked && index >= 0) next.splice(index, 1);
      if (!next.length) {
        event.target.checked = true;
        showToast('Keep one model selected. An empty list restores the Codex default.', 'error');
        return;
      }
      const saved = await saveOpenRouterAllowlist(next, 'Agent Auto allowlist saved');
      if (!saved) event.target.checked = effectiveAllowlist.value.includes(model);
    }

    async function saveOpenRouterAllowlist(next, message) {
      if (allowlistSaving.value) return false;
      allowlistSaving.value = true;
      try {
        const result = await api.put('/api/agents/model', { auto_model_allowlist: next });
        agentsConfig.value = { ...agentsConfig.value, ...result };
        showToast(message);
        return true;
      } catch (error) {
        showToast(error.message || 'Failed to save agent allowlist', 'error');
        return false;
      } finally { allowlistSaving.value = false; }
    }
    const resetAgentAllowlist = () => saveOpenRouterAllowlist([], 'Codex default restored');
    async function saveAllowlistEntryCapability(ref, field, value) {
      const next = effectiveAllowlist.value.map(current => {
        const existing = allowlistEntry(current);
        if (current !== ref) return existing || current;
        const entry = typeof existing === 'string' ? { model: current } : { ...(existing || { model: current }) };
        delete entry.reasoning_effort;
        delete entry.thinking_mode;
        if (value) entry[field] = value;
        return Object.keys(entry).length === 1 ? entry.model : entry;
      });
      await saveOpenRouterAllowlist(next, 'Model default saved');
    }
    async function selectOpenRouterModel(modelId, providerTag = '') {
      const [author, ...tail] = modelId.split('/');
      if (!author || !tail.length) throw new Error('OpenRouter model id is not namespaced');
      return api.post(`/api/openrouter/models/${encodeURIComponent(author)}/${encodeURIComponent(tail.join('/'))}/select`, { provider_tag: providerTag });
    }
    const openRouterEndpointCacheFact = (modelId, providerName) => {
      const row = (openRouterCatalogue.value?.measured_cache || []).find(item => item.model === modelId && item.upstream_provider === providerName);
      return row ? `${row.cached_percent}% cached over ${row.samples} calls` : 'no measured cache evidence';
    };
    const openRouterRate = (value) => value == null ? 'n/a' : `$${(Number(value) * 1000000).toFixed(4)}/M`;
    const openRouterMetric = (value, percentile) => {
      if (value == null) return 'n/a';
      if (typeof value === 'number') return Number(value).toLocaleString();
      const metric = value[percentile];
      return metric == null ? 'n/a' : Number(metric).toLocaleString();
    };
    const openRouterRouteWarning = (endpoint) => {
      const warnings = [];
      if (endpoint.quantization === 'fp4') warnings.push('fp4 quantization may change quality');
      const p99 = typeof endpoint.latency_last_30m === 'object' ? Number(endpoint.latency_last_30m?.p99) : null;
      const budgetMs = Number(agentsConfig.value.iteration_timeout_seconds || 0) * 1000;
      if (p99 && budgetMs && p99 > budgetMs) warnings.push('p99 exceeds the agent iteration budget');
      return warnings.join('; ');
    };
    async function prepareOpenRouterModel(model) {
      openRouterPendingModel.value = model;
      openRouterPendingTag.value = compatibleForm.value.openrouter.model_pins?.[model.id] || '';
      openRouterPendingLoading.value = true;
      try {
        const [author, ...tail] = model.id.split('/');
        const result = await api.get(`/api/openrouter/models/${encodeURIComponent(author)}/${encodeURIComponent(tail.join('/'))}/endpoints`);
        openRouterPendingEndpoints.value = result.endpoints || [];
      } catch (error) {
        openRouterPendingEndpoints.value = [];
        showToast(error.message || 'Failed to load OpenRouter provider routes', 'error');
      } finally {
        openRouterPendingLoading.value = false;
      }
    }
    function cancelOpenRouterPending() {
      openRouterPendingModel.value = null;
      openRouterPendingTag.value = '';
      openRouterPendingEndpoints.value = [];
    }
    async function addOpenRouterModel(model, providerTag = '') {
      try {
        await selectOpenRouterModel(model.id, providerTag);
        const saved = await saveOpenRouterAllowlist(
          [...configuredAllowlistEntries.value, ...(effectiveAllowlist.value.includes(`compat:${model.id}`) ? [] : [`compat:${model.id}`])],
          providerTag ? 'OpenRouter model added and provider pinned.' : 'OpenRouter model added unpinned.',
        );
        if (!saved) return;
        cancelOpenRouterPending();
        await fetchAll();
      } catch (error) { showToast(error.message || 'Failed to add OpenRouter model', 'error'); }
    }
    const compatibleModelId = (ref) => ref.startsWith('compat:') ? ref.slice('compat:'.length) : ref;
    const openRouterPin = (ref) => compatibleForm.value.openrouter.model_pins?.[compatibleModelId(ref)] || '';
    const removeOpenRouterModel = (ref) => effectiveAllowlist.value.length > 1 && saveOpenRouterAllowlist(
      configuredAllowlistEntries.value.filter(item => allowlistEntryRef(item) !== ref),
      'Model removed from allowlist',
    );
    async function quickAddOpenRouter() {
      try {
        const next = [...configuredAllowlistEntries.value];
        for (const ref of openRouterCatalogue.value?.quick_add || []) {
          if (!openRouterModelMap.value.get(ref)?.agent_eligible) continue;
          await selectOpenRouterModel(compatibleModelId(ref), '');
          if (!next.some(entry => allowlistEntryRef(entry) === ref)) next.push(ref);
        }
        await saveOpenRouterAllowlist(next, 'Curated OpenRouter models added');
        await fetchAll();
      } catch (error) {
        showToast(error.message || 'Failed to add curated OpenRouter models', 'error');
      }
    }

    function structuralFacts(model) {
      const meta = model.hint_metadata || {};
      const facts = [];
      if (meta.context_tokens) facts.push(`context ${Number(meta.context_tokens).toLocaleString()}`);
      if (meta.max_output_tokens) facts.push(`max output ${Number(meta.max_output_tokens).toLocaleString()}`);
      if (meta.structural_source) facts.push(`source ${meta.structural_source}`);
      return facts.join('; ');
    }

    async function saveModelHint(model, value) {
      const hints = { ...(agentsConfig.value.model_selection_hints || {}) };
      const hint = value.trim();
      if (hint) hints[model] = hint; else delete hints[model];
      try {
        const result = await api.put('/api/agents/model', { model_selection_hints: hints });
        agentsConfig.value = { ...agentsConfig.value, ...result };
        showToast('Model hint saved');
      } catch (e) { showToast(e.message || 'Failed to save model hint', 'error'); }
    }

    function canMoveAllowlist(model, direction) {
      const index = effectiveAllowlist.value.indexOf(model);
      return !allowlistSaving.value && index >= 0 && index + direction >= 0 && index + direction < effectiveAllowlist.value.length;
    }

    async function moveAgentAutoAllowlist(model, direction) {
      const next = [...configuredAllowlistEntries.value];
      const index = next.findIndex(entry => allowlistEntryRef(entry) === model);
      if (index < 0 || !canMoveAllowlist(model, direction)) return;
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      await saveOpenRouterAllowlist(next, 'Agent Auto allowlist order saved');
    }

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
      await Promise.all([fetchLLMStatus(), fetchOllamaStatus(), fetchCompatibleStatus(), fetchAgentsConfig(), fetchCodexStatus(), fetchContextWindows()]);
      await fetchOpenRouterCatalogue();
      loading.value = false;
    }

    async function fetchLLMStatus({ preserveBasic = false, preserveAdvanced = false } = {}) {
      try {
        const data = await api.get('/api/llm/status');
        llmStatus.value = data;
        llmStatusLoadFailed.value = false;
        modelSelection.value.main = data.main_model || data.active_model || (data.active_provider === 'compat' ? `compat:${data.openai_compatible?.model || ''}` : data.active_provider === 'ollama' ? `ollama:${data.ollama?.model || ''}` : data.codex?.model || 'gpt-5.6-sol');
        // Never clobber a form that has a NEWER edit waiting in its debounce
        // timer — the stale refresh would get re-saved (last-write-lost).
        if (data.codex && !saveCodexConfigDebounced.pending()) {
          if (!preserveBasic) {
            codexForm.value.enabled = data.codex.enabled;
            codexForm.value.model = data.codex.model || 'gpt-5.6-sol';
            codexForm.value.reasoning_effort = data.codex.reasoning_effort || 'medium';
            // null (inherit) maps to the '' select option
            codexForm.value.agent_reasoning_effort = data.codex.agent_reasoning_effort || '';
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
        const compatible = data.openai_compatible;
        if (compatible && !saveCompatibleConfigDebounced.pending()) {
          if (!preserveBasic) {
            compatibleForm.value.enabled = compatible.enabled;
            compatibleForm.value.base_url = compatible.base_url || compatibleForm.value.base_url;
            compatibleForm.value.model = compatible.model || compatibleForm.value.model;
            compatibleForm.value.max_tokens = compatible.max_tokens || 4096;
            compatibleForm.value.preset = compatible.preset || compatibleForm.value.preset;
          }
          if (!preserveAdvanced) {
            compatibleForm.value.timeout = compatible.timeout ?? compatibleForm.value.timeout;
            compatibleForm.value.model_profiles = compatible.model_profiles || compatibleForm.value.model_profiles;
            compatibleForm.value.context_utilization = compatible.context_utilization ?? compatibleForm.value.context_utilization;
            compatibleForm.value.openrouter = { ...compatibleForm.value.openrouter, ...(compatible.openrouter || {}) };
          }
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
            openai_compatible: { configured: null },
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

    async function saveMainModel() {
      try {
        if (modelSelection.value.main.startsWith('compat:') && openRouterRecognized.value) {
          await selectOpenRouterModel(
            compatibleModelId(modelSelection.value.main),
            openRouterPin(modelSelection.value.main),
          );
        }
        // The model-first endpoint is preferred. Older servers retain the
        // compatibility switch route, whose model field has the same meaning.
        try { await api.put('/api/llm/main-model', { model: modelSelection.value.main }); }
        catch (error) {
          if (!/404|not found/i.test(error.message || '')) throw error;
          await api.post('/api/llm/switch', { model: modelSelection.value.main });
        }
        showToast('Main model saved'); await fetchAll();
      } catch (e) { showToast(e.message || 'Failed to save main model', 'error'); await fetchLLMStatus(); }
    }
    async function saveMainCapability(value) {
      modelSelection.value.main_capability = value;
      const model = selectedMainModel.value;
      if (!model) return;
      if (model.capability === 'reasoning') { codexForm.value.reasoning_effort = value; await saveCodexConfig(); }
      else if (model.capability === 'thinking') { await api.put('/api/openai-compatible/config', { thinking_mode: value }); showToast('Thinking mode saved'); }
    }
    async function saveAgentCapability(value) {
      modelSelection.value.agent_capability = value;
      const model = selectedAgentModel.value;
      const capability = model?.capability || agentCapabilityKind.value;
      if (capability === 'none' || capability === 'mixed') return;
      if (value === '' || value === 'auto' || capability === 'reasoning') {
        codexForm.value.agent_reasoning_effort = value;
        if (capability === 'thinking') {
          const result = await api.put('/api/agents/model', { thinking_mode: null });
          agentsConfig.value = { ...agentsConfig.value, ...result };
        }
        await saveCodexConfig();
      } else if (capability === 'thinking') {
        const result = await api.put('/api/agents/model', { thinking_mode: value });
        agentsConfig.value = { ...agentsConfig.value, ...result };
        showToast('Agent thinking mode saved');
      }
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

    // --- OpenAI-compatible ---
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

    async function fetchCompatibleStatus() {
      try {
        compatibleStatus.value = await api.get('/api/openai-compatible/status');
        compatibleStatusLoadFailed.value = false;
        if (compatibleStatus.value.model) compatibleSelectedModel.value = compatibleStatus.value.model;
        if (compatibleStatus.value.configured) {
          try {
            const m = await api.get('/api/openai-compatible/models');
            compatibleModels.value = m.models || [];
          } catch { compatibleModels.value = []; }
        }
      } catch {
        compatibleStatusLoadFailed.value = true;
      }
    }

    async function reloadCompatible() {
      reloadingCompatible.value = true;
      try {
        const r = await api.post('/api/openai-compatible/reload');
        showToast(r.configured ? 'OpenAI-compatible reloaded' : (r.reason || 'OpenAI-compatible not configured'), r.configured ? 'success' : 'error');
        await fetchAll();
      } catch (e) { showToast(e.message || 'Reload failed', 'error'); }
      finally { reloadingCompatible.value = false; }
    }

    async function setCompatibleModel() {
      settingCompatibleModel.value = true;
      try {
        await api.post('/api/openai-compatible/model', { model: compatibleSelectedModel.value });
        showToast('Model set to ' + compatibleSelectedModel.value);
        await fetchAll();
      } catch (e) { showToast(e.message || 'Failed', 'error'); }
      finally { settingCompatibleModel.value = false; }
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

    async function saveCompatibleConfig() {
      if (savingCompatible.value) { saveCompatibleConfigDebounced(); return; }
      savingCompatible.value = true;
      try {
        const sentKey = compatibleKeyDirty.value ? compatibleForm.value.api_key : null;
        const payload = openaiCompatibleBasicPayload(compatibleForm.value, { includeApiKey: sentKey !== null });
        await api.put('/api/openai-compatible/config', payload);
        showToast('OpenAI-compatible config saved');
        if (sentKey !== null && compatibleForm.value.api_key === sentKey) {
          compatibleForm.value.api_key = '';
          compatibleKeyDirty.value = false;
        }
        await Promise.all([fetchLLMStatus({ preserveBasic: true, preserveAdvanced: true }), fetchCompatibleStatus()]);
        await fetchOpenRouterCatalogue();
      } catch (e) { showToast(e.message || 'Failed', 'error'); }
      finally { savingCompatible.value = false; }
    }

    async function saveCompatibleAdvancedConfig() {
      if (savingCompatible.value) return;
      savingCompatible.value = true;
      try {
        await api.put('/api/openai-compatible/config', openaiCompatibleAdvancedPayload(compatibleForm.value));
        showToast('OpenAI-compatible endpoint settings saved');
        await Promise.all([fetchLLMStatus({ preserveBasic: true, preserveAdvanced: true }), fetchCompatibleStatus()]);
        await fetchOpenRouterCatalogue();
      } catch (e) { showToast(e.message || 'Failed', 'error'); }
      finally { savingCompatible.value = false; }
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
    const saveCompatibleConfigDebounced = debounce(saveCompatibleConfig);
    // Explicit saves (Enter) cancel the pending timer, then save immediately —
    // otherwise the timer would fire a duplicate PUT afterward.
    const saveCodexConfigNow = () => { saveCodexConfigDebounced.cancel(); return saveCodexConfig(); };
    const saveOllamaConfigNow = () => { saveOllamaConfigDebounced.cancel(); return saveOllamaConfig(); };
    const saveCompatibleConfigNow = () => { saveCompatibleConfigDebounced.cancel(); return saveCompatibleConfig(); };
    // Advanced Save never cancels a pending basic auto-save. If both overlap,
    // the basic saver requeues behind the explicit advanced request.
    const saveCodexAdvancedConfigNow = () => saveCodexAdvancedConfig();
    const saveOllamaAdvancedConfigNow = () => saveOllamaAdvancedConfig();
    const saveCompatibleAdvancedConfigNow = () => saveCompatibleAdvancedConfig();

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
      saveCompatibleConfigDebounced.cancel();
    });

    return {
      allowlistModalOpen, closeAllowlistModal, allowlistSaving, effectiveAllowlist, allowlistSummary, resetAgentAllowlist, selectedUnavailableReason, selectedModelFacts,
      loading, llmStatus, llmStatusLoadFailed, modelSelection, modelSelectorSearch, reasoningEfforts, modelCatalog, modelGroups, selectedMainModel, selectedAgentModel, selectedAgentCapabilityValue, agentCapabilityKind, agentCapabilityEfforts, autoAllowlistModels, allowlistModel, allowlistModelEfforts, allowlistEntryCapabilityValue, modelOptionLabel, agentModelAvailable, agentModelOptionLabel, advancedOpen,
      codexForm, codexModelOptions, codexAgentModelOptions,
      mainEffortAllowed, agentEffortAllowed, mainModelOptionDisabled, agentModelOptionDisabled,
      auxForm, auxData, auxModelOptions, onAuxModelChange, savingAux, saveAuxConfigDebounced,
      ollamaForm, compatibleForm, savingCodex, savingOllama, savingCompatible, probingOllama, ollamaKeyDirty, compatibleKeyDirty,
      fetchCodexStatus,
      ollamaStatus, ollamaStatusLoadFailed, ollamaModels, ollamaSelectedModel, reloading, settingModel,
      compatibleStatus, compatibleStatusLoadFailed, compatibleModels, visibleCompatibleModels, compatibleSelectedModel, reloadingCompatible, settingCompatibleModel, applyCompatiblePreset, setOpenRouterList,
      agentsConfig, compatibleAgentModels, ollamaAgentModels, knownAgentModelRefs, agentModelLabel, saveAgentsModel, toggleAgentAutoAllowlist, saveAllowlistEntryCapability, autoAllowlistGroups, structuralFacts, saveModelHint, canMoveAllowlist, moveAgentAutoAllowlist,
      openRouterCatalogue, openRouterCatalogueLoading, openRouterCatalogueError, openRouterRecognized, compatibleCatalogueStatus, compatibleCatalogueStatusClass,
      openRouterSearch, openRouterVendor, openRouterVendors, openRouterToolsOnly, openRouterEligibleOnly, openRouterStandardOnly, openRouterMeasuredCacheOnly, openRouterMaxPromptPrice, openRouterQuantization, openRouterQuantizations, openRouterResults, openRouterMatchCount,
      openRouterInlineFacts, openRouterSelectedFacts, prepareOpenRouterModel, addOpenRouterModel, removeOpenRouterModel, quickAddOpenRouter, openRouterModelMap, openRouterPin,
      openRouterPendingModel, openRouterPendingTag, openRouterPendingEndpoints, openRouterPendingLoading, openRouterEndpointSort, openRouterSortedPendingEndpoints, openRouterEndpointCacheFact, openRouterRate, openRouterMetric, openRouterRouteWarning, cancelOpenRouterPending,
      codexLoading, codexError, codexData, refreshing, editingLabel, labelValue,
      contextWindows, contextWindowsLoading, contextWindowsError, contextBudgetRows, activeClampRows, activeContextBudget, clearingClamp, contextPolicyDirty,
      deviceState, deviceLoading, deviceInfo, deviceResult, deviceError,
      fetchAll, fetchLLMStatus, fetchOllamaStatus, fetchCompatibleStatus,
      saveMainModel, saveMainCapability, saveAgentCapability, reloadOllama, setOllamaModel,
      reloadCompatible, setCompatibleModel, probeOllamaModels,
      saveCodexConfig, saveOllamaConfig, saveCompatibleConfig,
      saveCodexAdvancedConfig, saveOllamaAdvancedConfig, saveCompatibleAdvancedConfig,
      saveCodexConfigDebounced, saveOllamaConfigDebounced, saveCompatibleConfigDebounced,
      saveCodexConfigNow, saveOllamaConfigNow, saveCompatibleConfigNow,
      saveCodexAdvancedConfigNow, saveOllamaAdvancedConfigNow, saveCompatibleAdvancedConfigNow,
      activateAccount, refreshAccount, startEditLabel, saveLabel, deleteAccount,
      startDeviceLogin, cancelDeviceLogin, formatSize,
      fetchContextWindows, clearContextClamp, setContextOverride, setContextUtilization, resetContextOverride, overrideAboveFloor,
      formatCount, formatContextCeiling, formatExpiry, shortAccountKey, provenanceClass, formatDensity,
    };
  },
};
