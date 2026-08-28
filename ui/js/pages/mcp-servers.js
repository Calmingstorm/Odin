import { api, ws } from '../api.js';
import { confirmDialog } from '../confirm.js';
import {
  MCPFormError,
  buildMCPServerPayload,
  mcpConnectionEditNeedsConfirmation,
  mcpToolMatches,
  normalizeMCPState,
} from '../mcp-config-policy.js';
import { MCP_EDITOR_GROUPS, scrollMCPFormSection } from '../mcp-editor-navigation.js';
import { toast } from '../toast.js';
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';

const POLL_MS = 10000;
const STATE_LABELS = Object.freeze({
  disabled: 'Disabled',
  connecting: 'Connecting',
  connected: 'Connected',
  stale: 'Stale',
  error: 'Error',
  blocked: 'Blocked',
});

function blankForm() {
  return {
    name: '', enabled: true, transport: 'stdio',
    command: '', argsText: '', cwd: '', url: '',
    timeoutSeconds: 120, allowlistText: '',
    replaceArgs: false, replaceCwd: false,
    replaceTimeout: false, replaceAllowlist: false,
    headerRows: [], envRows: [], headersRemove: [], envRemove: [],
  };
}

function formatAge(seconds) {
  if (seconds == null) return 'Never';
  const value = Math.max(0, Number(seconds) || 0);
  if (value < 60) return `${Math.round(value)}s ago`;
  if (value < 3600) return `${Math.round(value / 60)}m ago`;
  if (value < 86400) return `${Math.round(value / 3600)}h ago`;
  return `${Math.round(value / 86400)}d ago`;
}

export default {
  template: `
    <div class="mcp-page p-6 page-fade-in">
      <header class="mcp-page-header">
        <div>
          <div class="mcp-eyebrow">Model Context Protocol</div>
          <h1 class="text-xl font-semibold">MCP Servers</h1>
          <p class="mcp-lede">Connect tool providers over stdio or Streamable HTTP. Only current, connected, validated tools enter the model catalog.</p>
        </div>
        <div class="mcp-header-actions">
          <button type="button" class="btn btn-ghost text-xs" @click="refreshAll" :disabled="loading || mutating">
            <odin-icon name="refresh" :size="15" /> {{ loading ? 'Refreshing' : 'Refresh' }}
          </button>
          <button type="button" class="btn btn-primary text-xs" @click="openAdd" :disabled="mutating">
            <odin-icon name="plus" :size="15" /> Add server
          </button>
        </div>
      </header>

      <div v-if="loading && !status" class="mcp-loading" aria-label="Loading MCP servers">
        <div class="hm-card skeleton skeleton-row"></div>
        <div v-for="n in 2" :key="n" class="hm-card"><div class="skeleton skeleton-row"></div><div class="skeleton skeleton-text mt-3"></div></div>
      </div>

      <div v-else-if="pageError && !status" class="hm-card error-state" role="alert">
        <span class="error-icon"><odin-icon name="warning" :size="21" /></span>
        <div><strong>Could not load MCP management</strong><p>{{ pageError }}</p></div>
        <button type="button" class="btn btn-ghost text-xs" @click="refreshAll">Retry</button>
      </div>

      <template v-else>
        <section class="mcp-control-card" aria-labelledby="mcp-control-title">
          <div class="mcp-control-main">
            <div class="mcp-control-icon" aria-hidden="true"><odin-icon name="network" :size="22" /></div>
            <div>
              <div class="mcp-control-title-row">
                <h2 id="mcp-control-title">MCP tool publication</h2>
                <span :class="['mcp-master-state', masterEnabled ? 'enabled' : 'disabled']">{{ masterEnabled ? 'Enabled' : 'Disabled' }}</span>
              </div>
              <p>{{ masterEnabled ? 'Enabled servers may connect and publish validated tools.' : 'All MCP tools are unpublished and transports are stopped.' }}</p>
            </div>
          </div>
          <label class="mcp-master-toggle">
            <span class="sr-only">Enable MCP servers globally</span>
            <span class="toggle-switch">
              <input type="checkbox" :checked="masterEnabled" @change="setMasterEnabled($event.target.checked)" :disabled="mutating" />
              <span class="toggle-slider"></span>
            </span>
          </label>
          <div class="mcp-aggregate" aria-label="MCP aggregate status">
            <div><strong>{{ aggregate.serverCount }}</strong><span>Configured</span></div>
            <div><strong>{{ aggregate.enabledCount }}</strong><span>Enabled</span></div>
            <div><strong>{{ aggregate.connectedCount }}</strong><span>Connected</span></div>
            <div><strong>{{ aggregate.toolCount }}</strong><span>Published tools</span></div>
          </div>
        </section>

        <div v-if="pageError" class="mcp-inline-error" role="alert">
          <odin-icon name="warning" :size="15" /><span>{{ pageError }}</span>
          <button type="button" @click="pageError = ''" aria-label="Dismiss error"><odin-icon name="close" :size="13" /></button>
        </div>

        <section class="mcp-server-section" aria-labelledby="mcp-server-heading">
          <div class="mcp-section-heading">
            <div><h2 id="mcp-server-heading">Configured servers</h2><p>Saved configuration and current runtime state are shown separately. A failed connection remains saved.</p></div>
            <span>{{ servers.length }} server{{ servers.length === 1 ? '' : 's' }}</span>
          </div>

          <div v-if="!servers.length" class="hm-card empty-state mcp-empty">
            <span class="empty-state-icon"><odin-icon name="network" :size="22" /></span>
            <h3>No MCP servers configured</h3>
            <p>Add a stdio process or Streamable HTTP endpoint. Static authentication is supported; interactive OAuth is not.</p>
            <button type="button" class="btn btn-primary text-xs" @click="openAdd">Add your first server</button>
          </div>

          <article v-for="server in servers" :key="server.name" :class="['mcp-server-card', 'state-' + serverState(server)]">
            <header class="mcp-server-header">
              <div class="mcp-server-identity">
                <span :class="['mcp-state-indicator', serverState(server)]" aria-hidden="true"></span>
                <div>
                  <div class="mcp-server-title-row">
                    <h3>{{ server.name }}</h3>
                    <span :class="['mcp-state-pill', serverState(server)]">{{ stateLabel(server) }}</span>
                  </div>
                  <div class="mcp-server-subtitle">
                    <span><odin-icon :name="server.transport === 'http' ? 'globe' : 'terminal'" :size="13" /> {{ transportLabel(server) }}</span>
                    <span>{{ protocolLabel(server) }}</span>
                    <span>Refresh {{ formatAge(server.last_refresh_age_seconds) }}</span>
                  </div>
                </div>
              </div>
              <div class="mcp-server-actions">
                <button type="button" class="btn btn-ghost text-xs" @click="refreshTools(server)" :disabled="busy(server.name) || !masterEnabled || !server.enabled" title="Re-list tools without rebuilding the transport">
                  <odin-icon name="refresh" :size="14" /> Refresh tools
                </button>
                <button type="button" class="btn btn-ghost text-xs" @click="reconnect(server)" :disabled="busy(server.name) || !masterEnabled || !server.enabled" title="Retire and rebuild the connection">
                  <odin-icon name="rotate" :size="14" /> Reconnect
                </button>
                <button type="button" class="icon-btn" @click="openEdit(server)" :disabled="busy(server.name)" :aria-label="'Edit ' + server.name" title="Edit server">
                  <odin-icon name="edit" :size="15" />
                </button>
                <button type="button" class="icon-btn danger" @click="removeServer(server)" :disabled="busy(server.name)" :aria-label="'Remove ' + server.name" title="Remove server">
                  <odin-icon name="trash" :size="15" />
                </button>
              </div>
            </header>

            <div class="mcp-server-body">
              <div class="mcp-metrics">
                <div><strong>{{ server.discovered_count || 0 }}</strong><span>Discovered</span></div>
                <div><strong>{{ server.published_count || 0 }}</strong><span>Published</span></div>
                <div><strong>{{ server.excluded_count || 0 }}</strong><span>Excluded</span></div>
                <div><strong>{{ server.generation || '—' }}</strong><span>Generation</span></div>
              </div>

              <div v-if="server.blocked_reason || server.last_error" :class="['mcp-server-message', server.blocked_reason ? 'blocked' : 'error']" role="status">
                <odin-icon :name="server.blocked_reason ? 'shield' : 'warning'" :size="15" />
                <div><strong>{{ server.blocked_reason ? 'Publication blocked' : 'Last error' }}</strong><p>{{ server.blocked_reason || server.last_error }}</p></div>
              </div>

              <details v-if="server.transport === 'stdio' && server.stderr_tail" class="mcp-stderr">
                <summary>stderr tail</summary>
                <pre>{{ server.stderr_tail }}</pre>
              </details>

              <div class="mcp-tool-disclosure">
                <button type="button" class="mcp-tools-toggle" @click="toggleTools(server)" :aria-expanded="expandedServers.has(server.name)" :aria-controls="'mcp-tools-' + server.name">
                  <span><odin-icon :name="expandedServers.has(server.name) ? 'chevronDown' : 'chevronRight'" :size="15" /> Tools</span>
                  <span>{{ toolSummary(server) }}</span>
                </button>

                <div v-if="expandedServers.has(server.name)" :id="'mcp-tools-' + server.name" class="mcp-tools-panel">
                  <div class="mcp-tool-search">
                    <odin-icon name="search" :size="15" />
                    <input type="search" :value="toolQueries[server.name] || ''" @input="setToolQuery(server.name, $event.target.value)" placeholder="Search original names, published names, descriptions, or exclusions" :aria-label="'Search tools from ' + server.name" />
                    <span v-if="toolsLoading.has(server.name)">Loading…</span>
                  </div>
                  <div v-if="toolErrors[server.name]" class="mcp-tool-error" role="alert">{{ toolErrors[server.name] }}</div>
                  <div v-else-if="!toolsLoading.has(server.name) && !filteredTools(server.name).length" class="mcp-tool-empty">
                    {{ (toolQueries[server.name] || '').trim() ? 'No tools match this search.' : 'No discovered tools are available.' }}
                  </div>
                  <div v-else class="mcp-tool-list">
                    <div v-for="tool in filteredTools(server.name)" :key="tool.original_name + ':' + (tool.published_name || '')" class="mcp-tool-row">
                      <div class="mcp-tool-names">
                        <code>{{ tool.original_name }}</code>
                        <span v-if="tool.published_name"><odin-icon name="chevronRight" :size="12" /><code>{{ tool.published_name }}</code></span>
                        <span v-else class="mcp-not-published">Not published</span>
                      </div>
                      <span :class="['mcp-tool-state', tool.published ? 'published' : (tool.excluded ? 'excluded' : 'unpublished')]">{{ tool.published ? 'Published' : (tool.excluded ? 'Excluded' : 'Not published') }}</span>
                      <p v-if="tool.description">{{ tool.description }}</p>
                      <p v-if="tool.exclusion_reason" class="mcp-exclusion"><strong>Reason:</strong> {{ tool.exclusion_reason }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </section>
      </template>

      <div v-if="editorOpen" class="modal-overlay mcp-modal-overlay" v-modal-focus @click.self="closeEditor" @keyup.escape="closeEditor" tabindex="-1" role="dialog" aria-modal="true" :aria-labelledby="'mcp-editor-title'">
        <form class="modal-content mcp-editor" @submit.prevent="saveServer">
          <header class="mcp-editor-header">
            <div>
              <div class="mcp-eyebrow">{{ editorMode === 'add' ? 'New connection' : 'Saved connection' }}</div>
              <h2 id="mcp-editor-title">{{ editorMode === 'add' ? 'Add MCP server' : 'Edit ' + editingName }}</h2>
              <p>Secrets are write-only. Existing values are never sent back to this browser.</p>
            </div>
            <button type="button" class="icon-btn" @click="closeEditor" aria-label="Close editor"><odin-icon name="close" :size="16" /></button>
          </header>

          <div v-if="formError" class="mcp-form-error" role="alert"><odin-icon name="warning" :size="15" /> {{ formError }}</div>

          <nav class="mcp-editor-nav" aria-label="MCP server form sections">
            <button v-for="group in editorGroups" :key="group.id" type="button" :aria-controls="'mcp-form-' + group.id" @click="jumpToEditorGroup(group.id)">{{ group.label }}</button>
          </nav>

          <div class="mcp-editor-groups">
            <section id="mcp-form-identity" class="mcp-form-group">
              <header><span>01</span><div><h3 tabindex="-1" data-mcp-form-heading>Identity</h3><p>Name the connection and control its own activation.</p></div></header>
              <div class="mcp-form-grid two">
                <label class="mcp-field"><span>Name</span><input v-model="form.name" class="hm-input font-mono" type="text" autocomplete="off" maxlength="128" :disabled="editorMode === 'edit'" placeholder="github_tools" /><small>Letters, digits, and underscores. Cannot be renamed.</small></label>
                <label class="mcp-switch-field"><span>Server enabled</span><span class="mcp-switch-line"><span>{{ form.enabled ? 'Enabled' : 'Disabled' }}</span><span class="toggle-switch"><input v-model="form.enabled" type="checkbox" /><span class="toggle-slider"></span></span></span><small>The global master switch must also be on.</small></label>
              </div>
            </section>

            <section id="mcp-form-transport" class="mcp-form-group">
              <header><span>02</span><div><h3 tabindex="-1" data-mcp-form-heading>Transport</h3><p>Choose how Odin reaches this MCP server.</p></div></header>
              <div class="mcp-transport-choice" role="radiogroup" aria-label="Transport">
                <label :class="{ selected: form.transport === 'stdio' }"><input v-model="form.transport" type="radio" value="stdio" /><odin-icon name="terminal" :size="18" /><span><strong>stdio</strong><small>Run an isolated local process</small></span></label>
                <label :class="{ selected: form.transport === 'http' }"><input v-model="form.transport" type="radio" value="http" /><odin-icon name="globe" :size="18" /><span><strong>Streamable HTTP</strong><small>Connect to an HTTP(S) endpoint</small></span></label>
              </div>

              <div v-if="form.transport === 'stdio'" class="mcp-form-grid">
                <label class="mcp-field"><span>Executable path <small v-if="editorMode === 'edit'">leave blank to keep current</small></span><input v-model="form.command" class="hm-input font-mono" type="text" autocomplete="off" placeholder="/usr/local/bin/my-mcp-server" /></label>
                <label v-if="editorMode === 'add' || form.replaceArgs" class="mcp-field"><span>Arguments <small>one per line</small></span><textarea v-model="form.argsText" class="hm-input" rows="3" placeholder="--flag&#10;value"></textarea></label>
                <button v-else type="button" class="mcp-replace-field" @click="form.replaceArgs = true"><odin-icon name="edit" :size="14" /><span><strong>Replace command arguments</strong><small>The current values are not exposed by the management API.</small></span></button>
                <label v-if="editorMode === 'add' || form.replaceCwd" class="mcp-field"><span>Working directory <small>optional absolute path</small></span><input v-model="form.cwd" class="hm-input font-mono" type="text" autocomplete="off" placeholder="/srv/mcp" /></label>
                <button v-else type="button" class="mcp-replace-field" @click="form.replaceCwd = true"><odin-icon name="folder" :size="14" /><span><strong>Replace working directory</strong><small>Leave unchanged unless you explicitly replace it.</small></span></button>
              </div>
              <div v-else class="mcp-form-grid">
                <label class="mcp-field">
                  <span>{{ endpointFieldLabel }} <small v-if="savedHttpEndpoint" class="mcp-configured-indicator">Endpoint configured</small><small v-else-if="endpointRequired">required</small></span>
                  <input v-model="form.url" class="hm-input font-mono" type="url" autocomplete="off" :placeholder="endpointPlaceholder" :required="endpointRequired" />
                  <small v-if="savedHttpEndpoint">The current endpoint remains unchanged unless a replacement is entered.</small>
                  <small v-else-if="editorMode === 'edit'">A new endpoint is required when switching to HTTP.</small>
                </label>
                <div class="mcp-static-auth-note"><odin-icon name="info" :size="15" /><span>Streamable HTTP with static headers is supported. Interactive OAuth and the deprecated HTTP+SSE transport are not part of v1.</span></div>
              </div>
            </section>

            <section id="mcp-form-authentication" class="mcp-form-group">
              <header><span>03</span><div><h3 tabindex="-1" data-mcp-form-heading>Authentication</h3><p>Rotate static headers or child-process environment values without exposing configured secrets.</p></div></header>
              <div class="mcp-secret-columns">
                <div class="mcp-secret-editor">
                  <div class="mcp-secret-heading"><div><strong>HTTP headers</strong><small v-if="form.transport !== 'http'">Stored, but used only by HTTP</small></div><button type="button" class="btn btn-ghost text-xs" @click="addSecretRow('headers')"><odin-icon name="plus" :size="13" /> Add</button></div>
                  <div v-if="configuredHeaderKeys.length" class="mcp-configured-secrets">
                    <div v-for="key in configuredHeaderKeys" :key="key"><code>{{ key }}</code><span>Configured</span><button type="button" @click="toggleSecretRemoval('headers', key)" :class="{ undo: form.headersRemove.includes(key) }">{{ form.headersRemove.includes(key) ? 'Undo remove' : 'Remove' }}</button></div>
                  </div>
                  <div v-for="(row, index) in form.headerRows" :key="'h-' + index" class="mcp-secret-row"><input v-model="row.key" class="hm-input font-mono" type="text" placeholder="Header name" autocomplete="off" /><input v-model="row.value" class="hm-input" type="password" placeholder="New value" autocomplete="new-password" /><button type="button" class="icon-btn" @click="removeSecretRow('headers', index)" aria-label="Remove new header row"><odin-icon name="close" :size="14" /></button></div>
                  <p v-if="!configuredHeaderKeys.length && !form.headerRows.length" class="mcp-secret-empty">No configured header keys.</p>
                </div>
                <div class="mcp-secret-editor">
                  <div class="mcp-secret-heading"><div><strong>Environment variables</strong><small v-if="form.transport !== 'stdio'">Stored, but used only by stdio</small></div><button type="button" class="btn btn-ghost text-xs" @click="addSecretRow('env')"><odin-icon name="plus" :size="13" /> Add</button></div>
                  <div v-if="configuredEnvKeys.length" class="mcp-configured-secrets">
                    <div v-for="key in configuredEnvKeys" :key="key"><code>{{ key }}</code><span>Configured</span><button type="button" @click="toggleSecretRemoval('env', key)" :class="{ undo: form.envRemove.includes(key) }">{{ form.envRemove.includes(key) ? 'Undo remove' : 'Remove' }}</button></div>
                  </div>
                  <div v-for="(row, index) in form.envRows" :key="'e-' + index" class="mcp-secret-row"><input v-model="row.key" class="hm-input font-mono" type="text" placeholder="Variable name" autocomplete="off" /><input v-model="row.value" class="hm-input" type="password" placeholder="New value" autocomplete="new-password" /><button type="button" class="icon-btn" @click="removeSecretRow('env', index)" aria-label="Remove new environment row"><odin-icon name="close" :size="14" /></button></div>
                  <p v-if="!configuredEnvKeys.length && !form.envRows.length" class="mcp-secret-empty">No configured environment keys.</p>
                </div>
              </div>
            </section>

            <section id="mcp-form-limits" class="mcp-form-group">
              <header><span>04</span><div><h3 tabindex="-1" data-mcp-form-heading>Limits</h3><p>Bound calls and optionally narrow discovery to named tools.</p></div></header>
              <div class="mcp-form-grid two">
                <label v-if="editorMode === 'add' || form.replaceTimeout" class="mcp-field"><span>Call timeout <small>seconds</small></span><input v-model="form.timeoutSeconds" class="hm-input font-mono" type="number" min="1" max="3600" step="1" /></label>
                <button v-else type="button" class="mcp-replace-field" @click="form.replaceTimeout = true"><odin-icon name="clock" :size="14" /><span><strong>Replace call timeout</strong><small>Current value remains unchanged until replaced.</small></span></button>
                <label v-if="editorMode === 'add' || form.replaceAllowlist" class="mcp-field"><span>Tool allowlist <small>one original name per line; empty allows all</small></span><textarea v-model="form.allowlistText" class="hm-input font-mono" rows="4" placeholder="search_code&#10;create_issue"></textarea></label>
                <button v-else type="button" class="mcp-replace-field" @click="form.replaceAllowlist = true"><odin-icon name="list" :size="14" /><span><strong>Replace tool allowlist</strong><small>Use this to narrow an over-limit blocked server.</small></span></button>
              </div>
              <div class="mcp-limit-note"><odin-icon name="shield" :size="15" /><span>Defaults: 40 published tools per server and globally, 128 discovered tools per server, 32 list pages, bounded descriptions and schemas. Over-limit servers publish nothing rather than silently truncating.</span></div>
            </section>
          </div>

          <footer class="mcp-editor-footer">
            <span>{{ editorMode === 'edit' ? 'Unspecified edit fields stay unchanged.' : 'The server is saved even if its first connection fails.' }}</span>
            <div><button type="button" class="btn btn-ghost text-sm" @click="closeEditor" :disabled="saving">Cancel</button><button type="submit" class="btn btn-primary text-sm" :disabled="saving">{{ saving ? 'Saving…' : (editorMode === 'add' ? 'Add server' : 'Save changes') }}</button></div>
          </footer>
        </form>
      </div>
    </div>
  `,
  setup() {
    const status = ref(null);
    const loading = ref(false);
    const mutating = ref(false);
    const pageError = ref('');
    const activeServerOps = ref(new Set());
    const expandedServers = ref(new Set());
    const toolQueries = ref({});
    const toolRows = ref({});
    const toolErrors = ref({});
    const toolsLoading = ref(new Set());

    const editorOpen = ref(false);
    const editorMode = ref('add');
    const editingName = ref('');
    const editingServer = ref(null);
    const form = ref(blankForm());
    const formError = ref('');
    const saving = ref(false);
    let pollTimer = null;
    let refreshGeneration = 0;
    let active = false;
    let subscribedToEvents = false;

    const editorGroups = MCP_EDITOR_GROUPS;
    const servers = computed(() => status.value?.servers || []);
    const masterEnabled = computed(() => Boolean(status.value?.enabled));
    const aggregate = computed(() => ({
      serverCount: status.value?.server_count || 0,
      enabledCount: status.value?.enabled_server_count || 0,
      connectedCount: status.value?.connected_count || 0,
      toolCount: status.value?.published_tool_count || 0,
    }));
    const configuredHeaderKeys = computed(() => editingServer.value?.header_keys || []);
    const configuredEnvKeys = computed(() => editingServer.value?.env_keys || []);
    const savedHttpEndpoint = computed(() => editorMode.value === 'edit' && editingServer.value?.transport === 'http');
    const endpointRequired = computed(() => editorMode.value === 'add' || !savedHttpEndpoint.value);
    const endpointFieldLabel = computed(() => savedHttpEndpoint.value ? 'Replace endpoint URL' : 'Endpoint URL');
    const endpointPlaceholder = computed(() => savedHttpEndpoint.value
      ? 'Leave blank to keep the saved endpoint'
      : 'https://mcp.example.com/mcp');

    function startPolling() {
      stopPolling();
      pollTimer = window.setInterval(() => refreshAll({ quiet: true }), POLL_MS);
    }
    function stopPolling() {
      if (pollTimer) window.clearInterval(pollTimer);
      pollTimer = null;
    }
    async function refreshAll({ quiet = false } = {}) {
      const generation = ++refreshGeneration;
      if (!quiet) loading.value = true;
      try {
        const next = await api.get('/api/mcp/status');
        if (generation !== refreshGeneration || !active) return;
        status.value = next;
        pageError.value = '';
        const names = new Set((next.servers || []).map(server => server.name));
        expandedServers.value = new Set([...expandedServers.value].filter(name => names.has(name)));
      } catch (error) {
        if (generation === refreshGeneration && active) pageError.value = error.message || 'Failed to load MCP status';
      } finally {
        if (generation === refreshGeneration) loading.value = false;
      }
    }
    function busy(name) { return mutating.value || activeServerOps.value.has(name); }
    function setServerBusy(name, value) {
      const next = new Set(activeServerOps.value);
      if (value) next.add(name); else next.delete(name);
      activeServerOps.value = next;
    }
    function serverState(server) { return normalizeMCPState(server.state); }
    function stateLabel(server) { return STATE_LABELS[serverState(server)]; }
    function transportLabel(server) { return server.transport === 'http' ? 'Streamable HTTP' : 'stdio'; }
    function protocolLabel(server) {
      if (!server.negotiated_version) return 'Not negotiated';
      const era = server.era ? `${String(server.era).charAt(0).toUpperCase()}${String(server.era).slice(1)}` : 'Protocol';
      return `${era} · ${server.negotiated_version}`;
    }
    function toolSummary(server) {
      if (!server.discovered_count) return 'No tools discovered';
      return `${server.published_count || 0} published · ${server.excluded_count || 0} excluded`;
    }

    async function setMasterEnabled(enabled) {
      if (enabled === masterEnabled.value) return;
      if (!enabled) {
        const ok = await confirmDialog({
          title: 'Disable MCP tool publication',
          message: 'Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.',
          confirmLabel: 'Disable MCP', danger: true,
        });
        if (!ok) return;
      }
      mutating.value = true;
      try {
        await api.post('/api/mcp/enabled', { enabled });
        toast.success(enabled ? 'MCP enabled' : 'MCP disabled');
        await refreshAll({ quiet: true });
      } catch (error) {
        toast.error(error.message || 'Failed to update MCP state');
        await refreshAll({ quiet: true });
      } finally { mutating.value = false; }
    }

    async function reconnect(server) {
      setServerBusy(server.name, true);
      try {
        await api.post(`/api/mcp/servers/${encodeURIComponent(server.name)}/reconnect`, {});
        toast.success(`Reconnected ${server.name}`);
      } catch (error) { toast.error(error.message || `Failed to reconnect ${server.name}`); }
      finally { setServerBusy(server.name, false); await refreshAll({ quiet: true }); }
    }
    async function refreshTools(server) {
      setServerBusy(server.name, true);
      try {
        await api.post(`/api/mcp/servers/${encodeURIComponent(server.name)}/refresh-tools`, {});
        toast.success(`Refreshed tools from ${server.name}`);
        await loadTools(server.name, true);
      } catch (error) { toast.error(error.message || `Failed to refresh ${server.name}`); }
      finally { setServerBusy(server.name, false); await refreshAll({ quiet: true }); }
    }
    async function removeServer(server) {
      const ok = await confirmDialog({
        title: `Remove ${server.name}`,
        message: `Remove this saved MCP server? Its ${server.published_count || 0} published tool${server.published_count === 1 ? '' : 's'} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,
        confirmLabel: 'Remove server', danger: true,
      });
      if (!ok) return;
      setServerBusy(server.name, true);
      try {
        await api.del(`/api/mcp/servers/${encodeURIComponent(server.name)}`);
        toast.success(`Removed ${server.name}`);
        delete toolRows.value[server.name];
      } catch (error) { toast.error(error.message || `Failed to remove ${server.name}`); }
      finally { setServerBusy(server.name, false); await refreshAll({ quiet: true }); }
    }

    async function toggleTools(server) {
      const next = new Set(expandedServers.value);
      if (next.has(server.name)) {
        next.delete(server.name);
        expandedServers.value = next;
        return;
      }
      next.add(server.name);
      expandedServers.value = next;
      if (!Object.hasOwn(toolRows.value, server.name)) await loadTools(server.name);
    }
    async function loadTools(name, force = false) {
      if (!force && Object.hasOwn(toolRows.value, name)) return;
      const loadingSet = new Set(toolsLoading.value); loadingSet.add(name); toolsLoading.value = loadingSet;
      toolErrors.value = { ...toolErrors.value, [name]: '' };
      try {
        const response = await api.get(`/api/mcp/servers/${encodeURIComponent(name)}/tools`);
        toolRows.value = { ...toolRows.value, [name]: response.tools || [] };
      } catch (error) { toolErrors.value = { ...toolErrors.value, [name]: error.message || 'Failed to load tools' }; }
      finally { const next = new Set(toolsLoading.value); next.delete(name); toolsLoading.value = next; }
    }
    function filteredTools(name) { return (toolRows.value[name] || []).filter(tool => mcpToolMatches(tool, toolQueries.value[name])); }
    function setToolQuery(name, value) { toolQueries.value = { ...toolQueries.value, [name]: value }; }

    function openAdd() {
      editorMode.value = 'add'; editingName.value = ''; editingServer.value = null;
      form.value = blankForm(); formError.value = ''; editorOpen.value = true;
    }
    function openEdit(server) {
      editorMode.value = 'edit'; editingName.value = server.name; editingServer.value = server;
      form.value = { ...blankForm(), name: server.name, enabled: Boolean(server.enabled), transport: server.transport || 'stdio' };
      formError.value = ''; editorOpen.value = true;
    }
    function closeEditor() { if (!saving.value) editorOpen.value = false; }
    function jumpToEditorGroup(groupId) {
      if (!editorOpen.value) return;
      scrollMCPFormSection(groupId);
    }
    function addSecretRow(kind) {
      const field = kind === 'headers' ? 'headerRows' : 'envRows';
      form.value[field].push({ key: '', value: '' });
    }
    function removeSecretRow(kind, index) {
      const field = kind === 'headers' ? 'headerRows' : 'envRows';
      form.value[field].splice(index, 1);
    }
    function toggleSecretRemoval(kind, key) {
      const field = kind === 'headers' ? 'headersRemove' : 'envRemove';
      const current = form.value[field];
      form.value[field] = current.includes(key) ? current.filter(item => item !== key) : [...current, key];
    }

    async function saveServer() {
      formError.value = '';
      let payload;
      try {
        payload = buildMCPServerPayload(form.value, { mode: editorMode.value, originalTransport: editingServer.value?.transport || '' });
      } catch (error) {
        formError.value = error instanceof MCPFormError ? error.message : 'Invalid MCP server configuration';
        await nextTick(); document.querySelector('.mcp-editor')?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (editorMode.value === 'edit' && mcpConnectionEditNeedsConfirmation(form.value, editingServer.value?.transport)) {
        const ok = await confirmDialog({
          title: `Change ${editingName.value} connection`,
          message: 'This edit changes the command, endpoint, transport, arguments, or working directory. The current MCP connection will be retired and rebuilt, and its tools will be unpublished during the transition.',
          confirmLabel: 'Save and reconnect', danger: true,
        });
        if (!ok) return;
      }
      saving.value = true;
      try {
        if (editorMode.value === 'add') await api.post('/api/mcp/servers', payload);
        else await api.put(`/api/mcp/servers/${encodeURIComponent(editingName.value)}`, payload);
        toast.success(editorMode.value === 'add' ? `Saved ${payload.name}` : `Updated ${editingName.value}`);
        editorOpen.value = false;
        await refreshAll({ quiet: true });
      } catch (error) { formError.value = error.message || 'Failed to save MCP server'; }
      finally { saving.value = false; }
    }

    let eventRefreshTimer = null;
    function onRuntimeEvent(event) {
      const text = `${event?.event || ''} ${event?.type || ''} ${event?.tool || ''} ${event?.message || ''}`.toLowerCase();
      if (!text.includes('mcp')) return;
      if (eventRefreshTimer) window.clearTimeout(eventRefreshTimer);
      eventRefreshTimer = window.setTimeout(() => refreshAll({ quiet: true }), 200);
    }
    function activate() {
      if (active) return;
      active = true;
      if (!subscribedToEvents) {
        ws.subscribe('events', onRuntimeEvent);
        subscribedToEvents = true;
      }
      refreshAll();
      startPolling();
    }
    function deactivate() {
      active = false;
      stopPolling();
      if (eventRefreshTimer) window.clearTimeout(eventRefreshTimer);
      eventRefreshTimer = null;
      if (subscribedToEvents) {
        ws.unsubscribe('events', onRuntimeEvent);
        subscribedToEvents = false;
      }
    }
    onMounted(activate); onActivated(activate); onDeactivated(deactivate); onUnmounted(deactivate);

    return {
      status, loading, mutating, pageError, servers, masterEnabled, aggregate,
      expandedServers, toolQueries, toolErrors, toolsLoading,
      editorOpen, editorMode, editingName, form, formError, saving, editorGroups,
      configuredHeaderKeys, configuredEnvKeys, savedHttpEndpoint, endpointRequired,
      endpointFieldLabel, endpointPlaceholder,
      refreshAll, busy, serverState, stateLabel, transportLabel, protocolLabel, toolSummary, formatAge,
      setMasterEnabled, reconnect, refreshTools, removeServer, toggleTools, filteredTools, setToolQuery,
      openAdd, openEdit, closeEditor, jumpToEditorGroup,
      addSecretRow, removeSecretRow, toggleSecretRemoval, saveServer,
    };
  },
};
