/**
 * Odin Management UI — Processes Page
 * View/kill background processes, poll output, auto-refresh
 */
import { api, ws } from '../api.js';
import { toast } from '../toast.js';
import { confirmDialog } from '../confirm.js';
import { formatDuration } from '../utils.js';
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';


export default {
  template: `
    <div class="p-6 page-fade-in">
      <div class="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 class="text-xl font-semibold">Processes</h1>
          <p class="page-lede">Inspect managed command lifecycles, output, and exit state.</p>
        </div>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <span class="toggle-switch" style="width:28px; height:16px;">
              <input type="checkbox" v-model="autoRefresh" />
              <span class="toggle-slider" style="border-radius:8px;">
                <span style="width:10px; height:10px; left:3px; bottom:3px;"></span>
              </span>
            </span>
            Auto-refresh
            <span v-if="autoRefresh" class="text-green-400">(5s)</span>
          </label>
          <button @click="fetchProcesses()" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <div v-if="loading && processes.length === 0" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchProcesses()" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="processes.length === 0" class="hm-card empty-state">
        <span class="empty-state-icon"><odin-icon name="terminal" :size="23" /></span>
        <span class="empty-state-text">No background processes</span>
        <span class="empty-state-hint">Processes appear when Odin runs long-running commands</span>
      </div>
      <div v-else>
        <!-- Summary -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div class="hm-card text-center">
            <div class="text-2xl font-bold">{{ processes.length }}</div>
            <div class="text-gray-400 text-xs">Total</div>
          </div>
          <div class="hm-card text-center">
            <div class="text-2xl font-bold" :class="runningCount > 0 ? 'text-green-400' : ''">{{ runningCount }}</div>
            <div class="text-gray-400 text-xs">Running</div>
          </div>
          <div class="hm-card text-center">
            <div class="text-2xl font-bold">{{ completedCount }}</div>
            <div class="text-gray-400 text-xs">Completed</div>
          </div>
        </div>

        <!-- Process cards -->
        <div class="space-y-3">
          <div v-for="p in processes" :key="p.pid" class="hm-card">
            <div class="flex items-start justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="loop-status-dot" :class="procStatusDot(p.status)"></span>
                <span class="font-mono text-sm font-semibold">PID {{ p.pid }}</span>
                <span class="badge" :class="statusBadge(p.status)">{{ p.status }}</span>
                <span v-if="p.exit_code !== null && p.exit_code !== undefined"
                      class="text-xs text-gray-500">(exit {{ p.exit_code }})</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-500">{{ formatDuration(p.uptime_seconds) }}</span>
                <button v-if="p.status === 'running'"
                        @click="doKill(p.pid)"
                        class="btn btn-danger text-xs"
                        :disabled="killingPid === p.pid">
                  {{ killingPid === p.pid ? 'Killing...' : 'Kill' }}
                </button>
              </div>
            </div>

            <div class="text-sm font-mono text-gray-300 mb-2" :title="p.command">
              {{ p.command }}
            </div>

            <div class="text-xs text-gray-500 mb-1">
              <span class="text-gray-600">Host:</span> {{ p.host || 'local' }}
            </div>

            <!-- Output preview (last 3 lines) -->
            <div v-if="p.output_preview && p.output_preview.length > 0" class="mt-2">
              <div class="text-xs text-gray-600 mb-1">Recent output:</div>
              <pre class="process-output-preview">{{ p.output_preview.join('\\n') }}</pre>
            </div>
          </div>
        </div>
      </div>

    </div>`,

  setup() {
    const processes = ref([]);
    const loading = ref(true);
    const error = ref(null);
    const autoRefresh = ref(true);
    let refreshTimer = null;

    // Kill
    const killingPid = ref(null);

    const runningCount = computed(() => processes.value.filter(p => p.status === 'running').length);
    const completedCount = computed(() => processes.value.filter(p => p.status !== 'running').length);

    function procStatusDot(status) {
      if (status === 'running') return 'loop-status-running';
      if (status === 'failed' || status === 'error') return 'loop-status-error';
      return 'loop-status-stopped';
    }

    function statusBadge(status) {
      if (status === 'running') return 'badge-success';
      if (status === 'completed' || status === 'exited') return 'badge-info';
      if (status === 'killed' || status === 'error' || status === 'failed') return 'badge-danger';
      return 'badge-warning';
    }

    async function fetchProcesses(silent = false) {
      silent = silent === true;
      if (!silent) loading.value = true;
      try {
        processes.value = await api.get('/api/processes');
        error.value = null;
      } catch (e) {
        if (!silent) error.value = e.message;
      }
      if (!silent) loading.value = false;
    }

    function startAutoRefresh() {
      stopAutoRefresh();
      if (autoRefresh.value) {
        refreshTimer = setInterval(() => {
          if (!loading.value) fetchProcesses(true);
        }, 5000);
      }
    }

    function stopAutoRefresh() {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    }

    // Watch autoRefresh toggle
    watch(autoRefresh, (val) => {
      if (val) startAutoRefresh();
      else stopAutoRefresh();
    });

    async function doKill(pid) {
      const ok = await confirmDialog({
        title: 'Kill process',
        message: `Kill process ${pid}?`,
        confirmLabel: 'Kill',
        danger: true,
      });
      if (!ok) return;
      killingPid.value = pid;
      try {
        await api.del(`/api/processes/${pid}`);
        toast.success(`Process ${pid} killed`);
        await fetchProcesses();
      } catch (e) {
        toast.error(e.message || 'Failed to kill process');
      }
      killingPid.value = null;
    }

    // WebSocket: refresh on process events
    function onEvent(data) {
      if (data.payload && (data.payload.pid || data.payload.type === 'process')) {
        fetchProcesses(true);
      }
    }

    function arm() {
      // Tabs live inside <keep-alive> (tabbed-page.js), so switching away
      // DEACTIVATES this component without unmounting it. Anything armed in
      // onMounted would keep running invisibly until a top-level route change.
      // Same pattern as loops.js/agents.js/logs.js.
      fetchProcesses();
      ws.subscribe('events', onEvent);
      startAutoRefresh();
    }

    function disarm() {
      ws.unsubscribe('events', onEvent);
      stopAutoRefresh();
    }

    onMounted(arm);
    onActivated(arm);
    onDeactivated(disarm);
    onUnmounted(disarm);

    return {
      processes, loading, error, autoRefresh,
      killingPid,
      runningCount, completedCount,
      procStatusDot, statusBadge, formatDuration,
      fetchProcesses, doKill,
    };
  },
};
