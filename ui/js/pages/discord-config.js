/**
 * Discord per-guild/per-channel configuration page.
 * Toggle response enabled + require_mention per guild and channel.
 */
import { api } from '../api.js';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { DiscordUserCombobox, discordMemberDisplayName } from '../discord-user-combobox.js';
import { guildBehaviorValue } from '../discord-config-policy.js';


export default {
  components: { DiscordUserCombobox },
  template: `
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">Discord Channels</h1>
        <button @click="fetchAll" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
      <section class="hm-card mb-4 discord-gateway-card">
        <div class="discord-gateway-summary">
          <div class="discord-gateway-heading">
            <h2 class="text-sm font-semibold text-gray-300">Gateway connection</h2>
            <span :class="['badge', connectionState.badgeClass]">{{ connectionState.label }}</span>
          </div>
          <p class="text-xs text-gray-500">{{ connectionState.detail }}</p>
          <div class="discord-credential-status">
            <span v-if="connection.credential_usable && !connectionToken" class="provider-status text-xs text-green-400"><span class="status-dot online" aria-hidden="true"></span>Configured</span>
            <span v-else-if="!connection.credential_usable" class="provider-status text-xs text-amber-500"><span class="status-dot offline" aria-hidden="true"></span>No usable credential</span>
            <span class="discord-storage-note">{{ connection.credential_preferred_storage ? 'Stored in the preferred environment format' : (connection.credential_usable ? 'Legacy storage; replace to migrate' : 'Not stored') }}</span>
          </div>
        </div>
        <div class="discord-gateway-controls">
          <form class="discord-token-form" @submit.prevent="saveDiscordCredentials">
            <input v-model="connectionToken" class="hm-input credential-input" type="password" aria-label="Discord bot token"
                   autocomplete="new-password" autocapitalize="none" spellcheck="false"
                   :placeholder="connection.credential_usable ? '••••••••  (press Enter to replace)' : 'Discord bot token'"
                   :disabled="connectionBusy" @keydown.enter.prevent="saveDiscordCredentials" @input="connectionTokenDirty = true" />
            <button class="btn btn-primary text-xs" :disabled="connectionBusy || !connectionTokenDirty || !connectionToken">{{ connectionBusy ? 'Saving…' : 'Save and connect' }}</button>
          </form>
          <div class="discord-gateway-actions">
            <button class="btn btn-ghost text-xs" @click="connectDiscord" :disabled="connectionBusy || !connection.credential_usable">{{ connectionState.key === 'connected' ? 'Reconnect' : 'Connect' }}</button>
            <button class="btn btn-ghost text-xs" @click="detachDiscord" :disabled="connectionBusy">Detach</button>
          </div>
        </div>
        <p v-if="connectionError" class="text-xs text-red-400 mt-2" role="alert">{{ connectionError }}</p>
      </section>
      <p class="text-xs text-gray-500 mb-4">
        For ordinary conversational intake, allowed users and channels are absolute global gates; guild and channel settings cannot readmit a blocked message.
        Explicitly allowed test webhooks bypass the user gate. Require-mention and bot-response behavior
        resolve channel → guild → global. An explicit mention bypasses the ignored-bot list, but the effective respond-to-bots policy still applies.
        Changes take effect immediately.
      </p>

      <div v-if="loading && guilds.length === 0" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state">
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchAll" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else class="space-y-4">
        <section v-if="globalDraft" class="hm-card discord-global-card">
          <div class="discord-global-heading">
            <div>
              <h2 class="text-sm font-semibold text-gray-300">Global defaults</h2>
              <p>Allowed users and channels are absolute. Require-mention and bot-response values are defaults that guild or channel settings may override.</p>
            </div>
          </div>
          <div v-if="globalError" class="text-xs text-red-400 mb-3" role="alert">{{ globalError }}</div>
          <div class="discord-global-toggles">
            <label>Require @mention by default
              <span class="toggle-switch"><input v-model="globalDraft.require_mention" type="checkbox" /><span class="toggle-slider"></span></span>
            </label>
            <label>Respond to bots by default
              <span class="toggle-switch"><input v-model="globalDraft.respond_to_bots" type="checkbox" /><span class="toggle-slider"></span></span>
            </label>
          </div>
          <div class="discord-global-rows">
            <div v-for="editor in globalListEditors" :key="editor.key" class="discord-global-row">
              <div class="discord-global-row-label"><strong>{{ editor.label }}</strong>
                <details class="discord-help">
                  <summary :aria-label="'About ' + editor.label">?</summary>
                  <p>{{ editor.description }}</p>
                </details>
              </div>
              <div class="cfgc-chip-list">
                <span v-for="item in globalDraft[editor.key]" :key="item" class="cfgc-chip">{{ globalItemLabel(editor, item) }}
                  <button type="button" @click="removeGlobalItem(editor.key, item)" :aria-label="'Remove ' + globalItemLabel(editor, item)">×</button>
                </span>
                <span v-if="!globalDraft[editor.key].length" class="cfgc-chip-empty">No entries</span>
              </div>
              <div v-if="editor.userAutocomplete" class="cfgc-chip-add discord-global-user-picker">
                <discord-user-combobox :members="globalMembers" :excluded-ids="globalDraft[editor.key]"
                                        :options-id="'discord-global-' + editor.key + '-options'"
                                        :placeholder="editor.placeholder" :aria-label="'Search ' + editor.label.toLowerCase()"
                                        :show-add-button="true"
                                        @select="addGlobalItem(editor.key, $event)" />
              </div>
              <div v-else class="cfgc-chip-add">
                <input v-model="globalArrayInputs[editor.key]" class="hm-input font-mono" type="text" :placeholder="editor.placeholder"
                       @keydown.enter.prevent="addGlobalItem(editor.key)" />
                <button type="button" class="btn btn-ghost text-xs" @click="addGlobalItem(editor.key)">Add</button>
              </div>
            </div>
          </div>
          <div class="discord-global-footer">
            <span>Saving changes these global gates and defaults. Guild and channel behavior overrides remain untouched and cannot bypass the allowlists.</span>
            <button type="button" class="btn btn-primary text-xs" @click="saveGlobalDefaults" :disabled="globalSaving || !globalChanged">{{ globalSaving ? 'Saving…' : 'Save global defaults' }}</button>
          </div>
        </section>

        <div v-for="guild in guilds" :key="guild.id" class="hm-card">
          <!-- Guild header -->
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-3">
              <img v-if="guild.icon_url" :src="guild.icon_url + '?size=32'" class="w-8 h-8 rounded-full" />
              <div v-else class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                {{ guild.name.charAt(0) }}
              </div>
              <div>
                <span class="text-white font-medium">{{ guild.name }}</span>
                <span class="text-gray-500 text-xs ml-2">{{ guild.member_count }} members</span>
              </div>
            </div>
            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2 text-xs text-gray-400">
                Enabled
                <span class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildEnabled(guild)"
                    :disabled="mutationPending.has('guild:' + guild.id + ':enabled')"
                    @change="setGuildConfig(guild.id, 'enabled', $event.target.checked, $event)" />
                  <span class="toggle-slider"></span>
                </span>
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-400">
                Require @mention
                <span class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildMention(guild)"
                    :disabled="mutationPending.has('guild:' + guild.id + ':require_mention')"
                    @change="setGuildConfig(guild.id, 'require_mention', $event.target.checked, $event)" />
                  <span class="toggle-slider"></span>
                </span>
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-400">
                Respond to bots
                <span class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildBots(guild)"
                    :disabled="mutationPending.has('guild:' + guild.id + ':respond_to_bots')"
                    @change="setGuildConfig(guild.id, 'respond_to_bots', $event.target.checked, $event)" />
                  <span class="toggle-slider"></span>
                </span>
              </label>
              <button @click="toggleGuild(guild.id)" class="btn btn-ghost text-xs">
                {{ expanded[guild.id] ? 'Hide channels' : 'Show channels' }}
              </button>
            </div>
          </div>

          <!-- Channel list -->
          <div v-if="expanded[guild.id]">
            <div class="table-responsive">
              <table class="hm-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Category</th>
                  <th class="text-center" style="width:100px">Enabled</th>
                  <th class="text-center" style="width:120px">Require @mention</th>
                  <th class="text-center" style="width:120px">Respond to bots</th>
                  <th class="text-center" style="width:80px">Override</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ch in guild.channels" :key="ch.id"
                    :class="{'opacity-40': !ch.effective.enabled}">
                  <td class="font-mono text-sm">#{{ ch.name }}</td>
                  <td class="text-xs text-gray-500">{{ ch.category || '—' }}</td>
                  <td class="text-center">
                    <label class="toggle-switch">
                      <input type="checkbox"
                        :checked="ch.effective.enabled"
                        :disabled="mutationPending.has('channel:' + ch.id + ':enabled')"
                        @change="setChannelConfig(ch.id, guild.id, 'enabled', $event.target.checked, $event)" />
                      <span class="toggle-slider"></span>
                    </label>
                  </td>
                  <td class="text-center">
                    <label class="toggle-switch">
                      <input type="checkbox"
                        :checked="ch.effective.require_mention"
                        :disabled="mutationPending.has('channel:' + ch.id + ':require_mention')"
                        @change="setChannelConfig(ch.id, guild.id, 'require_mention', $event.target.checked, $event)" />
                      <span class="toggle-slider"></span>
                    </label>
                  </td>
                  <td class="text-center">
                    <label class="toggle-switch">
                      <input type="checkbox"
                        :checked="ch.effective.respond_to_bots"
                        :disabled="mutationPending.has('channel:' + ch.id + ':respond_to_bots')"
                        @change="setChannelConfig(ch.id, guild.id, 'respond_to_bots', $event.target.checked, $event)" />
                      <span class="toggle-slider"></span>
                    </label>
                  </td>
                  <td class="text-center">
                    <button v-if="hasOverride(ch)" type="button" class="badge badge-warning text-xs cursor-pointer"
                          @click="clearOverride(ch.id, guild.id)" :aria-label="'Clear override for channel ' + ch.name" title="Click to clear override">
                      custom
                    </button>
                    <span v-else class="text-gray-600 text-xs">inherit</span>
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,

  setup() {
    const guilds = ref([]);
    const connection = ref({
      persisted: false,
      credential_usable: false,
      credential_preferred_storage: false,
      connection: { state: 'unavailable', detail: 'Connection status unavailable' },
    });
    const connectionToken = ref('');
    const connectionTokenDirty = ref(false);
    const connectionBusy = ref(false);
    const connectionError = ref(null);
    let connectionPoll = null;
    const loading = ref(true);
    const error = ref(null);
    const expanded = ref({});
    const globalConfig = ref(null);
    const globalDraft = ref(null);
    const globalSaving = ref(false);
    const globalError = ref(null);
    const globalArrayInputs = ref({});
    const globalMembers = ref([]);
    let guildFetchSequence = 0;
    const globalListEditors = Object.freeze([
      { key: 'allowed_users', label: 'Allowed users', description: 'Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; explicitly allowed test webhooks bypass this gate.', placeholder: 'Search users', userAutocomplete: true },
      { key: 'channels', label: 'Allowed channels', description: 'Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels.', placeholder: 'Search channels' },
      { key: 'ignore_bot_ids', label: 'Ignored bot IDs', description: 'Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.', placeholder: 'Bot ID', userAutocomplete: true },
    ]);
    const connectionState = computed(() => {
      const raw = String(connection.value?.connection?.state || '').toLowerCase();
      const states = {
        connected: { key: 'connected', label: 'Connected', badgeClass: 'badge-success' },
        connecting: { key: 'connecting', label: 'Connecting', badgeClass: 'badge-warning' },
        disconnected: { key: 'disconnected', label: 'Disconnected', badgeClass: '' },
        detached: { key: 'disconnected', label: 'Disconnected', badgeClass: '' },
        detaching: { key: 'disconnected', label: 'Disconnected', badgeClass: '' },
        stopped: { key: 'unavailable', label: 'Unavailable', badgeClass: 'badge-warning' },
        failed: { key: 'unavailable', label: 'Unavailable', badgeClass: 'badge-warning' },
      };
      const normalized = states[raw] || { key: 'unavailable', label: 'Unavailable', badgeClass: 'badge-warning' };
      return { ...normalized, detail: connection.value?.connection?.detail || 'Connection status unavailable' };
    });
    const globalChanged = computed(() => JSON.stringify(globalConfig.value) !== JSON.stringify(globalDraft.value));
    const globalMembersById = computed(() => new Map(
      globalMembers.value.map(member => [String(member.id), member]),
    ));

    function guildEnabled(guild) {
      if (guild.config && guild.config.enabled !== undefined) return guild.config.enabled;
      return true;
    }

    function guildMention(guild) {
      return guildBehaviorValue(guild, 'require_mention', globalConfig.value);
    }

    function guildBots(guild) {
      return guildBehaviorValue(guild, 'respond_to_bots', globalConfig.value);
    }

    function hasOverride(ch) {
      return ch.config && Object.keys(ch.config).length > 0;
    }

    function toggleGuild(id) {
      expanded.value[id] = !expanded.value[id];
    }

    function normalizeGlobalConfig(loadedConfig) {
      const discord = loadedConfig.discord || {};
      return {
        allowed_users: [...(discord.allowed_users || [])],
        channels: [...(discord.channels || [])],
        respond_to_bots: Boolean(discord.respond_to_bots),
        require_mention: Boolean(discord.require_mention),
        ignore_bot_ids: [...(discord.ignore_bot_ids || [])],
      };
    }

    async function fetchGuilds({ showLoading = true } = {}) {
      const sequence = ++guildFetchSequence;
      if (showLoading) loading.value = true;
      error.value = null;
      try {
        const loadedGuilds = await api.get('/api/discord/guilds');
        if (sequence === guildFetchSequence) guilds.value = loadedGuilds;
      } catch (e) {
        if (sequence === guildFetchSequence) error.value = e.message;
      } finally {
        if (showLoading && sequence === guildFetchSequence) loading.value = false;
      }
    }

    async function fetchConnection() {
      try { connection.value = await api.get('/api/discord/connection'); connectionError.value = null; }
      catch (e) { connectionError.value = e.message; }
    }

    async function connectionOperation(operation, token = null) {
      if (connectionBusy.value) return;
      connectionBusy.value = true; connectionError.value = null;
      try {
        const body = { operation }; if (token !== null) body.token = token;
        connection.value = await api.post('/api/discord/connection', body);
        if (operation === 'credentials') {
          connectionToken.value = '';
          connectionTokenDirty.value = false;
        }
      } catch (e) { connectionError.value = e.message || 'Connection update failed.'; }
      finally { connectionBusy.value = false; }
    }
    function saveDiscordCredentials() {
      if (!connectionTokenDirty.value || !connectionToken.value) return;
      return connectionOperation('credentials', connectionToken.value);
    }
    function connectDiscord() { return connectionOperation('connect'); }
    function detachDiscord() { return connectionOperation('detach'); }

    async function fetchAll() {
      loading.value = true;
      error.value = null;
      try {
        const [loadedGuilds, loadedMembers, loadedConfig] = await Promise.all([
          api.get('/api/discord/guilds'),
          api.get('/api/discord/members').catch(() => []),
          api.get('/api/config'),
        ]);
        const loadedGlobalConfig = normalizeGlobalConfig(loadedConfig);
        const preserveGlobalDraft = globalChanged.value;
        globalConfig.value = loadedGlobalConfig;
        if (!preserveGlobalDraft) {
          globalDraft.value = JSON.parse(JSON.stringify(loadedGlobalConfig));
        }
        globalMembers.value = loadedMembers;
        guilds.value = loadedGuilds;
        globalError.value = null;
      } catch (e) {
        error.value = e.message;
      } finally {
        loading.value = false;
      }
    }

    // Guild/channel mutations are SERIALIZED through one chain — rapid
    // clicks used to race uncoordinated PUT+refetch pairs (audit 6.3) — and
    // each control is disabled while its own mutation is in flight.
    let mutationChain = Promise.resolve();
    const mutationPending = ref(new Set());

    function enqueueConfigMutation(key, run) {
      const armed = new Set(mutationPending.value);
      armed.add(key);
      mutationPending.value = armed;
      const settled = mutationChain.then(run);
      mutationChain = settled.catch(() => {});
      return settled.finally(() => {
        const after = new Set(mutationPending.value);
        after.delete(key);
        mutationPending.value = after;
      });
    }

    function setGuildConfig(guildId, key, value, event) {
      const control = event?.target ?? null;
      return enqueueConfigMutation(`guild:${guildId}:${key}`, async () => {
        try {
          await api.put('/api/discord/guild/' + guildId + '/config', { [key]: value });
          await fetchGuilds({ showLoading: false });
        } catch (e) {
          error.value = e.message;
          // The browser flipped the checkbox before the server answered, and
          // the vdom value never changed, so a re-render will not undo it —
          // restore the control to the position the server still holds.
          if (control && typeof value === 'boolean') control.checked = !value;
        }
      });
    }

    function setChannelConfig(channelId, guildId, key, value, event) {
      const control = event?.target ?? null;
      return enqueueConfigMutation(`channel:${channelId}:${key}`, async () => {
        try {
          await api.put('/api/discord/channel/' + channelId + '/config', { [key]: value });
          await fetchGuilds({ showLoading: false });
        } catch (e) {
          error.value = e.message;
          if (control && typeof value === 'boolean') control.checked = !value;
        }
      });
    }

    function clearOverride(channelId, guildId) {
      return enqueueConfigMutation(`channel:${channelId}:clear`, async () => {
        try {
          await api.put('/api/discord/channel/' + channelId + '/config', { clear: true });
          await fetchGuilds({ showLoading: false });
        } catch (e) {
          error.value = e.message;
        }
      });
    }

    function globalItemLabel(editor, item) {
      const id = String(item);
      if (!editor.userAutocomplete) return id;
      const member = globalMembersById.value.get(id);
      return member ? discordMemberDisplayName(member) : id;
    }

    function addGlobalItem(key, selectedValue = null) {
      const value = String(selectedValue ?? globalArrayInputs.value[key] ?? '').trim();
      if (!value || globalDraft.value[key].includes(value)) return;
      globalDraft.value[key] = [...globalDraft.value[key], value];
      globalArrayInputs.value = { ...globalArrayInputs.value, [key]: '' };
    }

    function removeGlobalItem(key, value) {
      globalDraft.value[key] = globalDraft.value[key].filter(item => item !== value);
    }

    async function saveGlobalDefaults() {
      if (!globalChanged.value || globalSaving.value) return;
      globalSaving.value = true;
      globalError.value = null;
      try {
        const result = await api.put('/api/config', { discord: globalDraft.value });
        const discord = result.discord || globalDraft.value;
        globalConfig.value = {
          allowed_users: [...(discord.allowed_users || [])],
          channels: [...(discord.channels || [])],
          respond_to_bots: Boolean(discord.respond_to_bots),
          require_mention: Boolean(discord.require_mention),
          ignore_bot_ids: [...(discord.ignore_bot_ids || [])],
        };
        globalDraft.value = JSON.parse(JSON.stringify(globalConfig.value));
      } catch (saveError) {
        globalError.value = saveError.message || 'Global defaults could not be saved.';
      } finally {
        globalSaving.value = false;
      }
    }

    onMounted(() => { fetchAll(); fetchConnection(); connectionPoll = window.setInterval(fetchConnection, 5000); });
    onUnmounted(() => { if (connectionPoll !== null) window.clearInterval(connectionPoll); connectionPoll = null; });

    return {
      guilds, loading, error, expanded, globalDraft, globalSaving, globalError, globalArrayInputs, globalMembers, globalListEditors, globalChanged,
      guildEnabled, guildMention, guildBots, hasOverride, toggleGuild,
      fetchAll, fetchGuilds, setGuildConfig, setChannelConfig, clearOverride, mutationPending, globalItemLabel, addGlobalItem, removeGlobalItem, saveGlobalDefaults,
      connection, connectionState, connectionToken, connectionTokenDirty, connectionBusy, connectionError, saveDiscordCredentials, connectDiscord, detachDiscord,
    };
  },
};
