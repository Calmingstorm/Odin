/**
 * Odin Management UI — Loops Page
 * View/start/stop autonomous loops, view iteration history
 */
import { api, ws } from '../api.js';
import { toast } from '../toast.js';
import { confirmDialog } from '../confirm.js';
import { formatDuration, formatTokens, formatTs } from '../utils.js';
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';
import { createDetailController } from '../detail-state.js';


export default {
  template: `
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 class="text-xl font-semibold">Autonomous Loops</h1>
        <div class="flex gap-2">
          <button @click="showCreate = !showCreate" class="btn btn-primary text-xs">
            {{ showCreate ? 'Cancel' : 'Start Loop' }}
          </button>
          <button @click="fetchLoops()" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Create form -->
      <div v-if="showCreate" class="hm-card mb-4">
        <h2 class="text-sm font-medium mb-3">Start New Loop</h2>

        <div class="mb-3">
          <label class="text-gray-400 text-xs block mb-1">Goal
          <textarea v-model="form.goal" class="hm-input" rows="3"
                    placeholder="What should this loop accomplish? e.g. Monitor disk usage and warn if above 80%"></textarea>
          </label>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Interval (seconds)
            <input v-model.number="form.interval_seconds" type="number" class="hm-input"
                   min="10" placeholder="60" />
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Mode
            <select v-model="form.mode" class="hm-input">
              <option value="notify">Notify (check + report)</option>
              <option value="act">Act (check + take actions + report)</option>
              <option value="silent">Silent (only report if notable)</option>
            </select>
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Max Iterations
            <input v-model.number="form.max_iterations" type="number" class="hm-input"
                   min="1" placeholder="50" />
            </label>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Stop Condition (optional)
            <input v-model="form.stop_condition" type="text" class="hm-input"
                   placeholder="e.g. when disk is below 50%" />
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Channel ID
            <input v-model="form.channel_id" type="text" class="hm-input"
                   placeholder="Discord channel ID" />
            </label>
          </div>
        </div>

        <div v-if="createError" class="mb-3 text-red-400 text-sm">{{ createError }}</div>

        <button @click="doCreate" class="btn btn-primary text-xs" :disabled="creating">
          {{ creating ? 'Starting...' : 'Start Loop' }}
        </button>
      </div>

      <!-- Loop list -->
      <div v-if="loading && loops.length === 0" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchLoops()" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="loops.length === 0 && !showCreate" class="hm-card empty-state">
        <span class="empty-state-icon"><odin-icon name="rotate" :size="23" /></span>
        <span class="empty-state-text">No active loops</span>
        <span class="empty-state-hint">Click "Start Loop" to create an autonomous recurring task</span>
      </div>
      <div v-else-if="loops.length > 0">
        <!-- Summary -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div class="hm-card text-center">
            <div class="text-2xl font-bold">{{ loops.length }}</div>
            <div class="text-gray-400 text-xs">Total Loops</div>
          </div>
          <div class="hm-card text-center">
            <div class="text-2xl font-bold text-green-400">{{ runningCount }}</div>
            <div class="text-gray-400 text-xs">Running</div>
          </div>
          <div class="hm-card text-center">
            <div class="text-2xl font-bold">{{ totalIterations }}</div>
            <div class="text-gray-400 text-xs">Total Iterations</div>
          </div>
        </div>

        <!-- Loop cards -->
        <div class="space-y-3">
          <div v-for="loop in loops" :key="loop.id" class="hm-card loop-card">
            <div class="loop-card-main" role="button" tabindex="0"
                 :aria-label="'Open details for loop ' + loop.id"
                 @click="openDetail(loop)"
                 @keydown.enter.prevent="openDetail(loop)"
                 @keydown.space.prevent="openDetail(loop)">
            <div class="flex items-start justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="loop-status-dot" :class="statusDotClass(loop.status)"></span>
                <span class="badge" :class="statusBadge(loop.status)">{{ loop.status || 'running' }}</span>
                <span class="badge" :class="modeBadge(loop.mode)">{{ loop.mode }}</span>
                <span class="font-mono text-xs text-gray-500">{{ loop.id }}</span>
              </div>
            </div>

            <div class="loop-card-goal">{{ loop.goal }}</div>

            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-400">
              <div>
                <span class="text-gray-500">Interval:</span>
                {{ formatDuration(loop.interval_seconds) }}
              </div>
              <div>
                <span class="text-gray-500">Iterations:</span>
                {{ loop.iteration_count }} / {{ loop.max_iterations }}
                <div class="mt-1 w-full bg-gray-800 rounded-full h-1">
                  <div class="bg-indigo-500 h-1 rounded-full transition-all duration-300"
                       :style="{ width: Math.min(100, (loop.iteration_count / loop.max_iterations) * 100) + '%' }"></div>
                </div>
              </div>
              <div>
                <span class="text-gray-500">Last trigger:</span>
                {{ loop.last_trigger_age_seconds == null ? 'pending' : formatDuration(loop.last_trigger_age_seconds) + ' ago' }}
              </div>
              <div>
                <span class="text-gray-500">Created:</span>
                {{ formatAge(loop.created_at) }}
              </div>
            </div>

            <div v-if="loop.stop_condition" class="mt-2 text-xs text-gray-500">
              <span class="text-gray-600">Stop when:</span> {{ loop.stop_condition }}
            </div>

            <div v-if="loop.requester_name" class="mt-1 text-xs text-gray-600">
              Started by {{ loop.requester_name }}
            </div>

            <div v-if="loop.iteration_history && loop.iteration_history.length" class="loop-card-preview">
              <span class="ag-result-label">Latest context preview</span>
              <span>{{ loop.iteration_history[loop.iteration_history.length - 1] }}</span>
            </div>
            </div><!-- /loop-card-main -->
            <div class="loop-card-actions">
              <button @click="doRestart(loop.id)" class="btn btn-ghost text-xs"
                      :disabled="restartingId === loop.id"
                      title="Restart loop with same config">
                {{ restartingId === loop.id ? 'Restarting...' : 'Restart' }}
              </button>
              <button v-if="loop.status === 'running'"
                      @click="doStop(loop.id)" class="btn btn-danger text-xs"
                      :disabled="stoppingId === loop.id">
                {{ stoppingId === loop.id ? 'Stopping...' : 'Stop' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Durable loop detail. The manager deque is prompt context only;
           iteration records below come from trajectory JSONL. -->
      <div v-if="detailId" class="modal-overlay" v-modal-focus @click.self="closeDetail"
           @keyup.escape="closeDetail" tabindex="-1" role="dialog" aria-modal="true"
           aria-labelledby="loop-detail-title">
        <div class="modal-content ag-detail-modal loop-detail-modal">
          <div class="ag-detail-header">
            <div class="ag-detail-title-row">
              <span v-if="detail" class="loop-status-dot" :class="statusDotClass(detail.status)"></span>
              <h2 id="loop-detail-title" class="ag-detail-title">Loop {{ detailId }}</h2>
              <span v-if="detail" class="badge" :class="statusBadge(detail.status)">{{ detail.status }}</span>
              <span v-if="detail" class="badge" :class="modeBadge(detail.mode)">{{ detail.mode }}</span>
            </div>
            <button @click="closeDetail" class="btn btn-ghost text-xs" aria-label="Close loop details">Close</button>
          </div>

          <div v-if="detailLoading && !detail" class="skeleton skeleton-row"></div>
          <div v-else-if="detailError" class="error-state" role="alert">
            <p class="text-red-400">{{ detailError }}</p>
          </div>
          <template v-else-if="detail">
            <div class="ag-detail-meta">
              <div class="ag-detail-meta-item"><span class="ag-detail-meta-label">Iterations</span><span class="ag-detail-meta-value">{{ detail.iteration_count }} / {{ detail.max_iterations }}</span></div>
              <div class="ag-detail-meta-item"><span class="ag-detail-meta-label">Interval</span><span class="ag-detail-meta-value">{{ formatDuration(detail.interval_seconds) }}</span></div>
              <div class="ag-detail-meta-item"><span class="ag-detail-meta-label">Channel</span><span class="ag-detail-meta-value">{{ detail.channel_id || '—' }}</span></div>
              <div class="ag-detail-meta-item"><span class="ag-detail-meta-label">Requested by</span><span class="ag-detail-meta-value">{{ detail.requester_name || '—' }}</span></div>
              <div class="ag-detail-meta-item"><span class="ag-detail-meta-label">Started</span><span class="ag-detail-meta-value">{{ formatTs(detail.created_at) }}</span></div>
              <div class="ag-detail-meta-item"><span class="ag-detail-meta-label">Last trigger</span><span class="ag-detail-meta-value">{{ detail.last_trigger_age_seconds == null ? 'pending' : formatDuration(detail.last_trigger_age_seconds) + ' ago' }}</span></div>
            </div>

            <div class="ag-detail-section">
              <div class="ag-detail-section-head">
                <span class="ag-result-label">Goal</span>
                <button @click="copyText('goal', detail.goal)" class="btn btn-ghost text-xs">{{ copied === 'goal' ? 'Copied' : 'Copy' }}</button>
              </div>
              <pre class="ag-detail-text loop-detail-goal">{{ detail.goal }}</pre>
            </div>

            <div v-if="detail.stop_condition" class="ag-detail-section">
              <div class="ag-detail-section-head">
                <span class="ag-result-label">Stop condition</span>
                <button @click="copyText('stop', detail.stop_condition)" class="btn btn-ghost text-xs">{{ copied === 'stop' ? 'Copied' : 'Copy' }}</button>
              </div>
              <pre class="ag-detail-text loop-detail-condition">{{ detail.stop_condition }}</pre>
            </div>

            <div class="loop-detail-history-head">
              <div>
                <h3>Iteration history</h3>
                <p v-if="detail.history_available" class="ag-detail-source">Durable trajectory records, newest first.</p>
                <p v-else class="ag-detail-source">Trajectory history is unavailable. Showing only the manager's bounded context previews.</p>
              </div>
              <span class="ag-card-id">{{ detail.iterations.length }} record{{ detail.iterations.length === 1 ? '' : 's' }}</span>
            </div>

            <div v-if="detail.history_truncated" class="loop-detail-notice">Showing the newest {{ detail.history_limit }} records.</div>
            <div v-if="detail.iterations.length" class="loop-detail-iterations">
              <article v-for="turn in detail.iterations" :key="turn.message_id || turn.timestamp" class="loop-detail-iteration">
                <header class="loop-detail-iteration-head">
                  <div>
                    <strong>Iteration {{ turn.loop_iteration || '?' }}</strong>
                    <span class="ag-detail-source">{{ formatTs(turn.timestamp) }}</span>
                  </div>
                  <span v-if="turn.is_error" class="badge badge-danger">error</span>
                </header>
                <div class="loop-detail-turn-meta">
                  <span>{{ turn.tools_used?.length || 0 }} tools</span>
                  <span>{{ formatTokens((turn.total_input_tokens || 0) + (turn.total_output_tokens || 0)) }} tokens</span>
                  <span v-if="turn.total_duration_ms > 0">{{ formatDuration(turn.total_duration_ms / 1000) }}</span>
                  <span><template v-if="turn.provider">{{ turn.provider }} / </template>{{ turn.model || 'unknown model' }}<template v-if="turn.reasoning_effort"> / {{ turn.reasoning_effort }}</template></span>
                </div>
                <div class="ag-detail-section-head">
                  <span class="ag-result-label">Response</span>
                  <button @click="copyText('turn-' + turn.loop_iteration, turn.final_response)" class="btn btn-ghost text-xs">{{ copied === 'turn-' + turn.loop_iteration ? 'Copied' : 'Copy' }}</button>
                </div>
                <pre class="ag-detail-text loop-detail-response" :class="{ 'text-red-400': turn.is_error }">{{ turn.final_response || '(no output)' }}</pre>
                <div v-if="turn.tools_used?.length" class="loop-detail-tools" aria-label="Tools used">
                  <span v-for="tool in turn.tools_used" :key="tool" class="ag-tool-chip">{{ tool }}</span>
                </div>
              </article>
            </div>
            <p v-else class="ag-detail-pending">No durable iteration record yet.</p>

            <details v-if="detail.context_history.length" class="loop-context-details">
              <summary>Runtime context buffer ({{ detail.context_history.length }})</summary>
              <p class="ag-detail-source">Bounded, write-truncated previews used to prompt the next iteration. This may include orchestration failures that produced no trajectory record; it is not an audit log.</p>
              <div class="loop-context-list">
                <pre v-for="(entry, i) in detail.context_history" :key="i" class="ag-detail-text loop-context-entry">{{ entry }}</pre>
              </div>
            </details>
          </template>
        </div>
      </div>
    </div>`,

  setup() {
    const loops = ref([]);
    const loading = ref(true);
    const error = ref(null);

    // Create form
    const showCreate = ref(false);
    const form = ref({
      goal: '',
      interval_seconds: 60,
      mode: 'notify',
      max_iterations: 50,
      stop_condition: '',
      channel_id: '',
    });
    const creating = ref(false);
    const createError = ref(null);

    // Stop
    const stoppingId = ref(null);

    // Restart
    const restartingId = ref(null);

    // Durable detail modal. The manager's inline history was a six-entry,
    // write-truncated context buffer; the modal reads attributed trajectories.
    const detail = ref(null);
    const detailId = ref(null);
    const detailLoading = ref(false);
    const detailError = ref(null);
    const copied = ref('');
    let pageActive = false;

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
    const detailController = createDetailController({
      state: detailState,
      detailLabel: 'Loop detail',
      requestDetail: (loopId, { signal }) => api.get(
        `/api/loops/${encodeURIComponent(loopId)}?limit=100`,
        { signal },
      ),
    });

    async function openDetail(loop) {
      copied.value = '';
      await detailController.open(loop.id);
    }

    function closeDetail() {
      detailController.close();
      copied.value = '';
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

    const totalIterations = computed(() =>
      loops.value.reduce((sum, l) => sum + (l.iteration_count || 0), 0)
    );

    const runningCount = computed(() =>
      loops.value.filter(l => l.status === 'running').length
    );

    function statusDotClass(status) {
      if (status === 'running') return 'loop-status-running';
      if (status === 'error') return 'loop-status-error';
      return 'loop-status-stopped';
    }

    function statusBadge(status) {
      if (status === 'running') return 'badge-success';
      if (status === 'error') return 'badge-danger';
      if (status === 'completed') return 'badge-info';
      return 'badge-warning';
    }

    function modeBadge(mode) {
      if (mode === 'act') return 'badge-warning';
      if (mode === 'silent') return 'badge-info';
      return 'badge-success';
    }

    async function fetchLoops(silent = false) {
      silent = silent === true;
      if (!silent) loading.value = true;
      try {
        const data = await api.get('/api/loops');
        loops.value = Array.isArray(data) ? data : [];
        error.value = null;
      } catch (e) {
        if (!silent) error.value = e.message;
      }
      if (!silent) loading.value = false;
    }

    async function doCreate() {
      createError.value = null;
      const f = form.value;
      if (!f.goal.trim()) { createError.value = 'Goal is required'; return; }
      if (!f.channel_id.trim()) { createError.value = 'Channel ID is required'; return; }

      const payload = {
        goal: f.goal.trim(),
        channel_id: f.channel_id.trim(),
        interval_seconds: f.interval_seconds || 60,
        mode: f.mode,
        max_iterations: f.max_iterations || 50,
      };
      if (f.stop_condition.trim()) payload.stop_condition = f.stop_condition.trim();

      creating.value = true;
      try {
        const result = await api.post('/api/loops', payload);
        toast.success(`Loop started: ${result.loop_id}`);
        form.value = {
          goal: '', interval_seconds: 60, mode: 'notify',
          max_iterations: 50, stop_condition: '', channel_id: '',
        };
        showCreate.value = false;
        await fetchLoops();
      } catch (e) {
        createError.value = e.message;
      }
      creating.value = false;
    }

    async function doStop(loopId) {
      const ok = await confirmDialog({
        title: 'Stop loop',
        message: `Stop loop ${loopId}? The current iteration will finish before stopping.`,
        confirmLabel: 'Stop Loop',
        danger: true,
      });
      if (!ok) return;
      stoppingId.value = loopId;
      try {
        await api.del(`/api/loops/${encodeURIComponent(loopId)}`);
        toast.success('Loop stopped');
        await fetchLoops();
      } catch (e) {
        toast.error(e.message || 'Failed to stop loop');
      }
      stoppingId.value = null;
    }

    async function doRestart(loopId) {
      restartingId.value = loopId;
      try {
        await api.post(`/api/loops/${encodeURIComponent(loopId)}/restart`);
        toast.success('Loop restarted');
        await fetchLoops();
      } catch (e) {
        toast.error(e.message || 'Failed to restart loop');
      }
      restartingId.value = null;
    }

    // WebSocket: refresh on loop events
    function onEvent(data) {
      if (pageActive && data.payload && (data.payload.loop_id || data.payload.type === 'loop')) {
        fetchLoops(true);
        if (detailId.value) detailController.refresh();
      }
    }

    // Keep-alive pages remain mounted while hidden. Poll only while active,
    // and let the shared detail controller coalesce slow modal refreshes.
    let refreshInterval = null;
    function stopPolling() {
      if (refreshInterval !== null) clearInterval(refreshInterval);
      refreshInterval = null;
    }
    function startPolling() {
      stopPolling();
      if (!pageActive) return;
      refreshInterval = setInterval(() => {
        fetchLoops(true);
        if (detailId.value) detailController.refresh();
      }, 5000);
    }

    onMounted(() => {
      pageActive = true;
      fetchLoops();
      ws.subscribe('events', onEvent);
      startPolling();
    });
    onActivated(() => {
      pageActive = true;
      fetchLoops(true);
      startPolling();
    });
    onDeactivated(() => {
      pageActive = false;
      stopPolling();
    });
    onUnmounted(() => {
      pageActive = false;
      ws.unsubscribe('events', onEvent);
      stopPolling();
      detailController.close();
    });

    return {
      loops, loading, error,
      showCreate, form, creating, createError,
      stoppingId, restartingId,
      detail, detailId, detailLoading, detailError, copied,
      totalIterations, runningCount,
      statusDotClass, statusBadge, modeBadge,
      formatDuration, formatTs, formatTokens,
      openDetail, closeDetail, copyText,
      fetchLoops, doCreate, doStop, doRestart,
    };
  },
};
