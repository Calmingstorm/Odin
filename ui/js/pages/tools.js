/**
 * Odin Management UI — Tools Page
 * Card layout, categorized tool grid
 */
import { api } from '../api.js';
import { truncate } from '../utils.js';
import { computed, onMounted, ref } from 'vue';


/** Category mapping for tools — groups tools by functional area */
const TOOL_CATEGORIES = [
  { id: 'system', label: 'System & Commands', icon: 'terminal', match: n => /^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(n) },
  { id: 'devops', label: 'DevOps & Infrastructure', icon: 'server', match: n => /^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(n) },
  { id: 'agents', label: 'Agents & Orchestration', icon: 'bot', match: n => /^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(n) },
  { id: 'workflow', label: 'Workflows & Tasks', icon: 'workflow', match: n => /^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(n) },
  { id: 'network', label: 'Network & Web', icon: 'globe', match: n => /^(web_|browser_|search_web|fetch_url|http_)/.test(n) },
  { id: 'knowledge', label: 'Knowledge & Search', icon: 'book', match: n => /^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(n) },
  { id: 'discord', label: 'Discord & Admin', icon: 'message', match: n => /^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(n) },
  { id: 'skills', label: 'Skills', icon: 'puzzle', match: n => /^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(n) },
  { id: 'memory', label: 'Memory & State', icon: 'brain', match: n => /^(memory_manage|list_manage)/.test(n) },
  { id: 'ai', label: 'AI & Generation', icon: 'sparkles', match: n => /^(generate_|analyze_|claude_|vision_|comfyui_)/.test(n) },
  { id: 'integrations', label: 'Integrations', icon: 'link', match: n => /^(issue_tracker|slack_|grafana_|mcp_)/.test(n) },
  { id: 'other', label: 'Other Tools', icon: 'wrench', match: () => true },
];

export default {
  template: `
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-xl font-semibold">Tools</h1>
          <p class="tl-panel-warning">Disabling a tool removes it from future model requests and causes stored jobs that call it to fail. Already-running calls are not cancelled.</p>
        </div>
        <div class="flex gap-2 items-center">
          <div class="tl-view-toggle" role="toolbar" aria-label="View mode">
            <button @click="viewMode = 'cards'" class="tl-view-btn" :class="{ 'tl-view-active': viewMode === 'cards' }" :aria-pressed="viewMode === 'cards'" aria-label="Card view"><odin-icon name="grid" :size="16" /></button>
            <button @click="viewMode = 'table'" class="tl-view-btn" :class="{ 'tl-view-active': viewMode === 'table' }" :aria-pressed="viewMode === 'table'" aria-label="Table view"><odin-icon name="list" :size="16" /></button>
          </div>
          <button @click="refresh" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Loading skeleton -->
      <div v-if="loading && tools.length === 0" class="space-y-3">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div v-for="n in 4" :key="n" class="hm-card text-center">
            <div class="skeleton skeleton-stat"></div>
            <div class="skeleton skeleton-text" style="width:60%;margin:0.25rem auto 0;"></div>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div v-for="n in 6" :key="n + 4" class="hm-card"><div class="skeleton skeleton-row"></div><div class="skeleton skeleton-text mt-2" style="width:80%"></div></div>
        </div>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="refresh" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else>
        <!-- Stats bar -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div class="tl-stat-card">
            <div class="tl-stat-value">{{ tools.length }}</div>
            <div class="tl-stat-label">Total Tools</div>
          </div>
          <div class="tl-stat-card">
            <div class="tl-stat-value">{{ coreCount }}</div>
            <div class="tl-stat-label">Core Tools</div>
          </div>
          <div class="tl-stat-card">
            <div class="tl-stat-value">{{ skillCount }}</div>
            <div class="tl-stat-label">Skill Tools</div>
          </div>
          <div class="tl-stat-card">
            <div class="tl-stat-value">{{ totalUsage.toLocaleString() }}</div>
            <div class="tl-stat-label">Total Executions</div>
          </div>
        </div>

        <!-- Search + Category filter -->
        <div class="flex flex-wrap gap-2 mb-4 items-center">
          <input v-model="search" type="text" class="hm-input tl-search" placeholder="Search tools by name or description..." />
          <div class="tl-category-chips" role="toolbar" aria-label="Filter by category">
            <button @click="activeCategory = null"
                    class="tl-category-chip" :class="{ 'tl-category-active': !activeCategory }"
                    :aria-pressed="!activeCategory">All</button>
            <button v-for="cat in usedCategories" :key="cat.id"
                    @click="activeCategory = activeCategory === cat.id ? null : cat.id"
                    class="tl-category-chip" :class="{ 'tl-category-active': activeCategory === cat.id }"
                    :aria-pressed="activeCategory === cat.id">
              <odin-icon :name="cat.icon" :size="15" /> {{ cat.label }}
            </button>
          </div>
        </div>

        <!-- CARD VIEW -->
        <div v-if="viewMode === 'cards'">
          <div v-for="group in groupedTools" :key="group.label" class="mb-5">
            <div class="tl-group-header">
              <span class="tl-group-icon"><odin-icon :name="group.icon" :size="17" /></span>
              <span class="tl-group-label">{{ group.label }}</span>
              <span class="badge badge-info">{{ group.tools.length }}</span>
            </div>
            <div class="tl-tool-grid">
              <div v-for="t in group.tools" :key="t.name"
                   class="tl-tool-card" :class="{ 'tl-tool-card-active': stats[t.name] > 0, 'tl-tool-off': t.source === 'builtin' && !t.enabled }"
                   role="button" tabindex="0" :aria-expanded="!!expanded[t.name]"
                   @click="toggleExpand(t.name)" @keydown.enter="toggleExpand(t.name)" @keydown.space.prevent="toggleExpand(t.name)">
                <div class="tl-tool-header">
                  <span class="tl-tool-name">{{ t.name }}</span>
                  <span v-if="stateBadge(t)" :class="['tl-state-badge', 'tl-state-' + t.state]">{{ stateBadge(t) }}</span>
                </div>
                <div class="tl-tool-desc">{{ truncate(t.description, 80) }}</div>
                <div class="tl-tool-footer">
                  <div class="tl-tool-usage">
                    <span v-if="stats[t.name]" class="tl-tool-usage-count">{{ stats[t.name].toLocaleString() }}</span>
                    <span v-else class="tl-tool-usage-zero">\u2014</span>
                    <span class="tl-tool-usage-label">uses</span>
                  </div>
                  <label v-if="t.source === 'builtin'" class="tl-tool-switch" @click.stop @keydown.space.stop @keydown.enter.stop>
                    <span class="tl-tool-switch-label">Enabled for model</span>
                    <span class="toggle-switch" :aria-busy="togglePending.has(t.name) ? 'true' : 'false'">
                      <input type="checkbox" :checked="t.enabled" :disabled="togglePending.has(t.name)" :aria-label="'Enabled for model \u2014 ' + t.name" @change="toggleBuiltinTool(t, $event)" />
                      <span class="toggle-slider"></span>
                    </span>
                  </label>
                </div>
                <!-- Expanded detail -->
                <div v-if="expanded[t.name]" class="tl-tool-detail">
                  <div class="tl-tool-detail-desc">{{ t.description }}</div>
                  <div v-if="t.source === 'builtin' && t.is_core" class="tl-core-advisory">Core capability. Disabling it may cause automation, recovery, or stored workflows that depend on it to fail.</div>
                  <div v-if="t.input_schema && t.input_schema.properties" class="tl-tool-params">
                    <div class="tl-tool-params-title">Parameters</div>
                    <div v-for="(prop, pname) in t.input_schema.properties" :key="pname" class="tl-tool-param">
                      <span class="tl-tool-param-name">{{ pname }}</span>
                      <span v-if="prop.type" class="tl-tool-param-type">{{ prop.type }}</span>
                      <span v-if="(t.input_schema.required || []).includes(pname)" class="tl-tool-param-req">required</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TABLE VIEW (classic) -->
        <div v-if="viewMode === 'table'">
          <div v-for="group in groupedTools" :key="group.label" class="mb-4">
            <div class="tl-group-header">
              <span class="tl-group-icon"><odin-icon :name="group.icon" :size="17" /></span>
              <span class="tl-group-label">{{ group.label }}</span>
              <span class="badge badge-info">{{ group.tools.length }}</span>
            </div>
            <div class="table-responsive">
            <table class="hm-table">
              <thead>
                <tr>
                  <th style="width:30%">Name</th>
                  <th class="mobile-hide">Description</th>
                  <th style="width:100px" class="text-right">Uses</th>
                  <th style="width:160px" class="text-right">Enabled for model</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="t in group.tools" :key="t.name">
                  <tr class="cursor-pointer" :class="{ 'tl-tool-off': t.source === 'builtin' && !t.enabled }" role="button" tabindex="0" :aria-expanded="!!expanded[t.name]"
                      @click="toggleExpand(t.name)" @keydown.enter="toggleExpand(t.name)" @keydown.space.prevent="toggleExpand(t.name)">
                    <td class="font-mono text-sm whitespace-nowrap">
                      <span class="tool-expand-icon text-gray-600 mr-1" aria-hidden="true"><odin-icon :name="expanded[t.name] ? 'chevronUp' : 'chevronDown'" :size="13" /></span>
                      {{ t.name }}
                      <span v-if="stateBadge(t)" :class="['tl-state-badge', 'tl-state-' + t.state]">{{ stateBadge(t) }}</span>
                    </td>
                    <td class="text-gray-400 text-sm mobile-hide">{{ truncate(t.description, 100) }}</td>
                    <td class="text-right">
                      <div class="flex items-center justify-end gap-2">
                        <span v-if="stats[t.name]" class="text-gray-300 text-sm font-mono">{{ stats[t.name].toLocaleString() }}</span>
                        <span v-else class="text-gray-600 text-sm">\u2014</span>
                      </div>
                    </td>
                    <td class="text-right">
                      <label v-if="t.source === 'builtin'" class="tl-tool-switch" @click.stop @keydown.space.stop @keydown.enter.stop>
                        <span class="toggle-switch" :aria-busy="togglePending.has(t.name) ? 'true' : 'false'">
                          <input type="checkbox" :checked="t.enabled" :disabled="togglePending.has(t.name)" :aria-label="'Enabled for model \u2014 ' + t.name" @change="toggleBuiltinTool(t, $event)" />
                          <span class="toggle-slider"></span>
                        </span>
                      </label>
                    </td>
                  </tr>
                  <tr v-if="expanded[t.name]" class="tool-detail-row">
                    <td colspan="4" class="tool-detail-cell">
                      <div class="text-gray-300 text-sm whitespace-pre-wrap">{{ t.description }}</div>
                      <div v-if="t.source === 'builtin' && t.is_core" class="tl-core-advisory">Core capability. Disabling it may cause automation, recovery, or stored workflows that depend on it to fail.</div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
            </div>
          </div>
        </div>

        <!-- Empty search state -->
        <div v-if="filteredTools.length === 0 && search" class="hm-card empty-state">
          <span class="empty-state-icon"><odin-icon name="search" :size="23" /></span>
          <span class="empty-state-text">No tools match "{{ search }}"</span>
          <span class="empty-state-hint">Try a different search term</span>
        </div>
      </div>
    </div>`,

  setup() {
    const tools = ref([]);
    const loading = ref(true);
    const error = ref(null);
    const search = ref('');
    const stats = ref({});
    const expanded = ref({});
    const viewMode = ref('cards');
    const activeCategory = ref(null);
    const globalEnabled = ref(true);
    const togglePending = ref(new Set());

    const STATE_BADGES = {
      disabled: 'Disabled by operator',
      unavailable: 'Unavailable — required backend is not configured',
      global_disabled: 'Global tools disabled',
    };
    function stateBadge(t) {
      if (t.source !== 'builtin') return '';
      return STATE_BADGES[t.state] || '';
    }

    /** Merge the operator inventory (ALL built-ins, incl. hidden ones) with
     *  the visible catalog (skills + MCP). Built-ins render from inventory
     *  truth; only they get switches. */
    function applyInventory(inv, visible) {
      const invTools = (inv && Array.isArray(inv.tools)) ? inv.tools : null;
      globalEnabled.value = inv ? Boolean(inv.global_enabled) : true;
      if (!invTools) {
        // No inventory (e.g. non-admin viewer): best-effort source tags so
        // the stat cards stay meaningful; switches never render here.
        tools.value = visible.map(t => ({
          ...t,
          source: t.name.startsWith('mcp_') ? 'mcp' : (t.is_core ? 'builtin' : 'skill'),
        }));
        return;
      }
      const builtinNames = new Set(invTools.map(t => t.name));
      const others = visible
        .filter(t => !builtinNames.has(t.name))
        .map(t => ({ ...t, source: t.name.startsWith('mcp_') ? 'mcp' : 'skill', enabled: true, state: null }));
      tools.value = [...invTools.map(t => ({ ...t, source: 'builtin' })), ...others];
    }

    async function toggleBuiltinTool(t, event) {
      // Single-purpose dedicated mutation, no confirmation — the labeled
      // switch IS the explicit intent (panel warning covers consequences).
      if (togglePending.value.has(t.name)) return;
      const desired = Boolean(event.target.checked);
      const next = new Set(togglePending.value);
      next.add(t.name);
      togglePending.value = next;
      try {
        const inv = await api.post(
          `/api/tools/builtins/${encodeURIComponent(t.name)}/enabled`,
          { enabled: desired },
        );
        // The POST response is the committed canonical operator inventory.
        // Adopt it before any secondary read: a best-effort visible-catalog
        // refresh must never roll a successful mutation back in the UI.
        applyInventory(inv, tools.value);
        error.value = null;
        try {
          const visible = await api.get('/api/tools');
          applyInventory(inv, visible);
        } catch (refreshError) {
          console.warn('Built-in toggle committed; visible catalog refresh failed', refreshError);
        }
      } catch (e) {
        event.target.checked = Boolean(t.enabled);
        error.value = e.message || `Failed to toggle ${t.name}`;
      } finally {
        const done = new Set(togglePending.value);
        done.delete(t.name);
        togglePending.value = done;
      }
    }

    // Count by SOURCE, not by is_core: with the merged inventory, "not
    // core" spans non-core built-ins and MCP tools too — the old filter
    // reported them all as skills (Odin's re-validation, new defect 1).
    const coreCount = computed(() => tools.value.filter(t => t.source === 'builtin' && t.is_core).length);
    const skillCount = computed(() => tools.value.filter(t => t.source === 'skill').length);
    const totalUsage = computed(() => Object.values(stats.value).reduce((a, b) => a + b, 0));

    /** Categorize a tool based on its name */
    function categorize(name) {
      for (const cat of TOOL_CATEGORIES) {
        if (cat.id !== 'other' && cat.match(name)) return cat.id;
      }
      return 'other';
    }

    const filteredTools = computed(() => {
      let result = tools.value;
      if (search.value) {
        const q = search.value.toLowerCase();
        result = result.filter(t =>
          t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
        );
      }
      if (activeCategory.value) {
        result = result.filter(t => categorize(t.name) === activeCategory.value);
      }
      return result;
    });

    /** Which categories actually have tools */
    const usedCategories = computed(() => {
      const used = new Set();
      for (const t of tools.value) {
        used.add(categorize(t.name));
      }
      return TOOL_CATEGORIES.filter(c => used.has(c.id));
    });

    const groupedTools = computed(() => {
      const ft = filteredTools.value;
      // Group by category
      const byCategory = {};
      for (const t of ft) {
        const cat = categorize(t.name);
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(t);
      }
      const groups = [];
      for (const cat of TOOL_CATEGORIES) {
        if (byCategory[cat.id] && byCategory[cat.id].length > 0) {
          groups.push({
            label: cat.label,
            icon: cat.icon,
            tools: byCategory[cat.id].sort((a, b) => a.name.localeCompare(b.name)),
          });
        }
      }
      return groups;
    });

    function toggleExpand(name) {
      expanded.value = { ...expanded.value, [name]: !expanded.value[name] };
    }

    async function fetchTools() {
      loading.value = true;
      error.value = null;
      try {
        const [toolsData, statsData, invData] = await Promise.all([
          api.get('/api/tools'),
          api.get('/api/tools/stats').catch(() => ({})),
          api.get('/api/tools/builtins').catch(() => null),
        ]);
        applyInventory(invData, toolsData);
        stats.value = statsData || {};
      } catch (e) {
        error.value = e.message;
      }
      loading.value = false;
    }

    function refresh() {
      fetchTools();
    }

    onMounted(() => { fetchTools(); });

    return {
      tools, loading, error, search, stats, expanded, viewMode,
      activeCategory, globalEnabled, togglePending,
      coreCount, skillCount, totalUsage, filteredTools, groupedTools,
      usedCategories, stateBadge, toggleBuiltinTool,
      truncate, toggleExpand, refresh,
    };
  },
};
