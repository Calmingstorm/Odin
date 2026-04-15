/**
 * Odin Management UI — Logs Page (Redesigned)
 * Live log tail with timeline visualization, filter presets, time range filtering
 * + server-side search/history mode (Round 5)
 */
import { api, ws } from '../api.js';

const { ref, computed, onMounted, onUnmounted, nextTick, watch } = Vue;

const LOG_LEVELS = ['INFO', 'WARNING', 'ERROR'];

const LOG_PRESETS = [
  { id: 'all', name: 'All Logs', icon: '\u2630', filters: {} },
  { id: 'errors', name: 'Errors Only', icon: '\u274C', filters: { level: 'ERROR' } },
  { id: 'warnings', name: 'Warnings+', icon: '\u26A0', filters: { levels: ['WARNING', 'ERROR'] } },
  { id: 'tools', name: 'Tool Activity', icon: '\uD83D\uDD27', filters: { hasToolName: true } },
  { id: 'recent-errors', name: 'Recent Errors', icon: '\uD83D\uDD25', filters: { level: 'ERROR', timeRange: 'last_1h' } },
];

const TIME_RANGES = [
  { value: '', label: 'All Time' },
  { value: 'last_5m', label: 'Last 5 min', seconds: 300 },
  { value: 'last_15m', label: 'Last 15 min', seconds: 900 },
  { value: 'last_1h', label: 'Last 1 hour', seconds: 3600 },
  { value: 'last_4h', label: 'Last 4 hours', seconds: 14400 },
  { value: 'last_24h', label: 'Last 24 hours', seconds: 86400 },
];

const SEARCH_LIMITS = [50, 100, 200, 500];

export default {
  template: `
    <div class="p-6 page-fade-in flex flex-col" style="height: calc(100vh - 56px);">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 class="text-xl font-semibold">Logs</h1>
          <p class="text-xs text-gray-500 mt-0.5" v-if="mode === 'live' && logs.length > 0">
            {{ filteredLogs.length.toLocaleString() }} / {{ logs.length.toLocaleString() }} entries
          </p>
          <p class="text-xs text-gray-500 mt-0.5" v-if="mode === 'search' && searchResults.length > 0">
            {{ searchResults.length.toLocaleString() }} results
          </p>
        </div>
        <div class="flex gap-2 items-center">
          <!-- Mode toggle -->
          <div class="flex rounded overflow-hidden border border-gray-700">
            <button @click="mode = 'live'" class="px-3 py-1 text-xs"
                    :class="mode === 'live' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'">
              Live Tail
            </button>
            <button @click="switchToSearch" class="px-3 py-1 text-xs"
                    :class="mode === 'search' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'">
              Search History
            </button>
          </div>
          <template v-if="mode === 'live'">
            <button @click="togglePause" class="btn text-xs" :class="paused ? 'btn-primary' : 'btn-ghost'">
              {{ paused ? 'Resume' : 'Pause' }}
            </button>
            <button @click="clearLogs" class="btn btn-ghost text-xs">Clear</button>
          </template>
          <button @click="exportLogs" class="btn btn-ghost text-xs">Export</button>
        </div>
      </div>

      <!-- ===== LIVE MODE ===== -->
      <template v-if="mode === 'live'">
        <!-- Filter presets bar -->
        <div class="logs-filter-bar mb-2">
          <div class="flex gap-1.5 flex-wrap items-center">
            <button v-for="preset in logPresets" :key="preset.id"
                    @click="applyLogPreset(preset)"
                    class="sess-preset-chip"
                    :class="{ 'sess-preset-active': activeLogPreset === preset.id }">
              <span class="sess-preset-icon">{{ preset.icon }}</span>
              <span>{{ preset.name }}</span>
            </button>
          </div>
        </div>

        <!-- Filters row -->
        <div class="flex gap-2 mb-2 flex-wrap items-center">
          <!-- Level chips -->
          <div class="flex gap-1">
            <button v-for="lvl in levels" :key="lvl"
                    @click="toggleLevel(lvl)"
                    class="log-chip"
                    :class="[levelChipClass(lvl), { 'log-chip-active': levelFilter === lvl }]">
              {{ lvl }}
            </button>
            <button v-if="levelFilter" @click="levelFilter = ''" class="log-chip log-chip-clear">ALL</button>
          </div>

          <!-- Time range -->
          <select v-model="timeRange" class="hm-select text-xs">
            <option v-for="tr in timeRanges" :key="tr.value" :value="tr.value">{{ tr.label }}</option>
          </select>

          <div class="flex-1" style="min-width:0;">
            <div class="flex gap-1.5 items-center">
              <input v-model="textFilter" type="text" class="hm-input flex-1"
                     :placeholder="useRegex ? 'Regex pattern...' : 'Filter logs...'"
                     :class="{ 'border-red-700': regexError }"
                     style="min-width:120px;" />
              <button @click="useRegex = !useRegex" class="btn text-xs"
                      :class="useRegex ? 'btn-primary' : 'btn-ghost'"
                      title="Toggle regex filtering">.*</button>
            </div>
            <div v-if="regexError" class="text-red-400 text-xs mt-0.5">{{ regexError }}</div>
          </div>

          <label class="flex items-center gap-1.5 text-xs text-gray-400 select-none cursor-pointer flex-shrink-0">
            <input type="checkbox" v-model="autoScroll" class="rounded" />
            Auto-scroll
          </label>
        </div>

        <!-- Custom preset save bar -->
        <div class="flex gap-2 items-center mb-2 flex-wrap">
          <button v-if="hasActiveLogFilters" @click="showSaveLogPreset = !showSaveLogPreset"
                  class="btn btn-ghost text-xs">Save as preset</button>
          <template v-if="showSaveLogPreset">
            <input v-model="newLogPresetName" type="text" class="hm-input text-xs"
                   placeholder="Preset name..." style="max-width: 180px;" />
            <button @click="saveLogCustomPreset" class="btn btn-primary text-xs"
                    :disabled="!newLogPresetName.trim()">Save</button>
          </template>
          <!-- Custom presets -->
          <button v-for="cp in customLogPresets" :key="cp.id"
                  @click="applyCustomLogPreset(cp)"
                  class="sess-preset-chip sess-preset-custom"
                  :class="{ 'sess-preset-active': activeLogPreset === cp.id }">
            <span>\u2605</span>
            <span>{{ cp.name }}</span>
            <span class="sess-preset-remove" @click.stop="removeLogCustomPreset(cp.id)">&times;</span>
          </button>
        </div>

        <!-- Timeline visualization -->
        <div v-if="logs.length > 0" class="logs-timeline mb-2">
          <div class="logs-timeline-header">
            <span class="text-xs text-gray-500">Activity Timeline</span>
            <span class="text-xs text-gray-600">{{ timelineSpanLabel }}</span>
          </div>
          <div class="logs-timeline-chart">
            <div v-for="(bucket, bi) in timelineBuckets" :key="bi"
                 class="logs-timeline-bar-wrap"
                 :title="bucket.label + ': ' + bucket.total + ' entries'"
                 @click="jumpToTimelineBucket(bucket)">
              <div class="logs-timeline-bar">
                <div v-if="bucket.errors > 0" class="logs-timeline-segment logs-tl-error"
                     :style="{ height: segmentHeight(bucket.errors, timelineMax) }"></div>
                <div v-if="bucket.warnings > 0" class="logs-timeline-segment logs-tl-warning"
                     :style="{ height: segmentHeight(bucket.warnings, timelineMax) }"></div>
                <div v-if="bucket.info > 0" class="logs-timeline-segment logs-tl-info"
                     :style="{ height: segmentHeight(bucket.info, timelineMax) }"></div>
              </div>
              <span class="logs-timeline-label" v-if="bi % timelineLabelSkip === 0">{{ bucket.shortLabel }}</span>
            </div>
          </div>
        </div>

        <!-- Status bar -->
        <div class="flex items-center gap-3 mb-2 text-xs text-gray-500 flex-wrap">
          <div class="flex items-center gap-1.5">
            <span class="ws-indicator" :class="'ws-' + wsState"></span>
            {{ wsStateLabel }}
          </div>
          <span class="font-mono">{{ filteredLogs.length.toLocaleString() }} / {{ logs.length.toLocaleString() }} lines</span>
          <span v-if="paused" class="badge badge-warning">Paused ({{ pauseBuffer.length }} buffered)</span>
          <span v-if="timeRange" class="badge badge-info">{{ timeRangeLabel }}</span>
          <span v-if="copiedIndex !== null" class="text-green-400">Copied!</span>
        </div>

        <!-- Log output -->
        <div class="relative flex-1" style="min-height:200px;">
          <div ref="logContainer" @scroll="onScroll"
               class="absolute inset-0 overflow-y-auto bg-gray-950 border border-gray-800 rounded p-3 font-mono text-xs">
            <div v-if="filteredLogs.length === 0" class="empty-state" style="padding:2rem 0;">
              <span class="empty-state-icon">{{ logs.length === 0 ? '\uD83D\uDCC4' : '\uD83D\uDD0D' }}</span>
              <span class="empty-state-text">{{ logs.length === 0 ? 'Waiting for log entries...' : 'No entries match the current filter' }}</span>
            </div>
            <div v-for="(entry, i) in filteredLogs" :key="i"
                 class="log-line py-0.5 leading-relaxed whitespace-pre-wrap break-all"
                 :class="logLineClass(entry)">
              <span class="log-ts text-gray-600 cursor-pointer hover:text-gray-400"
                    @click="copyLine(entry, i)"
                    title="Click to copy line">{{ entry.ts || '' }}</span>
              <span class="log-level mx-1" :class="levelClass(entry.level)">{{ entry.level || 'INFO' }}</span>
              <span v-if="entry.tool" class="logs-tool-badge">{{ entry.tool }}</span>
              <span>{{ entry.text || entry.raw || '' }}</span>
            </div>
          </div>

          <!-- Jump to bottom -->
          <button v-if="showJumpBottom" @click="jumpToBottom"
                  class="log-jump-btn">
            &#x2193; Jump to bottom
          </button>
        </div>
      </template>

      <!-- ===== SEARCH HISTORY MODE ===== -->
      <template v-if="mode === 'search'">
        <!-- Stats bar -->
        <div v-if="searchStats" class="flex gap-4 mb-3 flex-wrap">
          <div class="bg-gray-800 rounded px-3 py-2 text-center min-w-[100px]">
            <div class="text-lg font-semibold">{{ (searchStats.total || 0).toLocaleString() }}</div>
            <div class="text-xs text-gray-500">Total entries</div>
          </div>
          <div class="bg-gray-800 rounded px-3 py-2 text-center min-w-[100px]">
            <div class="text-lg font-semibold text-red-400">{{ (searchStats.errors || 0).toLocaleString() }}</div>
            <div class="text-xs text-gray-500">Errors</div>
          </div>
          <div class="bg-gray-800 rounded px-3 py-2 text-center min-w-[100px]">
            <div class="text-lg font-semibold text-blue-400">{{ (searchStats.tool_count || 0).toLocaleString() }}</div>
            <div class="text-xs text-gray-500">Unique tools</div>
          </div>
          <div class="bg-gray-800 rounded px-3 py-2 text-center min-w-[100px]">
            <div class="text-lg font-semibold text-purple-400">{{ (searchStats.web_actions || 0).toLocaleString() }}</div>
            <div class="text-xs text-gray-500">Web actions</div>
          </div>
        </div>

        <!-- Search filters -->
        <div class="bg-gray-800 rounded p-3 mb-3">
          <div class="flex gap-3 flex-wrap items-end">
            <!-- Level -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">Level</label>
              <select v-model="searchLevel" class="hm-select text-xs" style="min-width:100px;">
                <option value="all">All</option>
                <option value="error">Errors only</option>
                <option value="info">Info only</option>
              </select>
            </div>

            <!-- Tool name -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">Tool</label>
              <select v-model="searchTool" class="hm-select text-xs" style="min-width:140px;">
                <option value="">Any tool</option>
                <option v-for="t in (searchStats ? searchStats.tools || [] : [])" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>

            <!-- Time range quick select -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">Time range</label>
              <select v-model="searchTimePreset" @change="applySearchTimePreset" class="hm-select text-xs" style="min-width:130px;">
                <option value="">Custom / All</option>
                <option value="last_5m">Last 5 min</option>
                <option value="last_15m">Last 15 min</option>
                <option value="last_1h">Last 1 hour</option>
                <option value="last_4h">Last 4 hours</option>
                <option value="last_24h">Last 24 hours</option>
                <option value="last_7d">Last 7 days</option>
              </select>
            </div>

            <!-- Start time -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">From</label>
              <input v-model="searchStart" type="datetime-local" class="hm-input text-xs" style="min-width:170px;" />
            </div>

            <!-- End time -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">To</label>
              <input v-model="searchEnd" type="datetime-local" class="hm-input text-xs" style="min-width:170px;" />
            </div>

            <!-- Keyword -->
            <div class="flex flex-col gap-1 flex-1" style="min-width:150px;">
              <label class="text-xs text-gray-500">Keyword</label>
              <input v-model="searchKeyword" type="text" class="hm-input text-xs"
                     placeholder="Search text..."
                     @keyup.enter="runSearch" />
            </div>

            <!-- Limit -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">Limit</label>
              <select v-model.number="searchLimit" class="hm-select text-xs" style="min-width:80px;">
                <option v-for="l in searchLimits" :key="l" :value="l">{{ l }}</option>
              </select>
            </div>

            <!-- Search button -->
            <button @click="runSearch" class="btn btn-primary text-xs self-end"
                    :disabled="searching">
              {{ searching ? 'Searching...' : 'Search' }}
            </button>

            <!-- Clear filters -->
            <button @click="clearSearchFilters" class="btn btn-ghost text-xs self-end">Clear</button>
          </div>
        </div>

        <!-- Search error -->
        <div v-if="searchError" class="bg-red-900/30 border border-red-800 rounded p-3 mb-3 text-sm text-red-300">
          {{ searchError }}
        </div>

        <!-- Search results -->
        <div class="relative flex-1" style="min-height:200px;">
          <div class="absolute inset-0 overflow-y-auto bg-gray-950 border border-gray-800 rounded p-3 font-mono text-xs">
            <!-- Loading -->
            <div v-if="searching" class="empty-state" style="padding:2rem 0;">
              <span class="empty-state-icon">\u23F3</span>
              <span class="empty-state-text">Searching...</span>
            </div>

            <!-- No results -->
            <div v-else-if="searchResults.length === 0 && searchRan" class="empty-state" style="padding:2rem 0;">
              <span class="empty-state-icon">\uD83D\uDD0D</span>
              <span class="empty-state-text">No entries match the search criteria</span>
            </div>

            <!-- Prompt to search -->
            <div v-else-if="searchResults.length === 0 && !searchRan" class="empty-state" style="padding:2rem 0;">
              <span class="empty-state-icon">\uD83D\uDCCA</span>
              <span class="empty-state-text">Set filters and click Search to query log history</span>
            </div>

            <!-- Results list -->
            <template v-else>
              <div v-for="(entry, i) in searchResults" :key="i"
                   class="log-line py-0.5 leading-relaxed whitespace-pre-wrap break-all cursor-pointer"
                   :class="searchLogLineClass(entry)"
                   @click="toggleSearchExpand(i)">
                <span class="log-ts text-gray-600">{{ formatSearchTs(entry) }}</span>
                <span class="log-level mx-1" :class="entry.error ? 'text-red-500 font-semibold' : 'text-blue-500'">
                  {{ entry.error ? 'ERROR' : 'INFO' }}
                </span>
                <span v-if="entry.tool_name" class="logs-tool-badge">{{ entry.tool_name }}</span>
                <span v-if="entry.type === 'web_action'" class="logs-tool-badge" style="background:rgba(139,92,246,.18);color:#a78bfa;">
                  {{ entry.method }} {{ entry.path }}
                </span>
                <span v-if="entry.user_name" class="text-gray-500 mr-1">[{{ entry.user_name }}]</span>
                <span>{{ searchEntryText(entry) }}</span>

                <!-- Expanded detail -->
                <div v-if="expandedSearch === i" class="mt-2 ml-4 p-2 bg-gray-900 border border-gray-700 rounded text-xs"
                     @click.stop>
                  <div class="grid grid-cols-2 gap-x-4 gap-y-1 mb-2" style="max-width:500px;">
                    <span class="text-gray-500">Timestamp:</span>
                    <span>{{ entry.timestamp || 'N/A' }}</span>
                    <template v-if="entry.user_id">
                      <span class="text-gray-500">User:</span>
                      <span>{{ entry.user_name || '' }} ({{ entry.user_id }})</span>
                    </template>
                    <template v-if="entry.channel_id">
                      <span class="text-gray-500">Channel:</span>
                      <span>{{ entry.channel_id }}</span>
                    </template>
                    <template v-if="entry.execution_time_ms !== undefined">
                      <span class="text-gray-500">Duration:</span>
                      <span>{{ entry.execution_time_ms }}ms</span>
                    </template>
                  </div>
                  <div v-if="entry.tool_input" class="mb-2">
                    <div class="text-gray-500 mb-1">Input:</div>
                    <pre class="bg-gray-800 rounded p-2 overflow-x-auto" style="max-height:150px;">{{ formatJson(entry.tool_input) }}</pre>
                  </div>
                  <div v-if="entry.result_summary">
                    <div class="text-gray-500 mb-1">Result:</div>
                    <pre class="bg-gray-800 rounded p-2 overflow-x-auto whitespace-pre-wrap" style="max-height:200px;">{{ entry.result_summary }}</pre>
                  </div>
                  <div v-if="entry.error" class="mt-2">
                    <div class="text-red-400 mb-1">Error:</div>
                    <pre class="bg-red-900/20 rounded p-2 overflow-x-auto whitespace-pre-wrap" style="max-height:150px;">{{ entry.error }}</pre>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>`,

  setup() {
    // ===== SHARED =====
    const mode = ref('live');

    // ===== LIVE MODE STATE =====
    const logs = ref([]);
    const paused = ref(false);
    const autoScroll = ref(true);
    const levelFilter = ref('');
    const textFilter = ref('');
    const useRegex = ref(false);
    const subscribed = ref(false);
    const wsState = ref(ws.state || 'disconnected');
    const wsStateLabel = computed(() => {
      switch (wsState.value) {
        case 'connected': return 'Live';
        case 'connecting': return 'Connecting\u2026';
        case 'reconnecting': return 'Reconnecting\u2026';
        default: return 'Disconnected';
      }
    });
    const logContainer = ref(null);
    const showJumpBottom = ref(false);
    const copiedIndex = ref(null);
    const MAX_LOGS = 2000;
    const levels = LOG_LEVELS;
    const logPresets = LOG_PRESETS;
    const timeRanges = TIME_RANGES;

    // Filter presets state
    const activeLogPreset = ref('all');
    const timeRange = ref('');
    const customLogPresets = ref([]);
    const showSaveLogPreset = ref(false);
    const newLogPresetName = ref('');

    // Buffer entries while paused
    const pauseBuffer = ref([]);

    // Load custom presets
    function loadCustomLogPresets() {
      try {
        const saved = localStorage.getItem('odin-log-presets');
        if (saved) customLogPresets.value = JSON.parse(saved);
      } catch { /* ignore */ }
    }

    function saveCustomLogPresetsToStorage() {
      try {
        localStorage.setItem('odin-log-presets', JSON.stringify(customLogPresets.value));
      } catch { /* ignore */ }
    }

    const hasActiveLogFilters = computed(() =>
      levelFilter.value !== '' || textFilter.value.trim() !== '' || timeRange.value !== ''
    );

    const timeRangeLabel = computed(() => {
      const tr = TIME_RANGES.find(t => t.value === timeRange.value);
      return tr ? tr.label : '';
    });

    const regexError = computed(() => {
      if (!useRegex.value || !textFilter.value) return null;
      try {
        new RegExp(textFilter.value, 'i');
        return null;
      } catch (e) {
        return e.message;
      }
    });

    // Timeline: bucket logs by time intervals
    const TIMELINE_BUCKETS = 24;
    const timelineBuckets = computed(() => {
      if (logs.value.length === 0) return [];
      const buckets = [];
      const now = new Date();
      const spanMs = 3600 * 1000; // 1 hour per bucket

      for (let i = TIMELINE_BUCKETS - 1; i >= 0; i--) {
        const start = new Date(now.getTime() - (i + 1) * spanMs);
        const end = new Date(now.getTime() - i * spanMs);
        buckets.push({
          start, end,
          label: formatBucketLabel(start, end),
          shortLabel: end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          total: 0, info: 0, warnings: 0, errors: 0,
        });
      }

      for (const entry of logs.value) {
        if (!entry._time) continue;
        const t = entry._time.getTime();
        for (const b of buckets) {
          if (t >= b.start.getTime() && t < b.end.getTime()) {
            b.total++;
            if (entry.level === 'ERROR') b.errors++;
            else if (entry.level === 'WARNING') b.warnings++;
            else b.info++;
            break;
          }
        }
      }
      return buckets;
    });

    const timelineMax = computed(() => {
      let max = 1;
      for (const b of timelineBuckets.value) {
        if (b.total > max) max = b.total;
      }
      return max;
    });

    const timelineSpanLabel = computed(() => {
      if (timelineBuckets.value.length === 0) return '';
      return 'Last 24 hours';
    });

    const timelineLabelSkip = computed(() => {
      return TIMELINE_BUCKETS <= 12 ? 1 : Math.ceil(TIMELINE_BUCKETS / 8);
    });

    function formatBucketLabel(start, end) {
      const fmt = { hour: '2-digit', minute: '2-digit' };
      return start.toLocaleTimeString([], fmt) + ' - ' + end.toLocaleTimeString([], fmt);
    }

    function segmentHeight(count, max) {
      if (!max || !count) return '0px';
      const pct = Math.max(2, (count / max) * 100);
      return pct + '%';
    }

    function jumpToTimelineBucket(bucket) {
      const idx = filteredLogs.value.findIndex(e =>
        e._time && e._time.getTime() >= bucket.start.getTime() && e._time.getTime() < bucket.end.getTime()
      );
      if (idx >= 0 && logContainer.value) {
        const lines = logContainer.value.querySelectorAll('.log-line');
        if (lines[idx]) {
          lines[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
          autoScroll.value = false;
        }
      }
    }

    const filteredLogs = computed(() => {
      let result = logs.value;

      if (levelFilter.value) {
        result = result.filter(e => (e.level || 'INFO') === levelFilter.value);
      }

      if (timeRange.value) {
        const tr = TIME_RANGES.find(t => t.value === timeRange.value);
        if (tr && tr.seconds) {
          const cutoff = new Date(Date.now() - tr.seconds * 1000);
          result = result.filter(e => e._time && e._time >= cutoff);
        }
      }

      if (textFilter.value && !regexError.value) {
        if (useRegex.value) {
          try {
            const re = new RegExp(textFilter.value, 'i');
            result = result.filter(e => {
              const text = (e.text || e.raw || '');
              const tool = (e.tool || '');
              return re.test(text) || re.test(tool);
            });
          } catch { /* invalid regex, skip filtering */ }
        } else {
          const q = textFilter.value.toLowerCase();
          result = result.filter(e => {
            const text = (e.text || e.raw || '').toLowerCase();
            const tool = (e.tool || '').toLowerCase();
            return text.includes(q) || tool.includes(q);
          });
        }
      }
      return result;
    });

    function parseLogEntry(data) {
      if (data.type === 'log' && data.line) {
        try {
          const entry = typeof data.line === 'string' ? JSON.parse(data.line) : data.line;
          const time = entry.timestamp ? new Date(entry.timestamp) : new Date();
          return {
            ts: time.toLocaleTimeString(),
            _time: time,
            level: entry.error ? 'ERROR' : 'INFO',
            text: entry.tool_name
              ? `[${entry.tool_name}] ${entry.result_summary || ''}`.trim()
              : (entry.message || JSON.stringify(entry)),
            tool: entry.tool_name || '',
            raw: null,
          };
        } catch {
          return { ts: new Date().toLocaleTimeString(), _time: new Date(), level: 'INFO', text: String(data.line), tool: '', raw: String(data.line) };
        }
      }
      if (data.payload) {
        const p = data.payload;
        const time = p.timestamp ? new Date(p.timestamp) : new Date();
        return {
          ts: time.toLocaleTimeString(),
          _time: time,
          level: p.error ? 'ERROR' : 'INFO',
          text: p.tool_name
            ? `[${p.tool_name}] ${p.result_summary || ''}`.trim()
            : (p.message || JSON.stringify(p)),
          tool: p.tool_name || '',
          raw: null,
        };
      }
      if (typeof data === 'string') {
        return { ts: new Date().toLocaleTimeString(), _time: new Date(), level: 'INFO', text: data, tool: '', raw: data };
      }
      return {
        ts: new Date().toLocaleTimeString(),
        _time: new Date(),
        level: 'INFO',
        text: JSON.stringify(data),
        tool: '',
        raw: null,
      };
    }

    function onLog(data) {
      const entry = parseLogEntry(data);
      if (paused.value) {
        pauseBuffer.value.push(entry);
        return;
      }
      addEntry(entry);
    }

    function addEntry(entry) {
      logs.value.push(entry);
      if (logs.value.length > MAX_LOGS) {
        logs.value = logs.value.slice(-MAX_LOGS);
      }
      if (autoScroll.value) {
        nextTick(() => scrollToBottom());
      }
    }

    function scrollToBottom() {
      const el = logContainer.value;
      if (el) {
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        el.scrollTo({ top: el.scrollHeight, behavior: distFromBottom < 500 ? 'smooth' : 'instant' });
      }
    }

    function jumpToBottom() {
      autoScroll.value = true;
      showJumpBottom.value = false;
      nextTick(() => scrollToBottom());
    }

    function onScroll() {
      const el = logContainer.value;
      if (!el) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      showJumpBottom.value = !atBottom && logs.value.length > 0;
      if (!atBottom && autoScroll.value) {
        autoScroll.value = false;
      }
    }

    function togglePause() {
      paused.value = !paused.value;
      if (!paused.value && pauseBuffer.value.length > 0) {
        for (const entry of pauseBuffer.value) {
          addEntry(entry);
        }
        pauseBuffer.value = [];
      }
    }

    function clearLogs() {
      logs.value = [];
      pauseBuffer.value = [];
      showJumpBottom.value = false;
    }

    function exportLogs() {
      let text;
      if (mode.value === 'search') {
        text = searchResults.value.map(e => {
          const level = e.error ? 'ERROR' : 'INFO';
          const tool = e.tool_name ? `[${e.tool_name}] ` : '';
          return `${e.timestamp || ''} ${level} ${tool}${e.result_summary || e.message || ''}`;
        }).join('\n');
      } else {
        text = filteredLogs.value.map(e => `${e.ts} ${e.level} ${e.text}`).join('\n');
      }
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `odin-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }

    function copyLine(entry, index) {
      const line = `${entry.ts} ${entry.level} ${entry.text || entry.raw || ''}`;
      navigator.clipboard.writeText(line).then(() => {
        copiedIndex.value = index;
        setTimeout(() => { copiedIndex.value = null; }, 1500);
      }).catch(() => {});
    }

    function toggleLevel(lvl) {
      levelFilter.value = levelFilter.value === lvl ? '' : lvl;
      activeLogPreset.value = 'all';
    }

    function logLineClass(entry) {
      if (entry.level === 'ERROR') return 'log-line-error';
      if (entry.level === 'WARNING') return 'log-line-warning';
      return 'text-gray-300';
    }

    function levelClass(level) {
      if (level === 'ERROR') return 'text-red-500 font-semibold';
      if (level === 'WARNING') return 'text-yellow-500';
      return 'text-blue-500';
    }

    function levelChipClass(lvl) {
      if (lvl === 'ERROR') return 'log-chip-error';
      if (lvl === 'WARNING') return 'log-chip-warning';
      return 'log-chip-info';
    }

    // Preset management
    function applyLogPreset(preset) {
      activeLogPreset.value = preset.id;
      const f = preset.filters;
      levelFilter.value = f.level || '';
      timeRange.value = f.timeRange || '';
      textFilter.value = f.text || '';
      if (f.levels) levelFilter.value = f.levels[0] || '';
      if (f.hasToolName) textFilter.value = '';
    }

    function applyCustomLogPreset(cp) {
      activeLogPreset.value = cp.id;
      levelFilter.value = cp.filters.level || '';
      timeRange.value = cp.filters.timeRange || '';
      textFilter.value = cp.filters.text || '';
    }

    function saveLogCustomPreset() {
      if (!newLogPresetName.value.trim()) return;
      const preset = {
        id: 'custom-' + Date.now(),
        name: newLogPresetName.value.trim(),
        filters: {
          level: levelFilter.value,
          timeRange: timeRange.value,
          text: textFilter.value,
        },
      };
      customLogPresets.value = [...customLogPresets.value, preset];
      saveCustomLogPresetsToStorage();
      showSaveLogPreset.value = false;
      newLogPresetName.value = '';
    }

    function removeLogCustomPreset(id) {
      customLogPresets.value = customLogPresets.value.filter(p => p.id !== id);
      saveCustomLogPresetsToStorage();
      if (activeLogPreset.value === id) activeLogPreset.value = 'all';
    }

    // ===== SEARCH HISTORY MODE =====
    const searchLevel = ref('all');
    const searchTool = ref('');
    const searchKeyword = ref('');
    const searchStart = ref('');
    const searchEnd = ref('');
    const searchTimePreset = ref('');
    const searchLimit = ref(100);
    const searchLimits = SEARCH_LIMITS;
    const searching = ref(false);
    const searchRan = ref(false);
    const searchError = ref('');
    const searchResults = ref([]);
    const searchStats = ref(null);
    const expandedSearch = ref(null);

    function switchToSearch() {
      mode.value = 'search';
      if (!searchStats.value) loadSearchStats();
    }

    async function loadSearchStats() {
      try {
        searchStats.value = await api.get('/api/logs/stats');
      } catch { /* ignore */ }
    }

    function applySearchTimePreset() {
      const preset = searchTimePreset.value;
      if (!preset) {
        searchStart.value = '';
        searchEnd.value = '';
        return;
      }
      const secondsMap = {
        last_5m: 300, last_15m: 900, last_1h: 3600,
        last_4h: 14400, last_24h: 86400, last_7d: 604800,
      };
      const secs = secondsMap[preset];
      if (secs) {
        const start = new Date(Date.now() - secs * 1000);
        searchStart.value = toLocalDatetime(start);
        searchEnd.value = '';
      }
    }

    function toLocalDatetime(d) {
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function localToISO(localStr) {
      if (!localStr) return '';
      const d = new Date(localStr);
      return isNaN(d.getTime()) ? '' : d.toISOString();
    }

    async function runSearch() {
      searching.value = true;
      searchError.value = '';
      searchRan.value = true;
      expandedSearch.value = null;
      try {
        const params = new URLSearchParams();
        if (searchLevel.value && searchLevel.value !== 'all') params.set('level', searchLevel.value);
        if (searchTool.value) params.set('tool', searchTool.value);
        if (searchKeyword.value) params.set('q', searchKeyword.value);
        const startISO = localToISO(searchStart.value);
        const endISO = localToISO(searchEnd.value);
        if (startISO) params.set('start', startISO);
        if (endISO) params.set('end', endISO);
        params.set('limit', String(searchLimit.value));
        const resp = await api.get(`/api/logs/search?${params.toString()}`);
        searchResults.value = resp.entries || [];
      } catch (e) {
        searchError.value = e.message || 'Search failed';
        searchResults.value = [];
      } finally {
        searching.value = false;
      }
    }

    function clearSearchFilters() {
      searchLevel.value = 'all';
      searchTool.value = '';
      searchKeyword.value = '';
      searchStart.value = '';
      searchEnd.value = '';
      searchTimePreset.value = '';
      searchLimit.value = 100;
      searchResults.value = [];
      searchRan.value = false;
      searchError.value = '';
      expandedSearch.value = null;
    }

    function toggleSearchExpand(i) {
      expandedSearch.value = expandedSearch.value === i ? null : i;
    }

    function formatSearchTs(entry) {
      if (!entry.timestamp) return '';
      try {
        return new Date(entry.timestamp).toLocaleString();
      } catch {
        return entry.timestamp;
      }
    }

    function searchEntryText(entry) {
      if (entry.type === 'web_action') {
        return `${entry.status || ''} (${entry.execution_time_ms || 0}ms)`;
      }
      return (entry.result_summary || '').slice(0, 200);
    }

    function searchLogLineClass(entry) {
      if (entry.error) return 'log-line-error';
      return 'text-gray-300';
    }

    function formatJson(obj) {
      try {
        return JSON.stringify(obj, null, 2);
      } catch {
        return String(obj);
      }
    }

    // Track WS connection status via state callback
    let prevStateHandler = null;

    onMounted(() => {
      loadCustomLogPresets();
      ws.subscribe('logs', onLog);
      subscribed.value = ws.connected;
      wsState.value = ws.state || 'disconnected';
      prevStateHandler = ws.onStateChange;
      const origHandler = ws.onStateChange;
      ws.onStateChange = (state, detail) => {
        wsState.value = state;
        subscribed.value = state === 'connected';
        if (origHandler) origHandler(state, detail);
      };
    });

    onUnmounted(() => {
      ws.unsubscribe('logs', onLog);
      if (prevStateHandler !== undefined) {
        ws.onStateChange = prevStateHandler;
      }
    });

    return {
      mode,
      // Live mode
      logs, paused, autoScroll, levelFilter, textFilter, useRegex,
      subscribed, wsState, wsStateLabel, logContainer, filteredLogs, pauseBuffer,
      showJumpBottom, copiedIndex, regexError, levels,
      logPresets, timeRanges, timeRange,
      activeLogPreset, customLogPresets,
      showSaveLogPreset, newLogPresetName,
      hasActiveLogFilters, timeRangeLabel,
      timelineBuckets, timelineMax, timelineSpanLabel, timelineLabelSkip,
      togglePause, clearLogs, exportLogs, logLineClass, levelClass,
      levelChipClass, toggleLevel, copyLine, jumpToBottom, onScroll,
      applyLogPreset, applyCustomLogPreset,
      saveLogCustomPreset, removeLogCustomPreset,
      segmentHeight, jumpToTimelineBucket,
      // Search mode
      searchLevel, searchTool, searchKeyword, searchStart, searchEnd,
      searchTimePreset, searchLimit, searchLimits,
      searching, searchRan, searchError, searchResults, searchStats,
      expandedSearch,
      switchToSearch, runSearch, clearSearchFilters, toggleSearchExpand,
      formatSearchTs, searchEntryText, searchLogLineClass, formatJson,
      applySearchTimePreset,
    };
  },
};
