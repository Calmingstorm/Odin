/**
 * Odin Management UI — Internals Page
 * Operational observability: startup diagnostics, subsystem status, connection pools,
 * risk stats, recovery stats, freshness stats, context compression, governor stats.
 */
import { api } from '../api.js';
import { formatAgeSeconds } from '../utils.js';
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';


const STATUS_COLORS = {
  ok: 'text-green-400', pass: 'text-green-400',
  degraded: 'text-yellow-400', warn: 'text-yellow-400',
  down: 'text-red-400', fail: 'text-red-400',
  unconfigured: 'text-gray-500', skipped: 'text-gray-500',
};

function statusColor(s) {
  return STATUS_COLORS[s] || STATUS_COLORS[(s || '').toLowerCase()] || 'text-gray-400';
}

export default {
  template: `
    <div class="p-6 page-fade-in" role="region" aria-label="Internals">
      <div v-if="loading" class="hm-card" style="padding:2rem;text-align:center;">
        <div class="skeleton skeleton-text" style="width:200px;margin:0 auto;"></div>
      </div>

      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="retry" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else class="space-y-4">
        <div v-if="failedCount > 0" class="hm-card border-amber-900" role="status" aria-live="polite">
          <p class="text-amber-400 text-sm">
            {{ failedCount }} of {{ endpoints.length }} internal endpoints failed to load:
            <strong>{{ failedEndpointSummary }}</strong>.
          </p>
        </div>

        <!-- Startup Diagnostics -->
        <section class="hm-card" style="padding:1.25rem;">
          <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:0.75rem;">Startup Diagnostics</h2>
          <div v-if="startup.results && startup.results.length" class="space-y-1">
            <div style="margin-bottom:0.5rem;font-size:0.8rem;color:#888;">
              {{ startup.passed_count || 0 }}/{{ startup.total_checks || 0 }} passed
              <span v-if="startup.duration_ms"> ({{ startup.duration_ms }}ms)</span>
            </div>
            <div v-for="d in startup.results" :key="d.name"
                 style="display:flex;align-items:center;gap:0.5rem;padding:0.25rem 0;">
              <span :class="d.passed ? 'text-green-400' : 'text-red-400'" style="font-size:0.9rem;width:1.5rem;text-align:center;">
                <odin-icon :name="d.passed ? 'success' : 'error'" :size="17" />
              </span>
              <span class="text-sm" style="flex:1;">{{ d.name }}</span>
              <span class="text-xs text-gray-500" style="max-width:50%;text-align:right;">{{ d.detail || '' }}</span>
            </div>
          </div>
          <p v-else class="text-sm text-gray-500">No diagnostics available</p>
        </section>

        <!-- Subsystem Status -->
        <section class="hm-card" style="padding:1.25rem;">
          <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:0.75rem;">Subsystem Guard</h2>
          <div v-if="subsystems.length" class="grid grid-cols-2 md:grid-cols-3 gap-2">
            <div v-for="s in subsystems" :key="s.name" class="hm-card" style="padding:0.75rem;">
              <div style="display:flex;align-items:center;gap:0.5rem;">
                <span :class="statusColor(s.state === 'available' ? 'ok' : s.state === 'degraded' ? 'degraded' : 'down')" style="font-size:1.1rem;">
                  <odin-icon :name="s.state === 'available' ? 'success' : s.state === 'degraded' ? 'warning' : 'error'" :size="18" />
                </span>
                <span class="text-sm font-medium">{{ s.name }}</span>
              </div>
              <div class="text-xs text-gray-500 mt-1">
                {{ s.total_successes || 0 }} ok / {{ s.total_failures || 0 }} fail
                <span v-if="s.last_failure_age_seconds != null"> &mdash; last fail: {{ formatAgeSeconds(s.last_failure_age_seconds) }}</span>
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-gray-500">No subsystems registered</p>
        </section>

        <!-- Connection Pools -->
        <section class="hm-card" style="padding:1.25rem;">
          <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:0.75rem;">Connection Pools</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="hm-card" style="padding:0.75rem;">
              <h3 class="text-sm font-medium mb-1">SSH Pool</h3>
              <div v-if="sshPool && Object.keys(sshPool).length" class="text-xs text-gray-400 space-y-1">
                <div>Active connections: {{ sshPool.active_connections || 0 }}</div>
                <div>Active hosts: {{ sshPool.active_hosts?.length ? sshPool.active_hosts.join(', ') : 'None' }}</div>
                <div>Opened: {{ sshPool.total_opened || 0 }}</div>
                <div>Reused: {{ sshPool.total_reused || 0 }}</div>
              </div>
              <p v-else class="text-xs text-gray-500">No SSH pool data</p>
            </div>
            <div class="hm-card" style="padding:0.75rem;">
              <h3 class="text-sm font-medium mb-1">HTTP Pools</h3>
              <div v-if="httpPool && Object.keys(httpPool).length" class="text-xs text-gray-400 space-y-2">
                <div v-for="(pool, provider) in httpPool" :key="provider">
                  <strong class="text-gray-300">{{ provider }}</strong>
                  <template v-if="provider === 'codex'">
                    <div>Active: {{ pool.http_pool_active_connections || 0 }} / {{ pool.http_pool_max_connections || 0 }}</div>
                    <div>Requests: {{ pool.http_pool_total_requests || 0 }}</div>
                    <div>Keepalive: {{ pool.http_pool_keepalive_timeout || 0 }}s</div>
                  </template>
                  <template v-else>
                    <div>Requests: {{ pool.total_requests || 0 }}</div>
                    <div>Model: {{ pool.model || 'Unknown' }}</div>
                  </template>
                </div>
              </div>
              <p v-else class="text-xs text-gray-500">No HTTP pool data</p>
            </div>
          </div>
        </section>

        <!-- Command Governor -->
        <section class="hm-card" style="padding:1.25rem;">
          <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:0.75rem;">Command Governor</h2>
          <div v-if="governorStats" class="space-y-2">
            <div style="display:flex;gap:2rem;font-size:0.85rem;">
              <span>Blocked: <span class="text-red-400 font-medium">{{ governorStats.blocked || 0 }}</span></span>
              <span>High-risk allowed: <span class="text-yellow-400 font-medium">{{ governorStats.allowed_high_risk || 0 }}</span></span>
            </div>
            <div v-if="governorStats.recent_blocks && governorStats.recent_blocks.length" class="mt-2">
              <div class="text-xs text-gray-500 mb-1">Recent blocks:</div>
              <div v-for="(b, i) in governorStats.recent_blocks" :key="i"
                   class="text-xs text-red-400" style="padding:0.15rem 0;">
                [{{ b.risk }}] {{ b.reason }} &mdash; <code class="text-gray-500">{{ b.command }}</code>
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-gray-500">No governor data</p>
        </section>

        <!-- Stats Row -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">

          <!-- Risk Stats -->
          <section class="hm-card" style="padding:1rem;">
            <h3 class="text-sm font-medium mb-2">Risk Classifier</h3>
            <div v-if="riskStats" class="text-xs text-gray-400 space-y-1">
              <div>Total assessed: {{ riskTotal }}</div>
              <div>Critical: <span class="text-red-400">{{ riskStats.totals?.critical || 0 }}</span></div>
              <div>High risk: <span class="text-red-400">{{ riskStats.totals?.high || 0 }}</span></div>
              <div>Medium: <span class="text-yellow-400">{{ riskStats.totals?.medium || 0 }}</span></div>
              <div>Low: <span class="text-green-400">{{ riskStats.totals?.low || 0 }}</span></div>
            </div>
            <p v-else class="text-xs text-gray-500">No risk data</p>
          </section>

          <!-- Recovery Stats -->
          <section class="hm-card" style="padding:1rem;">
            <h3 class="text-sm font-medium mb-2">Recovery</h3>
            <div v-if="recoveryStats" class="text-xs text-gray-400 space-y-1">
              <div>Attempts: {{ recoveryStats.totals?.attempts || 0 }}</div>
              <div>Recovered: <span class="text-green-400">{{ recoveryStats.totals?.successes || 0 }}</span></div>
              <div>Failed: <span class="text-red-400">{{ recoveryStats.totals?.failures || 0 }}</span></div>
            </div>
            <p v-else class="text-xs text-gray-500">Recovery disabled or no data</p>
          </section>

          <!-- Context Compression -->
          <section class="hm-card" style="padding:1rem;">
            <h3 class="text-sm font-medium mb-2">Context Compression</h3>
            <div v-if="compressionStats" class="text-xs text-gray-400 space-y-1">
              <div>Compressions: {{ compressionStats.compressions || 0 }}</div>
              <div>Iterations compressed: {{ compressionStats.iterations_compressed || 0 }}</div>
              <div>Chars saved: {{ (compressionStats.chars_saved || 0).toLocaleString() }}</div>
              <div>Prefix cache hit rate: {{ ((compressionStats.prefix_hit_rate || 0) * 100).toFixed(0) }}%</div>
            </div>
            <p v-else class="text-xs text-gray-500">No compression data</p>
          </section>

        </div>

        <!-- Freshness Stats -->
        <section class="hm-card" style="padding:1.25rem;">
          <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:0.75rem;">Branch Freshness</h2>
          <div v-if="freshnessStats" class="text-xs text-gray-400 space-y-1">
            <div>Checks: {{ freshnessStats.total_checks || 0 }}</div>
            <div>Stale detected: <span class="text-yellow-400">{{ freshnessStats.stale_found || 0 }}</span></div>
            <div>Fetch failures: <span class="text-red-400">{{ freshnessStats.fetch_failures || 0 }}</span></div>
          </div>
          <p v-else class="text-xs text-gray-500">Freshness checking disabled or no data</p>
        </section>

      </div>
    </div>
  `,

  setup() {
    const loading = ref(true);
    const startup = ref({});
    const subsystems = ref([]);
    const sshPool = ref({});
    const httpPool = ref({});
    const riskStats = ref(null);
    const recoveryStats = ref(null);
    const compressionStats = ref(null);
    const freshnessStats = ref(null);
    const governorStats = ref(null);
    const riskTotal = computed(() => Object.values(riskStats.value?.totals || {})
      .reduce((total, count) => total + Number(count || 0), 0));
    // Every endpoint failing used to render a fully-loaded page of empty
    // sections: no error, no retry, nothing to distinguish "the bot is down"
    // from "nothing to report".
    const error = ref('');
    const failedCount = ref(0);
    const failedEndpoints = ref([]);
    const failedEndpointSummary = computed(() => failedEndpoints.value
      .map(endpoint => `${endpoint.label} (${endpoint.path}${endpoint.reason ? `: ${endpoint.reason}` : ''})`)
      .join('; '));
    const endpoints = Object.freeze([
      { key: 'startup', label: 'Startup diagnostics', path: '/api/startup/diagnostics' },
      { key: 'subsystems', label: 'Subsystem status', path: '/api/subsystems/status' },
      { key: 'sshPool', label: 'SSH pool', path: '/api/pools/ssh' },
      { key: 'httpPool', label: 'HTTP pool', path: '/api/pools/http' },
      { key: 'riskStats', label: 'Risk stats', path: '/api/risk/stats' },
      { key: 'recoveryStats', label: 'Recovery stats', path: '/api/recovery/stats' },
      { key: 'compressionStats', label: 'Compression stats', path: '/api/compression/stats' },
      { key: 'freshnessStats', label: 'Freshness stats', path: '/api/freshness/stats' },
      { key: 'governorStats', label: 'Governor stats', path: '/api/governor/stats' },
    ]);
    let timer = null;

    async function fetchAll() {
      const results = await Promise.allSettled(endpoints.map(endpoint => api.get(endpoint.path)));
      const val = (i) => results[i].status === 'fulfilled' ? results[i].value : null;
      startup.value = val(0) || {};
      const sub = val(1);
      subsystems.value = Array.isArray(sub) ? sub : (sub && sub.subsystems) || [];
      sshPool.value = val(2) || {};
      httpPool.value = val(3) || {};
      riskStats.value = val(4);
      recoveryStats.value = val(5);
      compressionStats.value = val(6);
      freshnessStats.value = val(7);
      governorStats.value = val(8);
      const rejected = results.filter(r => r.status === 'rejected');
      failedEndpoints.value = results.flatMap((result, index) => result.status === 'rejected'
        ? [{ ...endpoints[index], reason: result.reason?.message || 'request failed' }]
        : []);
      failedCount.value = failedEndpoints.value.length;
      if (rejected.length === results.length) {
        const reason = rejected[0]?.reason;
        error.value = reason?.message || 'Failed to load internals';
      } else {
        error.value = '';
      }
      loading.value = false;
    }

    function retry() {
      loading.value = true;
      error.value = '';
      fetchAll();
    }

    let armed = false;

    function arm() {
      if (armed) return;
      armed = true;
      // Vue fires BOTH onMounted and onActivated on the initial keep-alive
      // mount, so arming must be idempotent — otherwise the websocket
      // handler is registered twice and unsubscribe() (which removes one
      // occurrence) leaves a live copy behind on every visit.
      // Tabs live inside <keep-alive> (tabbed-page.js), so switching away
      // DEACTIVATES this component without unmounting it. Anything armed in
      // onMounted would keep running invisibly until a top-level route change.
      // Same pattern as loops.js/agents.js/logs.js.
      fetchAll();
      if (!timer) timer = setInterval(fetchAll, 30000);
    }

    function disarm() {
      if (!armed) return;
      armed = false;
      if (timer) { clearInterval(timer); timer = null; }
    }

    onMounted(arm);
    onActivated(arm);
    onDeactivated(disarm);
    onUnmounted(disarm);

    return {
      loading, error, failedCount, failedEndpoints, failedEndpointSummary, endpoints, retry, startup, subsystems, sshPool, httpPool,
      riskStats, riskTotal, recoveryStats, compressionStats, freshnessStats,
      governorStats, statusColor, formatAgeSeconds,
    };
  },
};
