/**
 * Odin Management UI — Schedules Page
 * View/create/delete scheduled tasks with execution history and failure tracking
 */
import { api } from '../api.js';
import { toast } from '../toast.js';
import { confirmDialog } from '../confirm.js';
import { formatTs, formatAge, formatDuration } from '../utils.js';
import { computed, onMounted, ref } from 'vue';


export default {
  template: `
    <div class="p-6 page-fade-in">
      <div class="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 class="text-xl font-semibold">Schedules</h1>
          <p class="page-lede">Create, inspect, and run recurring or one-time automation.</p>
        </div>
        <div class="flex gap-2">
          <button @click="showCreate = !showCreate" class="btn btn-primary text-xs">
            {{ showCreate ? 'Cancel' : 'New Schedule' }}
          </button>
          <button @click="fetchSchedules" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Create form -->
      <div v-if="showCreate" class="hm-card form-panel mb-4">
        <h2 class="text-sm font-medium mb-3">Create Schedule</h2>

        <div class="mb-3">
          <label class="text-gray-400 text-xs block mb-1">Description</label>
          <input v-model="form.description" type="text" class="hm-input"
                 placeholder="e.g. Daily disk check" />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Action Type</label>
            <select v-model="form.action" class="hm-input">
              <option value="reminder">Reminder</option>
              <option value="check">Check (tool call)</option>
              <option value="workflow">Workflow (multi-step)</option>
              <option value="digest">Digest</option>
            </select>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Channel ID</label>
            <input v-model="form.channel_id" type="text" class="hm-input"
                   placeholder="Discord channel ID" />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Cron Expression</label>
            <div class="flex gap-2">
              <input v-model="form.cron" type="text" class="hm-input"
                     placeholder="e.g. 0 */6 * * *" @input="onCronInput" />
              <button @click="validateCron" class="btn btn-ghost text-xs whitespace-nowrap"
                      :disabled="!form.cron.trim() || validatingCron">
                {{ validatingCron ? '...' : 'Validate' }}
              </button>
            </div>
            <!-- Cron helper -->
            <div v-if="cronResult" class="mt-2 text-xs">
              <div v-if="cronResult.valid" class="text-green-400">
                Valid. Next runs:
                <div v-for="(run, i) in cronResult.next_runs" :key="i" class="text-gray-400 ml-2">
                  {{ formatTs(run) }} ({{ formatFuture(run) }})
                </div>
              </div>
              <div v-else class="text-red-400">{{ cronResult.error }}</div>
            </div>
            <!-- Quick cron presets -->
            <div class="flex flex-wrap gap-1 mt-2">
              <button v-for="p in cronPresets" :key="p.expr"
                      @click="form.cron = p.expr; onCronInput()"
                      class="cron-preset-btn">
                {{ p.label }}
              </button>
            </div>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">One-Time (ISO datetime)</label>
            <input v-model="form.run_at" type="text" class="hm-input"
                   placeholder="e.g. 2026-04-01T09:00:00" />
          </div>
        </div>

        <div v-if="form.action === 'reminder'" class="mb-3">
          <label class="text-gray-400 text-xs block mb-1">Message</label>
          <input v-model="form.message" type="text" class="hm-input"
                 placeholder="Reminder message..." />
        </div>

        <div v-if="form.action === 'check'" class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Tool Name</label>
            <input v-model="form.tool_name" type="text" class="hm-input"
                   placeholder="e.g. run_command" />
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Tool Input (JSON)</label>
            <input v-model="form.tool_input_str" type="text" class="hm-input"
                   placeholder='e.g. {"host":"server1"}' />
          </div>
        </div>

        <div v-if="createError" class="mb-3 text-red-400 text-sm">{{ createError }}</div>

        <button @click="doCreate" class="btn btn-primary text-xs" :disabled="creating">
          {{ creating ? 'Creating...' : 'Create' }}
        </button>
      </div>

      <!-- Schedule list -->
      <div v-if="loading && schedules.length === 0" class="space-y-2">
        <div v-for="n in 4" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="22" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchSchedules" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="schedules.length === 0 && !showCreate" class="hm-card empty-state">
        <span class="empty-state-icon"><odin-icon name="calendar" :size="23" /></span>
        <span class="empty-state-text">No scheduled tasks</span>
        <span class="empty-state-hint">Click "New Schedule" to set up automated checks or reminders</span>
      </div>
      <div v-else-if="schedules.length > 0">
        <!-- Summary cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div class="hm-card text-center">
            <div class="text-2xl font-bold">{{ schedules.length }}</div>
            <div class="text-gray-400 text-xs">Total</div>
          </div>
          <div class="hm-card text-center">
            <div class="text-2xl font-bold">{{ cronCount }}</div>
            <div class="text-gray-400 text-xs">Recurring</div>
          </div>
          <div class="hm-card text-center">
            <div class="text-2xl font-bold">{{ oneTimeCount }}</div>
            <div class="text-gray-400 text-xs">One-Time</div>
          </div>
          <div v-if="webhookCount > 0" class="hm-card text-center">
            <div class="text-2xl font-bold">{{ webhookCount }}</div>
            <div class="text-gray-400 text-xs">Webhook</div>
          </div>
          <div v-if="pausedCount > 0" class="hm-card text-center">
            <div class="text-2xl font-bold text-yellow-400">{{ pausedCount }}</div>
            <div class="text-gray-400 text-xs">Paused</div>
          </div>
          <div v-if="failingCount > 0" class="hm-card text-center">
            <div class="text-2xl font-bold text-red-400">{{ failingCount }}</div>
            <div class="text-gray-400 text-xs">Failing</div>
          </div>
        </div>

        <div class="table-responsive">
        <table class="hm-table">
          <thead>
            <tr>
              <th></th>
              <th>Description</th>
              <th>Type</th>
              <th class="mobile-hide">Schedule</th>
              <th class="mobile-hide">Last Run</th>
              <th class="mobile-hide">Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="s in schedules" :key="s.id">
            <tr :class="{ 'opacity-50': s.paused }">
              <td class="text-center" style="width:40px;">
                <button class="row-expander" @click="toggleExpand(s.id)" :aria-expanded="expandedId === s.id" :aria-label="(expandedId === s.id ? 'Collapse ' : 'Expand ') + s.description">
                  <odin-icon name="chevronRight" :size="15" :class="{ 'rotate-90': expandedId === s.id }" />
                </button>
              </td>
              <td class="text-sm">
                {{ s.description }}
                <span v-if="s.consecutive_failures > 0" class="ml-1 text-red-400 text-xs font-mono">
                  ({{ s.consecutive_failures }} fail{{ s.consecutive_failures > 1 ? 's' : '' }})
                </span>
              </td>
              <td>
                <span v-if="s.paused" class="badge badge-danger mr-1">paused</span>
                <span v-if="s.retry_at" class="badge badge-warning mr-1">retrying</span>
                <span v-if="s.trigger" class="badge badge-warning">webhook</span>
                <span v-else-if="s.one_time" class="badge badge-info">one-time</span>
                <span v-else class="badge badge-success">cron</span>
              </td>
              <td class="text-sm text-gray-400 font-mono mobile-hide">
                <span v-if="s.cron">{{ s.cron }}</span>
                <span v-else-if="s.run_at">{{ formatTs(s.run_at) }}</span>
                <span v-else-if="s.trigger">{{ s.trigger.source || 'webhook' }}</span>
                <span v-else>-</span>
              </td>
              <td class="text-sm mobile-hide">
                <span v-if="s.last_run" class="text-gray-300">{{ formatAge(s.last_run) }}</span>
                <span v-else class="text-gray-600">never</span>
              </td>
              <td class="text-sm mobile-hide">
                <span v-if="s.last_error" class="text-red-400" :title="s.last_error">failed</span>
                <span v-else-if="s.last_run" class="text-green-400">ok</span>
                <span v-else class="text-gray-600">-</span>
              </td>
              <td class="whitespace-nowrap">
                <div class="flex gap-1">
                  <button @click="doTogglePause(s)" class="btn btn-ghost text-xs"
                          :disabled="togglingId === s.id"
                          :title="s.paused ? 'Resume this schedule' : 'Pause this schedule'">
                    {{ togglingId === s.id ? '...' : (s.paused ? 'Resume' : 'Pause') }}
                  </button>
                  <button @click="doRunNow(s.id)" class="btn btn-ghost text-xs"
                          :disabled="runningId === s.id"
                          title="Trigger this schedule immediately">
                    {{ runningId === s.id ? '...' : 'Run' }}
                  </button>
                  <button v-if="s.consecutive_failures > 0"
                          @click="doResetFailures(s.id)" class="btn btn-ghost text-xs"
                          :disabled="resettingId === s.id"
                          title="Reset failure counters and pending retries">
                    {{ resettingId === s.id ? '...' : 'Reset' }}
                  </button>
                  <button @click="doDelete(s.id)" class="btn btn-danger text-xs"
                          :disabled="deletingId === s.id">
                    {{ deletingId === s.id ? '...' : 'Del' }}
                  </button>
                </div>
              </td>
            </tr>
            <!-- Expanded detail row -->
            <tr v-if="expandedId === s.id">
              <td :colspan="7" class="p-0">
                <div class="p-4" style="background: rgba(255,255,255,0.02);">
                  <!-- Failure detail -->
                  <div v-if="s.last_error" class="mb-3 p-2 rounded" style="background: rgba(239,68,68,0.1);">
                    <div class="text-xs text-red-400 font-medium mb-1">Last Error</div>
                    <div class="text-xs text-red-300 font-mono">{{ s.last_error }}</div>
                    <div class="text-xs text-gray-500 mt-1">
                      {{ s.last_error_at ? formatAge(s.last_error_at) : '' }}
                      <span v-if="s.retry_at"> · Next retry: {{ formatFuture(s.retry_at) }}</span>
                      <span v-if="s.retry_count > 0"> · Retry {{ s.retry_count }}/{{ s.max_retries }}</span>
                    </div>
                  </div>

                  <!-- Schedule details -->
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-xs">
                    <div><span class="text-gray-500">ID:</span> <span class="font-mono">{{ s.id }}</span></div>
                    <div><span class="text-gray-500">Action:</span> {{ s.action }}</div>
                    <div><span class="text-gray-500">Next run:</span>
                      <span v-if="s.next_run">{{ formatFuture(s.next_run) }}</span>
                      <span v-else>on trigger</span>
                    </div>
                    <div><span class="text-gray-500">Created:</span> {{ formatTs(s.created_at) }}</div>
                  </div>

                  <!-- Execution history -->
                  <div class="text-xs font-medium text-gray-400 mb-2">Execution History</div>
                  <div v-if="historyLoading" class="text-xs text-gray-500">Loading...</div>
                  <div v-else-if="history.length === 0" class="text-xs text-gray-600">No execution history yet.</div>
                  <table v-else class="hm-table text-xs">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(h, i) in history" :key="i">
                        <td>{{ formatAge(h.timestamp) }}</td>
                        <td>
                          <span v-if="h.status === 'success'" class="text-green-400">success</span>
                          <span v-else class="text-red-400">failure</span>
                        </td>
                        <td class="font-mono">{{ formatMs(h.duration_ms) }}</td>
                        <td class="text-red-300 font-mono" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">
                          {{ h.error || '-' }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
            </template>
          </tbody>
        </table>
        </div>
      </div>

    </div>`,

  setup() {
    const schedules = ref([]);
    const loading = ref(true);
    const error = ref(null);

    // Create form
    const showCreate = ref(false);
    const form = ref({
      description: '',
      action: 'reminder',
      channel_id: '',
      cron: '',
      run_at: '',
      message: '',
      tool_name: '',
      tool_input_str: '',
    });
    const creating = ref(false);
    const createError = ref(null);

    // Cron validation
    const cronResult = ref(null);
    const validatingCron = ref(false);
    const cronPresets = [
      { label: 'Every hour', expr: '0 * * * *' },
      { label: 'Every 6h', expr: '0 */6 * * *' },
      { label: 'Daily 9am', expr: '0 9 * * *' },
      { label: 'Weekly Mon', expr: '0 9 * * 1' },
      { label: 'Every 30m', expr: '*/30 * * * *' },
    ];

    // Action states
    const runningId = ref(null);
    const deletingId = ref(null);
    const togglingId = ref(null);
    const resettingId = ref(null);

    // Expanded row
    const expandedId = ref(null);
    const history = ref([]);
    const historyLoading = ref(false);

    const cronCount = computed(() => schedules.value.filter(s => s.cron && !s.one_time).length);
    const oneTimeCount = computed(() => schedules.value.filter(s => s.one_time).length);
    const webhookCount = computed(() => schedules.value.filter(s => s.trigger).length);
    const pausedCount = computed(() => schedules.value.filter(s => s.paused).length);
    const failingCount = computed(() => schedules.value.filter(s => s.consecutive_failures > 0).length);

    function formatFuture(ts) {
      if (!ts) return '-';
      const now = Date.now();
      const t = new Date(ts).getTime();
      const diff = (t - now) / 1000;
      if (diff < 0) return 'overdue';
      if (diff < 60) return 'in < 1 min';
      if (diff < 3600) return `in ${Math.floor(diff / 60)} min`;
      if (diff < 86400) {
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
      }
      const d = Math.floor(diff / 86400);
      return `in ${d} day${d !== 1 ? 's' : ''}`;
    }

    function formatMs(ms) {
      if (ms == null) return '-';
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
      return formatDuration(ms / 1000);
    }

    function onCronInput() {
      cronResult.value = null;
    }

    async function validateCron() {
      const expr = form.value.cron.trim();
      if (!expr) return;
      validatingCron.value = true;
      try {
        cronResult.value = await api.post('/api/schedules/validate-cron', { expression: expr });
      } catch (e) {
        cronResult.value = { valid: false, error: e.message };
      }
      validatingCron.value = false;
    }

    async function fetchSchedules() {
      loading.value = true;
      error.value = null;
      try {
        schedules.value = await api.get('/api/schedules');
      } catch (e) {
        error.value = e.message;
      }
      loading.value = false;
    }

    async function toggleExpand(scheduleId) {
      if (expandedId.value === scheduleId) {
        expandedId.value = null;
        history.value = [];
        return;
      }
      expandedId.value = scheduleId;
      historyLoading.value = true;
      history.value = [];
      try {
        history.value = await api.get(`/api/schedules/${encodeURIComponent(scheduleId)}/history?limit=10`);
      } catch (e) {
        history.value = [];
      }
      historyLoading.value = false;
    }

    async function doCreate() {
      createError.value = null;
      const f = form.value;
      if (!f.description.trim()) { createError.value = 'Description is required'; return; }
      if (!f.channel_id.trim()) { createError.value = 'Channel ID is required'; return; }
      if (!f.cron.trim() && !f.run_at.trim()) { createError.value = 'Cron expression or run_at time is required'; return; }

      const payload = {
        description: f.description.trim(),
        action: f.action,
        channel_id: f.channel_id.trim(),
      };
      if (f.cron.trim()) payload.cron = f.cron.trim();
      if (f.run_at.trim()) payload.run_at = f.run_at.trim();
      if (f.action === 'reminder' && f.message.trim()) payload.message = f.message.trim();
      if (f.action === 'check') {
        if (f.tool_name.trim()) payload.tool_name = f.tool_name.trim();
        if (f.tool_input_str.trim()) {
          try {
            payload.tool_input = JSON.parse(f.tool_input_str.trim());
          } catch {
            createError.value = 'Tool input must be valid JSON';
            return;
          }
        }
      }

      creating.value = true;
      try {
        await api.post('/api/schedules', payload);
        toast.success('Schedule created');
        form.value = {
          description: '', action: 'reminder', channel_id: '',
          cron: '', run_at: '', message: '', tool_name: '', tool_input_str: '',
        };
        cronResult.value = null;
        showCreate.value = false;
        await fetchSchedules();
      } catch (e) {
        createError.value = e.message;
      }
      creating.value = false;
    }

    async function doRunNow(scheduleId) {
      runningId.value = scheduleId;
      try {
        const result = await api.post(`/api/schedules/${encodeURIComponent(scheduleId)}/run`);
        if (result.status === 'failure') {
          toast.error(`Execution failed: ${result.error || 'unknown error'}`);
        } else {
          const msg = result.warning ? `Executed (${result.warning})` : 'Executed successfully';
          toast.success(msg);
        }
        await fetchSchedules();
      } catch (e) {
        toast.error(e.message || 'Failed to trigger');
      }
      runningId.value = null;
    }

    async function doTogglePause(schedule) {
      togglingId.value = schedule.id;
      const newState = !schedule.paused;
      try {
        await api.put(`/api/schedules/${encodeURIComponent(schedule.id)}`, { paused: newState });
        toast.success(newState ? 'Schedule paused' : 'Schedule resumed');
        await fetchSchedules();
      } catch (e) {
        toast.error(e.message || 'Failed to update schedule');
      }
      togglingId.value = null;
    }

    async function doResetFailures(scheduleId) {
      resettingId.value = scheduleId;
      try {
        await api.post(`/api/schedules/${encodeURIComponent(scheduleId)}/reset-failures`);
        toast.success('Failure counters reset');
        await fetchSchedules();
      } catch (e) {
        toast.error(e.message || 'Failed to reset');
      }
      resettingId.value = null;
    }

    async function doDelete(scheduleId) {
      const sched = schedules.value.find(s => s.id === scheduleId);
      const ok = await confirmDialog({
        title: 'Delete schedule',
        message: `Delete "${sched?.description || scheduleId}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      deletingId.value = scheduleId;
      try {
        await api.del(`/api/schedules/${encodeURIComponent(scheduleId)}`);
        toast.success('Schedule deleted');
        await fetchSchedules();
      } catch (e) {
        toast.error(e.message || 'Failed to delete schedule');
      }
      deletingId.value = null;
    }

    onMounted(() => { fetchSchedules(); });

    return {
      schedules, loading, error,
      showCreate, form, creating, createError,
      cronResult, validatingCron, cronPresets,
      runningId, deletingId, togglingId, resettingId,
      expandedId, history, historyLoading,
      cronCount, oneTimeCount, webhookCount, pausedCount, failingCount,
      formatTs, formatAge, formatFuture, formatMs, formatDuration,
      onCronInput, validateCron, toggleExpand,
      fetchSchedules, doCreate, doRunNow, doTogglePause, doResetFailures, doDelete,
    };
  },
};
