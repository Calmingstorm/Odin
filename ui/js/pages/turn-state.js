/**
 * Odin Management UI — Turn State (read-only recovery posture)
 *
 * Actionable recovery state leads. Historical OUTCOME_UNKNOWN evidence is a
 * bounded diagnostic, not a permanent operator task. No mutation controls.
 */
import { api, ws } from '../api.js';
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';

const POLL_MS = 10000;
const STALE_AFTER_MS = 30000;

export function elapsedMs(nowMs, receivedAtMs) {
  return Math.max(0, nowMs - receivedAtMs);
}

function turnPriority(turn, nowSeconds) {
  const states = new Set((turn.operations || []).map(op => op.state));
  if (states.has('MANUAL_RESOLUTION_REQUIRED')) return 0;
  if (turn.expired_lease || (turn.status === 'ACTIVE'
      && (!turn.lease_expires_at || turn.lease_expires_at < nowSeconds))) return 1;
  if (turn.status === 'SUSPENDED') return 2;
  if (turn.status === 'ACTIVE') return 3;
  return 4;
}

const PRIORITY_BADGES = [
  { label: 'Manual resolution required', cls: 'badge-danger' },
  { label: 'Lease expired', cls: 'badge-warning' },
  { label: 'Suspended', cls: 'badge-warning' },
  { label: 'Active', cls: 'badge-success' },
  { label: 'Terminal', cls: 'badge-info' },
];

export default {
  template: `
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h1 class="text-xl font-semibold">Turn State</h1>
        <div class="flex items-center gap-2">
          <span v-if="anyStale" class="badge badge-warning text-xs">Data stale</span>
          <button @click="refreshAll" class="btn btn-ghost text-xs"
                  :disabled="turnsLoading && breakersLoading">Refresh</button>
        </div>
      </div>
      <p class="text-xs text-gray-500 mb-4">
        Read-only current recovery posture. Historical interrupted-effect evidence
        remains available below as diagnostics, not operator work.
      </p>

      <div class="hm-card mb-4">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 class="text-sm font-semibold text-gray-300">Current posture</h2>
            <p class="text-xs text-gray-600 mt-1">Active work, suspended recovery, expired leases, and effects requiring a human.</p>
          </div>
          <span v-if="turnsStale" class="text-xs text-amber-500">stale — last success {{ turnsAgeSeconds }}s ago</span>
        </div>

        <div v-if="turnsAvailability === 'not_enabled'" class="text-xs text-gray-500">
          Turn durability is not enabled in this deployment.
        </div>
        <div v-else-if="turnsError && !turnsData" class="error-state">
          <p class="text-red-400 text-sm">{{ turnsError }}</p>
          <button @click="fetchTurns" class="btn btn-ghost text-xs">Retry</button>
        </div>
        <template v-else-if="turnsData">
          <div v-if="turnsError" class="dash-load-warning text-xs mb-2">Refresh failed: {{ turnsError }} — showing last known posture</div>
          <div class="ts-count-row mb-3">
            <div class="ts-count"><span class="ts-count-value">{{ turnsData.counts.active }}</span><span class="ts-count-label">Active</span></div>
            <div class="ts-count"><span class="ts-count-value">{{ turnsData.counts.suspended }}</span><span class="ts-count-label">Suspended</span></div>
            <div class="ts-count" :class="{ 'ts-count-alert': turnsData.counts.expired_active > 0 }">
              <span class="ts-count-value">{{ turnsData.counts.expired_active }}</span><span class="ts-count-label">Expired leases</span>
            </div>
            <div class="ts-count" :class="{ 'ts-count-alert': turnsData.counts.manual_resolution_operations > 0 }">
              <span class="ts-count-value">{{ turnsData.counts.manual_resolution_operations }}</span><span class="ts-count-label">Manual effects</span>
            </div>
            <div class="ts-count" :class="{ 'ts-count-alert': turnsData.counts.attention_required > 0 }">
              <span class="ts-count-value">{{ turnsData.counts.attention_required }}</span><span class="ts-count-label">Attention</span>
            </div>
          </div>

          <div v-if="sortedTurns.length === 0" class="text-xs text-gray-500">
            No active, suspended, or manual-resolution turns.
          </div>
          <div v-else class="space-y-2">
            <div v-if="turnsData.truncated" class="text-xs text-amber-500">
              Showing {{ sortedTurns.length }} prioritized posture rows —
              {{ turnsData.omitted_turns }} older row{{ turnsData.omitted_turns === 1 ? '' : 's' }} omitted.
              <span v-if="turnsData.omitted_attention_turns > 0" role="alert">
                {{ turnsData.omitted_attention_turns }} omitted row{{ turnsData.omitted_attention_turns === 1 ? '' : 's' }} still require attention.
              </span>
            </div>
            <div v-for="t in sortedTurns" :key="t.source + ':' + t.channel_id + ':' + t.message_id"
                 class="ts-turn-row">
              <div class="ts-turn-head">
                <span class="badge text-xs" :class="priorityBadge(t).cls">{{ priorityBadge(t).label }}</span>
                <span class="text-xs text-gray-400">{{ t.source }}</span>
                <span class="text-xs text-gray-500 font-mono">{{ t.channel_id }}</span>
                <span class="text-xs text-gray-600 font-mono">{{ t.message_id }}</span>
                <span v-if="t.has_checkpoint" class="text-xs text-gray-500">checkpointed</span>
                <span class="text-xs text-gray-600 ts-turn-age">{{ ageLabel(t.last_progress_at) }}</span>
              </div>
              <div v-if="priorityOf(t) === 0" class="ts-turn-warning" role="alert">
                A human owns verification of an unresolved external effect.
              </div>
              <div v-else-if="priorityOf(t) === 1" class="ts-turn-warning" role="alert">
                The active owner lease is missing or expired; recovery should sweep or resume this turn.
              </div>
              <div v-if="t.operations.length" class="ts-op-list">
                <span v-for="op in t.operations" :key="op.tool_call_id" class="ts-op"
                      :class="{ 'ts-op-alert': op.state === 'MANUAL_RESOLUTION_REQUIRED' }">
                  {{ op.tool_name }} · {{ op.state }}<template v-if="op.iteration !== null"> · iter {{ op.iteration }}</template>
                </span>
                <span v-if="t.more_attention_evidence" class="text-xs text-amber-500" role="alert">
                  …more manual-resolution evidence retained in the ledger
                </span>
                <span v-else-if="t.operations_truncated" class="text-xs text-gray-500">…more operation evidence</span>
              </div>
            </div>
          </div>

          <div class="ts-diagnostics mt-4">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 class="text-sm font-semibold text-gray-400">Historical diagnostics</h3>
                <p class="text-xs text-gray-600 mt-1">Retained ambiguous-effect evidence. Diagnostic only; not counted as Attention.</p>
              </div>
              <div class="flex items-center gap-3 text-xs text-gray-500">
                <span>{{ turnsData.diagnostics.outcome_unknown.operations }} unknown operation{{ turnsData.diagnostics.outcome_unknown.operations === 1 ? '' : 's' }}</span>
                <span>{{ turnsData.diagnostics.outcome_unknown.turns }} turn{{ turnsData.diagnostics.outcome_unknown.turns === 1 ? '' : 's' }}</span>
              </div>
            </div>
            <div v-if="turnsData.diagnostics.outcome_unknown.by_tool.length" class="ts-op-list mt-2">
              <span v-for="row in turnsData.diagnostics.outcome_unknown.by_tool" :key="row.tool_name" class="ts-op">
                {{ row.tool_name }} · {{ row.operations }}
              </span>
              <span v-if="turnsData.diagnostics.outcome_unknown.tools_truncated" class="text-xs text-gray-500">
                …{{ turnsData.diagnostics.outcome_unknown.omitted_tools }} more tool{{ turnsData.diagnostics.outcome_unknown.omitted_tools === 1 ? '' : 's' }}
              </span>
            </div>
            <p v-else class="text-xs text-gray-600 mt-2">No historical unknown-effect evidence.</p>
          </div>
        </template>
        <div v-else class="space-y-2">
          <div v-for="n in 2" :key="n" class="skeleton skeleton-row"></div>
        </div>
      </div>

      <div class="hm-card">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 class="text-sm font-semibold text-gray-300">Model capacity breakers</h2>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-600">process lifetime</span>
            <span v-if="breakersStale" class="text-xs text-amber-500">stale — last success {{ breakersAgeSeconds }}s ago</span>
          </div>
        </div>

        <div v-if="breakersAvailability === 'not_enabled'" class="text-xs text-gray-500">
          Breaker registry is not constructed in this deployment.
        </div>
        <div v-else-if="breakersError && !breakersData" class="error-state">
          <p class="text-red-400 text-sm">{{ breakersError }}</p>
          <button @click="fetchBreakers" class="btn btn-ghost text-xs">Retry</button>
        </div>
        <template v-else-if="breakersData">
          <div v-if="breakersError" class="dash-load-warning text-xs mb-2">Refresh failed: {{ breakersError }} — showing last known posture</div>
          <div v-if="breakersData.breakers.length === 0" class="text-xs text-gray-500">
            No breakers registered yet this process.
          </div>
          <div v-else class="table-responsive">
            <table class="hm-table">
              <thead><tr>
                <th>Provider</th><th>Model</th><th>State</th>
                <th class="text-right">Failed generations</th>
                <th class="text-right">Consecutive opens</th>
                <th class="text-right">Cooldown</th>
              </tr></thead>
              <tbody>
                <tr v-for="b in breakersData.breakers" :key="b.name">
                  <td class="text-xs">{{ b.provider }}</td>
                  <td class="text-xs font-mono">{{ b.model }}</td>
                  <td><span class="badge text-xs" :class="breakerBadge(b)">{{ b.state }}</span></td>
                  <td class="text-right text-xs">{{ b.failed_generations }}</td>
                  <td class="text-right text-xs">{{ b.consecutive_opens }}</td>
                  <td class="text-right text-xs">{{ cooldownLabel(b) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <div v-else class="space-y-2">
          <div v-for="n in 2" :key="n" class="skeleton skeleton-row"></div>
        </div>
      </div>
    </div>
  `,
  setup() {
    const turnsData = ref(null);
    const turnsAvailability = ref('');
    const turnsError = ref(null);
    const turnsLoading = ref(false);
    const turnsReceivedAt = ref(0);

    const breakersData = ref(null);
    const breakersAvailability = ref('');
    const breakersError = ref(null);
    const breakersLoading = ref(false);
    const breakersReceivedAt = ref(0);

    const nowTick = ref(Date.now());
    let tickTimer = null;
    let turnsEpoch = 0;
    let breakersEpoch = 0;

    async function fetchTurns() {
      const epoch = ++turnsEpoch;
      turnsLoading.value = true;
      try {
        const body = await api.get('/api/turn-state/turns?limit=100');
        if (epoch !== turnsEpoch) return;
        turnsAvailability.value = body.availability;
        turnsData.value = body.availability === 'available' ? body.data : null;
        turnsError.value = null;
        turnsReceivedAt.value = Date.now();
      } catch (e) {
        if (epoch !== turnsEpoch) return;
        turnsError.value = e.message || 'Turn-state read failed';
        if (e.status === 503) turnsAvailability.value = 'unavailable';
      }
      if (epoch === turnsEpoch) turnsLoading.value = false;
    }

    async function fetchBreakers() {
      const epoch = ++breakersEpoch;
      breakersLoading.value = true;
      try {
        const body = await api.get('/api/turn-state/capacity-breakers');
        if (epoch !== breakersEpoch) return;
        breakersAvailability.value = body.availability;
        breakersData.value = body.availability === 'available' ? body.data : null;
        breakersError.value = null;
        breakersReceivedAt.value = Date.now();
      } catch (e) {
        if (epoch !== breakersEpoch) return;
        breakersError.value = e.message || 'Breaker read failed';
        if (e.status === 503) breakersAvailability.value = 'unavailable';
      }
      if (epoch === breakersEpoch) breakersLoading.value = false;
    }

    function refreshAll() { fetchTurns(); fetchBreakers(); }

    const turnsStale = computed(() =>
      turnsData.value !== null && elapsedMs(nowTick.value, turnsReceivedAt.value) > STALE_AFTER_MS);
    const breakersStale = computed(() =>
      breakersData.value !== null && elapsedMs(nowTick.value, breakersReceivedAt.value) > STALE_AFTER_MS);
    const anyStale = computed(() => turnsStale.value || breakersStale.value);
    const turnsAgeSeconds = computed(() =>
      Math.round(elapsedMs(nowTick.value, turnsReceivedAt.value) / 1000));
    const breakersAgeSeconds = computed(() =>
      Math.round(elapsedMs(nowTick.value, breakersReceivedAt.value) / 1000));

    function priorityOf(turn) { return turnPriority(turn, nowTick.value / 1000); }
    function priorityBadge(turn) { return PRIORITY_BADGES[priorityOf(turn)]; }
    const sortedTurns = computed(() => {
      const rows = [...(turnsData.value?.turns || [])];
      const now = nowTick.value / 1000;
      return rows.sort((a, b) => turnPriority(a, now) - turnPriority(b, now)
        || (b.last_progress_at || 0) - (a.last_progress_at || 0));
    });

    function breakerBadge(b) {
      if (b.state === 'closed') return 'badge-success';
      if (b.state === 'probing') return 'badge-warning';
      return 'badge-danger';
    }

    function cooldownLabel(b) {
      if (b.state === 'closed') return '—';
      const elapsed = elapsedMs(nowTick.value, breakersReceivedAt.value) / 1000;
      const remaining = Math.max(0, (b.cooldown_remaining_seconds || 0) - elapsed);
      if (remaining > 0) return `${Math.ceil(remaining)}s`;
      return b.state === 'probing' ? 'probe in flight' : 'probe eligible';
    }

    function ageLabel(epochSeconds) {
      if (!epochSeconds) return '';
      const seconds = Math.max(0, Math.round(nowTick.value / 1000 - epochSeconds));
      if (seconds < 90) return `${seconds}s ago`;
      const minutes = Math.round(seconds / 60);
      if (minutes < 90) return `${minutes}m ago`;
      return `${Math.round(minutes / 60)}h ago`;
    }

    let pollTimer = null;
    let unsubReconnected = null;
    let armed = false;
    function arm() {
      if (armed) return;
      armed = true;
      refreshAll();
      pollTimer = setInterval(refreshAll, POLL_MS);
      tickTimer = setInterval(() => { nowTick.value = Date.now(); }, 1000);
      unsubReconnected = ws.onReconnected(refreshAll);
    }
    function disarm() {
      if (!armed) return;
      armed = false;
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
      if (unsubReconnected) { unsubReconnected(); unsubReconnected = null; }
    }

    onMounted(arm);
    onActivated(arm);
    onDeactivated(disarm);
    onUnmounted(disarm);

    return {
      turnsData, turnsAvailability, turnsError, turnsLoading,
      breakersData, breakersAvailability, breakersError, breakersLoading,
      turnsStale, breakersStale, anyStale, turnsAgeSeconds, breakersAgeSeconds,
      sortedTurns, priorityOf, priorityBadge, breakerBadge, cooldownLabel,
      ageLabel, fetchTurns, fetchBreakers, refreshAll, arm, disarm,
    };
  },
};
