/**
 * Odin Management UI — Agents Page
 * Live agent status cards with real-time updates, tool usage, kill controls
 */
import { api } from '../api.js';
import { toast } from '../toast.js';
import { confirmDialog } from '../confirm.js';
import { formatTs, formatDuration } from '../utils.js';
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { createAgentAutoRefresh, createAgentDetailController } from '../agent-detail-state.js';
import ToolOutput from '../tool-output.js';


export default {
  components: { ToolOutput },
  template: `
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 class="text-xl font-semibold">Agents</h1>
        <div class="flex gap-2 items-center">
          <label class="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" v-model="autoRefresh" class="ag-checkbox" />
            Auto-refresh
          </label>
          <button @click="fetchAgents()" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Summary stats -->
      <div v-if="agents.length > 0" class="ag-stats-bar">
        <div class="ag-stat">
          <span class="ag-stat-value">{{ agents.length }}</span>
          <span class="ag-stat-label">Total</span>
        </div>
        <div class="ag-stat">
          <span class="ag-stat-value ag-stat-running">{{ runningCount }}</span>
          <span class="ag-stat-label">Running</span>
        </div>
        <div class="ag-stat">
          <span class="ag-stat-value ag-stat-completed">{{ completedCount }}</span>
          <span class="ag-stat-label">Completed</span>
        </div>
        <div class="ag-stat">
          <span class="ag-stat-value ag-stat-failed">{{ failedCount }}</span>
          <span class="ag-stat-label">Failed</span>
        </div>
      </div>

      <!-- Status filter -->
      <div v-if="agents.length > 0" class="ag-filter-bar" role="toolbar" aria-label="Filter agents by status">
        <button v-for="f in statusFilters" :key="f.value"
                class="ag-filter-btn" :class="{ 'ag-filter-active': statusFilter === f.value }"
                @click="statusFilter = f.value"
                :aria-pressed="statusFilter === f.value">
          {{ f.label }}
          <span v-if="f.count > 0" class="ag-filter-count">{{ f.count }}</span>
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading && agents.length === 0" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchAgents()" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="agents.length === 0" class="hm-card empty-state">
        <span class="empty-state-icon"><odin-icon name="bot" :size="23" /></span>
        <span class="empty-state-text">No agents</span>
        <span class="empty-state-hint">Agents are spawned via Discord commands or the chat interface</span>
      </div>

      <!-- Agent cards -->
      <div v-else class="ag-card-grid" role="list" aria-label="Agent list">
        <!-- The list ITEM is the semantic container; the actionable body is a
             button inside it, with Kill as a SIBLING — nesting a control
             inside a control is what the previous markup did. -->
        <div v-for="agent in filteredAgents" :key="agent.id" role="listitem"
             class="ag-card" :class="'ag-card-' + agent.status">
          <div class="ag-card-body ag-card-clickable" role="button" tabindex="0"
               :aria-label="'Open details for agent ' + agent.label"
               @click="openDetail(agent)"
               @keydown.enter.prevent="openDetail(agent)"
               @keydown.space.prevent="openDetail(agent)">
          <!-- Card header -->
          <div class="ag-card-header">
            <div class="ag-card-title-row">
              <span class="ag-status-dot" :class="'ag-dot-' + agent.status" role="img" :aria-label="'Status: ' + agent.status"></span>
              <span class="ag-card-label" :title="agent.label">{{ agent.label }}</span>
              <span class="ag-card-id">{{ agent.id }}</span>
            </div>
            <span class="ag-status-badge" :class="'ag-badge-' + agent.status">{{ agent.status }}</span>
          </div>

          <!-- Model / reasoning provenance — directly under the identity row
               so it sits at the SAME height in every card and reads as a
               property of the agent, not as a tag on its request text. -->
          <!-- Each tooltip reports ITS OWN axis source. Using the summary
               field made the effort chip claim it was requested at spawn
               while correctly displaying an inherited value — the precise
               kind of confident mislabelling this provenance work exists to
               prevent. -->
          <div class="ag-card-policy">
            <span class="ag-policy-chip"
                  :title="displayModelText(agent) + ' — ' + displaySourceLabel(agent.display_model_source || agent.display_source)">{{ displayModelText(agent) }}</span>
            <span class="ag-policy-chip ag-policy-effort"
                  :title="displayEffortText(agent) + ' — ' + displaySourceLabel(agent.display_reasoning_effort_source || agent.display_source)">{{ displayEffortText(agent) }}</span>
          </div>

          <!-- Goal (reserved height, faded overflow — variable goal lengths
               used to push everything below them out of alignment) -->
          <div class="ag-card-goal">{{ agent.goal }}</div>

          <!-- Progress bar (running agents, honest cap only) -->
          <div v-if="agent.status === 'running' && hasProgress(agent)" class="ag-progress-bar"
               role="progressbar" :aria-valuenow="agent.iteration_count"
               :aria-valuemin="0" :aria-valuemax="agent.max_iterations"
               aria-label="Agent iteration progress"
               :aria-valuetext="agent.iteration_count + ' of ' + agent.max_iterations + ' iterations'"
               :title="agent.iteration_count + ' of ' + agent.max_iterations + ' iterations'">
            <div class="ag-progress-fill" :style="{ width: progressPercent(agent) + '%' }"></div>
          </div>

          <!-- Stats row -->
          <div class="ag-card-stats">
            <div class="ag-card-stat">
              <span class="ag-card-stat-label">Iterations</span>
              <span class="ag-card-stat-value">{{ agent.iteration_count }}</span>
            </div>
            <div class="ag-card-stat">
              <span class="ag-card-stat-label">Runtime</span>
              <span class="ag-card-stat-value">{{ formatDuration(agent.runtime_seconds) }}</span>
            </div>
            <div class="ag-card-stat">
              <span class="ag-card-stat-label">Tools</span>
              <span class="ag-card-stat-value">{{ agent.tools_used_count ?? 0 }}</span>
            </div>
          </div>

          <!-- Requester -->
          <div class="ag-card-meta">
            <span v-if="agent.requester_name" class="text-gray-500 text-xs">
              by {{ agent.requester_name }}
            </span>
            <span v-if="agent.created_at" class="text-gray-600 text-xs">
              {{ formatTs(agent.created_at) }}
            </span>
          </div>

          <!-- Result / error (terminal states) -->
          <div v-if="agent.result && agent.status !== 'running'" class="ag-card-result">
            <div class="ag-result-label">Result</div>
            <div class="ag-result-text">{{ agent.result }}</div>
          </div>
          <div v-if="agent.error" class="ag-card-error">
            <div class="ag-result-label">Error</div>
            <div class="ag-result-text text-red-400">{{ agent.error }}</div>
          </div>

          </div><!-- /ag-card-body -->

          <!-- Kill is a SIBLING of the actionable body, never nested inside
               it: a control within a control is neither valid nor operable. -->
          <div v-if="agent.status === 'running'" class="ag-card-actions">
            <button @click="killAgent(agent.id)" class="btn btn-danger text-xs"
                    :disabled="killing === agent.id">
              {{ killing === agent.id ? 'Killing...' : 'Kill Agent' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Agent detail modal -->
      <div v-if="detailId" class="modal-overlay" v-modal-focus @click.self="closeDetail"
           @keyup.escape="closeDetail" tabindex="-1" role="dialog" aria-modal="true"
           aria-labelledby="agent-detail-title">
        <div class="modal-content ag-detail-modal">
          <div class="ag-detail-header">
            <div class="ag-detail-title-row">
              <span v-if="detail" class="ag-status-dot" :class="'ag-dot-' + detail.status"
                    role="img" :aria-label="'Status: ' + detail.status"></span>
              <h2 id="agent-detail-title" class="ag-detail-title">
                {{ detail ? detail.label : 'Agent' }}
              </h2>
              <span v-if="detail" class="ag-status-badge" :class="'ag-badge-' + detail.status">
                {{ detail.status }}
              </span>
              <span class="ag-card-id">{{ detailId }}</span>
            </div>
            <button @click="closeDetail" class="btn btn-ghost text-xs" aria-label="Close details">
              Close
            </button>
          </div>

          <div v-if="detailLoading && !detail" class="skeleton skeleton-row"></div>
          <div v-else-if="detailError" class="error-state" role="alert">
            <p class="text-red-400">{{ detailError }}</p>
          </div>

          <template v-else-if="detail">
            <!-- Metadata grid -->
            <div class="ag-detail-meta">
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Model</span>
                <span class="ag-detail-meta-value">{{ displayModelText(detail) }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Reasoning</span>
                <span class="ag-detail-meta-value">{{ displayEffortText(detail) }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Provider</span>
                <span class="ag-detail-meta-value">{{ detail.last_provider || '—' }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Iterations</span>
                <span class="ag-detail-meta-value">
                  {{ detail.iteration_count }}<template v-if="detail.max_iterations"> / {{ detail.max_iterations }}</template>
                </span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Runtime</span>
                <span class="ag-detail-meta-value">{{ formatDuration(detail.runtime_seconds) }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Tools used</span>
                <span class="ag-detail-meta-value">{{ detail.tools_used_count ?? 0 }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Activity</span>
                <span class="ag-detail-meta-value">{{ detail.activity || 'Not recorded' }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Tool executions</span>
                <span class="ag-detail-meta-value">{{ detail.tool_execution_count ?? 'Not recorded' }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Parent inbox</span>
                <span class="ag-detail-meta-value">{{ detail.pending_inbox_count ?? '—' }} queued; consumed sequence {{ detail.last_consumed_sequence ?? '—' }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Requested by</span>
                <span class="ag-detail-meta-value">{{ detail.requester_name || '—' }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Started</span>
                <span class="ag-detail-meta-value">{{ formatTs(detail.created_at) }}</span>
              </div>
              <div v-if="detail.parent_id" class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Parent</span>
                <span class="ag-detail-meta-value">{{ detail.parent_id }}</span>
              </div>
              <div v-if="detail.children_ids && detail.children_ids.length" class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Children</span>
                <span class="ag-detail-meta-value">{{ detail.children_ids.length }}</span>
              </div>
            </div>
            <p class="ag-detail-source">{{ displaySourceLabel(detail.display_source) }}</p>

            <!-- Request -->
            <div class="ag-detail-section">
              <div class="ag-detail-section-head">
                <span class="ag-result-label">Request</span>
                <button @click="copyText('goal', detail.goal)" class="btn btn-ghost text-xs">
                  {{ copied === 'goal' ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <pre class="ag-detail-text">{{ detail.goal }}</pre>
            </div>

            <!-- Result / error -->
            <div v-if="detail.result" class="ag-detail-section">
              <div class="ag-detail-section-head">
                <span class="ag-result-label">Result</span>
                <button @click="copyText('result', detail.result)" class="btn btn-ghost text-xs">
                  {{ copied === 'result' ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <tool-output :value="detail.result" label="Agent result" />
            </div>
            <div v-else-if="detail.status === 'running'" class="ag-detail-section">
              <span class="ag-result-label">Result</span>
              <p class="ag-detail-pending">Still running — the result appears here when it completes.</p>
            </div>

            <div v-if="detail.error" class="ag-detail-section">
              <div class="ag-detail-section-head">
                <span class="ag-result-label">Error</span>
                <button @click="copyText('error', detail.error)" class="btn btn-ghost text-xs">
                  {{ copied === 'error' ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <tool-output :value="detail.error" label="Agent error" />
            </div>
          </template>
        </div>
      </div>
    </div>`,

  setup() {
    const agents = ref([]);
    const loading = ref(true);
    const error = ref(null);
    const killing = ref(null);
    const autoRefresh = ref(true);
    const statusFilter = ref('all');
    let pageActive = false;

    const runningCount = computed(() => agents.value.filter(a => a.status === 'running').length);
    const completedCount = computed(() => agents.value.filter(a => a.status === 'completed').length);
    const failedCount = computed(() => agents.value.filter(a => ['failed', 'timeout', 'killed'].includes(a.status)).length);

    const statusFilters = computed(() => [
      { value: 'all', label: 'All', count: agents.value.length },
      { value: 'running', label: 'Running', count: runningCount.value },
      { value: 'completed', label: 'Completed', count: completedCount.value },
      { value: 'failed', label: 'Failed', count: failedCount.value },
    ]);

    const filteredAgents = computed(() => {
      if (statusFilter.value === 'all') return agents.value;
      if (statusFilter.value === 'failed') {
        return agents.value.filter(a => ['failed', 'timeout', 'killed'].includes(a.status));
      }
      return agents.value.filter(a => a.status === statusFilter.value);
    });

    // Progress against the cap ACTUALLY in force for this agent (chat 120 /
    // scheduled 180 / hard 300 all exist; the old hardcoded 30 made every
    // agent look pinned at 100% after a third of its real budget). Without a
    // cap from the server the bar renders nothing rather than a guess.
    function progressPercent(agent) {
      const max = Number(agent.max_iterations) || 0;
      if (max <= 0) return 0;
      return Math.min(100, Math.round((agent.iteration_count / max) * 100));
    }

    function hasProgress(agent) {
      return (Number(agent.max_iterations) || 0) > 0;
    }

    // "inherit (currently X)" is applied PER AXIS, from that axis's own
    // source — a spawn that pinned only the model must not make its inherited
    // effort look pinned too.
    function _axisText(value, source) {
      if (!value) return 'unknown';
      if (value === 'N/A') return 'N/A';
      return source === 'current_inheritance' ? `inherit (currently ${value})` : value;
    }

    function displayModelText(agent) {
      return _axisText(agent.display_model,
                       agent.display_model_source || agent.display_source);
    }

    function displayEffortText(agent) {
      return _axisText(agent.display_reasoning_effort,
                       agent.display_reasoning_effort_source || agent.display_source);
    }

    function displaySourceLabel(source) {
      return {
        last_execution: 'last executed',
        current_inheritance: 'inherited from current config — not yet executed',
        spawn_override_pending: 'requested at spawn — not yet executed',
        unknown: 'no execution data',
      }[source] || '';
    }

    // --- Detail modal -----------------------------------------------------
    const detail = ref(null);          // full record for the open agent
    const detailId = ref(null);        // which agent the modal is showing
    const detailLoading = ref(false);
    const detailError = ref(null);
    const copied = ref('');

    // The modal state machine lives in a standalone production module so the
    // async contract is exercised directly by the WebUI regression check.
    // Opens may supersede opens; periodic refreshes coalesce onto an existing
    // flight and every flight is bounded, preventing both stale writes and
    // timer-driven starvation on slow or hung requests.
    const detailState = {
      get detail() { return detail.value; },
      set detail(value) { detail.value = value; },
      get detailId() { return detailId.value; },
      set detailId(value) { detailId.value = value; },
      get detailLoading() { return detailLoading.value; },
      set detailLoading(value) { detailLoading.value = value; },
      get detailError() { return detailError.value; },
      set detailError(value) { detailError.value = value; },
    };
    const detailController = createAgentDetailController({
      state: detailState,
      requestDetail: (agentId, { signal }) => api.get(
        `/api/agents/${encodeURIComponent(agentId)}`,
        { signal },
      ),
    });

    async function openDetail(agent) {
      copied.value = '';
      await detailController.open(agent.id);
    }

    function closeDetail() {
      detailController.close();
      copied.value = '';
    }

    // A running agent's modal follows the same 5s cadence as the list, so a
    // result appears when the agent finishes. The controller makes this call
    // single-flight and gives a hung request a bounded timeout/retry path.
    async function refreshDetail() {
      await detailController.refresh();
    }

    async function copyText(kind, text) {
      try {
        await navigator.clipboard.writeText(text || '');
        copied.value = kind;
        setTimeout(() => { if (copied.value === kind) copied.value = ''; }, 1500);
      } catch {
        toast.error('Copy failed');
      }
    }

    async function fetchAgents(silent = false) {
      silent = silent === true;
      if (!silent) loading.value = true;
      try {
        const data = await api.get('/api/agents');
        agents.value = Array.isArray(data) ? data : [];
        error.value = null;
      } catch (e) {
        if (!silent) error.value = e.message;
      }
      if (!silent) loading.value = false;
    }

    async function killAgent(agentId) {
      const agent = agents.value.find(a => a.id === agentId);
      const ok = await confirmDialog({
        title: 'Kill agent',
        message: `Kill agent "${agent?.label || agentId}"? Its current work will be lost.`,
        confirmLabel: 'Kill',
        danger: true,
      });
      if (!ok) return;
      killing.value = agentId;
      try {
        await api.del(`/api/agents/${encodeURIComponent(agentId)}`);
        toast.success('Agent killed');
        await fetchAgents();
      } catch (e) {
        toast.error(e.message || 'Failed to kill agent');
      }
      killing.value = null;
    }

    const autoRefreshController = createAgentAutoRefresh({
      isEnabled: () => autoRefresh.value && pageActive,
      refreshList: () => fetchAgents(true),
      hasOpenDetail: () => Boolean(detailId.value),
      refreshDetail,
    });

    function startAutoRefresh() {
      autoRefreshController.start();
    }

    function stopAutoRefresh() {
      autoRefreshController.stop();
    }

    // The page is kept alive between tab visits. A direct watcher keeps the
    // checkbox and timer truthful after every disable/deactivate/reactivate
    // ordering instead of relying on lifecycle hooks alone.
    watch(autoRefresh, () => autoRefreshController.sync());

    // Under <keep-alive> a hidden tab stays MOUNTED, so mount-scoped polling
    // never stops — and this page's interval now also refreshes an open
    // modal. Polling is therefore tied to ACTIVATION (the pattern logs.js
    // already uses): a backgrounded Agents tab costs nothing.
    onMounted(() => {
      pageActive = true;
      fetchAgents();
      startAutoRefresh();
    });
    onActivated(() => {
      pageActive = true;
      fetchAgents(true);
      startAutoRefresh();
    });
    onDeactivated(() => {
      pageActive = false;
      stopAutoRefresh();
    });
    onUnmounted(() => {
      pageActive = false;
      stopAutoRefresh();
      detailController.close();
    });

    return {
      agents, loading, error, killing, autoRefresh, statusFilter,
      runningCount, completedCount, failedCount,
      statusFilters, filteredAgents,
      formatTs, formatDuration, progressPercent, hasProgress,
      displayModelText, displayEffortText, displaySourceLabel,
      detail, detailId, detailLoading, detailError, copied,
      openDetail, closeDetail, copyText,
      fetchAgents, killAgent, startAutoRefresh, stopAutoRefresh,
    };
  },
};
