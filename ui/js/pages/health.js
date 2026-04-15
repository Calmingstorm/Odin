/**
 * Odin Management UI — Health Dashboard Page
 * All component health at a glance: Codex, SSH hosts, DB, knowledge, voice, etc.
 */
import { api } from '../api.js';

const { ref, computed, onMounted, onUnmounted } = Vue;

const STATUS_COLORS = {
  ok: 'text-green-400',
  degraded: 'text-yellow-400',
  down: 'text-red-400',
  unconfigured: 'text-gray-500',
};

const STATUS_ICONS = {
  ok: '\u2714',
  degraded: '\u26A0',
  down: '\u2716',
  unconfigured: '\u2014',
};

const OVERALL_COLORS = {
  healthy: 'text-green-400',
  degraded: 'text-yellow-400',
  unhealthy: 'text-red-400',
};

export default {
  template: `
    <div class="p-6 page-fade-in" role="region" aria-label="Health Dashboard">
      <!-- Loading skeleton -->
      <div v-if="loading" class="space-y-4" role="status" aria-label="Loading health data">
        <div class="hm-card" style="padding:1.5rem;">
          <div class="skeleton skeleton-text" style="width:200px;"></div>
          <div class="skeleton skeleton-text" style="width:300px;"></div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div v-for="n in 8" :key="n" class="hm-card" style="padding:1rem;">
            <div class="skeleton skeleton-text" style="width:80%;"></div>
            <div class="skeleton skeleton-text" style="width:60%;"></div>
          </div>
        </div>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true">\u26A0</span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="retry" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else>
        <!-- Overall status banner -->
        <div class="hm-card mb-4" style="padding:1.25rem 1.5rem;">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;">
            <div style="display:flex;align-items:center;gap:0.75rem;">
              <span style="font-size:1.5rem;" :class="overallColor" aria-hidden="true">{{ overallIcon }}</span>
              <div>
                <div class="text-lg font-semibold" :class="overallColor">{{ overallLabel }}</div>
                <div class="text-xs text-gray-400">
                  {{ data.healthy_count }} healthy, {{ data.degraded_count }} degraded, {{ data.down_count }} down, {{ data.unconfigured_count }} unconfigured
                </div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:0.75rem;">
              <span class="text-xs text-gray-500">Updated {{ formatTime(data.checked_at) }}</span>
              <button @click="fetchHealth" class="btn btn-ghost text-xs" :disabled="refreshing">
                {{ refreshing ? '...' : '\u21BB Refresh' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Component cards grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <div v-for="c in components" :key="c.name"
               class="hm-card health-card"
               :class="'health-card-' + c.status">
            <div class="health-card-header">
              <span class="health-card-icon" :class="statusColor(c.status)">{{ statusIcon(c.status) }}</span>
              <span class="health-card-name">{{ formatName(c.name) }}</span>
              <span class="badge" :class="badgeClass(c.status)">{{ c.status }}</span>
            </div>
            <div class="health-card-detail">{{ c.detail }}</div>

            <!-- SSH hosts expanded view -->
            <div v-if="c.name === 'ssh_hosts' && c.metadata && c.metadata.hosts && c.metadata.hosts.length > 0"
                 class="health-card-meta">
              <div class="text-xs text-gray-500 mb-1">Configured hosts:</div>
              <div v-for="h in c.metadata.hosts" :key="h.alias" class="health-host-item">
                <span class="health-host-dot"
                      :class="h.pool_connected === true ? 'dot-connected' : (h.pool_connected === false ? 'dot-idle' : 'dot-unknown')"></span>
                <span class="text-xs">{{ h.alias }}</span>
                <span class="text-xs text-gray-500">{{ h.ssh_user }}@{{ h.address }}</span>
                <span class="text-xs text-gray-600">({{ h.os }})</span>
              </div>
              <div v-if="c.metadata.pool_enabled" class="text-xs text-gray-500 mt-1">
                Pool: {{ c.metadata.active_connections || 0 }} active,
                {{ c.metadata.total_reused || 0 }} reused,
                {{ c.metadata.total_opened || 0 }} opened
              </div>
            </div>

            <!-- Codex metadata -->
            <div v-if="c.name === 'codex' && c.metadata" class="health-card-meta">
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Model:</span>
                <span class="text-xs">{{ c.metadata.model || 'unknown' }}</span>
              </div>
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Circuit:</span>
                <span class="text-xs" :class="circuitColor(c.metadata.circuit_breaker)">{{ c.metadata.circuit_breaker }}</span>
              </div>
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Pool:</span>
                <span class="text-xs">{{ c.metadata.http_pool_active_connections || 0 }}/{{ c.metadata.http_pool_max_connections || 0 }} connections</span>
              </div>
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Requests:</span>
                <span class="text-xs">{{ c.metadata.http_pool_total_requests || 0 }} total</span>
              </div>
            </div>

            <!-- Knowledge metadata -->
            <div v-if="c.name === 'knowledge' && c.metadata" class="health-card-meta">
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Chunks:</span>
                <span class="text-xs">{{ c.metadata.chunks || 0 }}</span>
              </div>
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Vector search:</span>
                <span class="text-xs" :class="c.metadata.vector_search ? 'text-green-400' : 'text-yellow-400'">
                  {{ c.metadata.vector_search ? 'enabled' : 'FTS only' }}
                </span>
              </div>
            </div>

            <!-- Sessions metadata -->
            <div v-if="c.name === 'sessions' && c.metadata" class="health-card-meta">
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Active:</span>
                <span class="text-xs">{{ c.metadata.count || 0 }} session(s)</span>
              </div>
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Tokens:</span>
                <span class="text-xs">{{ formatNumber(c.metadata.total_tokens || 0) }}</span>
              </div>
              <div v-if="c.metadata.over_budget > 0" class="health-meta-row">
                <span class="text-xs text-yellow-400">{{ c.metadata.over_budget }} over budget</span>
              </div>
            </div>

            <!-- Voice metadata -->
            <div v-if="c.name === 'voice' && c.metadata" class="health-card-meta">
              <div v-if="c.metadata.channel" class="health-meta-row">
                <span class="text-xs text-gray-500">Channel:</span>
                <span class="text-xs">#{{ c.metadata.channel }}</span>
              </div>
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">WebSocket:</span>
                <span class="text-xs" :class="c.metadata.ws_connected ? 'text-green-400' : 'text-gray-500'">
                  {{ c.metadata.ws_connected ? 'connected' : 'disconnected' }}
                </span>
              </div>
            </div>

            <!-- Monitoring metadata -->
            <div v-if="c.name === 'monitoring' && c.metadata && c.metadata.enabled" class="health-card-meta">
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Checks:</span>
                <span class="text-xs">{{ c.metadata.checks || 0 }}</span>
              </div>
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Running:</span>
                <span class="text-xs">{{ c.metadata.running || 0 }}</span>
              </div>
              <div v-if="c.metadata.active_alerts > 0" class="health-meta-row">
                <span class="text-xs text-red-400">{{ c.metadata.active_alerts }} active alert(s)</span>
              </div>
            </div>

            <!-- Generic count metadata for scheduler/loops/agents -->
            <div v-if="(c.name === 'scheduler' || c.name === 'loops' || c.name === 'agents') && c.metadata" class="health-card-meta">
              <div v-for="(val, key) in c.metadata" :key="key" class="health-meta-row">
                <span class="text-xs text-gray-500">{{ key }}:</span>
                <span class="text-xs">{{ val }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`,

  setup() {
    const data = ref({});
    const loading = ref(true);
    const error = ref(null);
    const refreshing = ref(false);

    const components = computed(() => data.value.components || []);

    const overallColor = computed(() => OVERALL_COLORS[data.value.overall] || 'text-gray-400');
    const overallIcon = computed(() => {
      if (data.value.overall === 'healthy') return '\u2714';
      if (data.value.overall === 'degraded') return '\u26A0';
      if (data.value.overall === 'unhealthy') return '\u2716';
      return '\u2014';
    });
    const overallLabel = computed(() => {
      const o = data.value.overall;
      if (o === 'healthy') return 'All Systems Healthy';
      if (o === 'degraded') return 'Some Systems Degraded';
      if (o === 'unhealthy') return 'System Issues Detected';
      return 'Unknown';
    });

    function statusColor(status) { return STATUS_COLORS[status] || 'text-gray-400'; }
    function statusIcon(status) { return STATUS_ICONS[status] || '?'; }
    function badgeClass(status) {
      if (status === 'ok') return 'badge-success';
      if (status === 'degraded') return 'badge-warning';
      if (status === 'down') return 'badge-danger';
      return 'badge-info';
    }
    function circuitColor(state) {
      if (state === 'closed') return 'text-green-400';
      if (state === 'half_open') return 'text-yellow-400';
      if (state === 'open') return 'text-red-400';
      return 'text-gray-400';
    }

    function formatName(name) {
      return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    function formatTime(ts) {
      if (!ts) return '\u2014';
      try {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch { return ts; }
    }

    function formatNumber(n) {
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
      return String(n);
    }

    async function fetchHealth() {
      refreshing.value = true;
      try {
        data.value = await api.get('/api/health/components');
        error.value = null;
      } catch (e) {
        error.value = e.message;
      } finally {
        loading.value = false;
        refreshing.value = false;
      }
    }

    function retry() {
      loading.value = true;
      error.value = null;
      fetchHealth();
    }

    let interval = null;
    onMounted(async () => {
      await fetchHealth();
      interval = setInterval(fetchHealth, 30000);
    });

    onUnmounted(() => {
      if (interval) clearInterval(interval);
    });

    return {
      data, loading, error, refreshing, components,
      overallColor, overallIcon, overallLabel,
      statusColor, statusIcon, badgeClass, circuitColor,
      formatName, formatTime, formatNumber,
      fetchHealth, retry,
    };
  },
};
