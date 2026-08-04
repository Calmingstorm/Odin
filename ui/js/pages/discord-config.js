/**
 * Discord per-guild/per-channel configuration page.
 * Toggle response enabled + require_mention per guild and channel.
 */
import { api } from '../api.js';
import { computed, onMounted, ref } from 'vue';
import { DiscordUserCombobox } from '../discord-user-combobox.js';


export default {
  components: { DiscordUserCombobox },
  template: `
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">Discord Channels</h1>
        <button @click="fetchGuilds" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
      <p class="text-xs text-gray-500 mb-4">
        Configure response behavior per guild and channel. Channel overrides take priority over guild defaults.
        Changes take effect immediately.
      </p>

      <div v-if="loading && guilds.length === 0" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state">
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchGuilds" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else class="space-y-4">
        <section v-if="globalDraft" class="hm-card discord-global-card">
          <div class="discord-global-heading">
            <div>
              <h2 class="text-sm font-semibold text-gray-300">Global defaults</h2>
              <p>These settings apply when a guild or channel has no narrower override.</p>
            </div>
          </div>
          <div v-if="globalError" class="text-xs text-red-400 mb-3" role="alert">{{ globalError }}</div>
          <div class="discord-global-grid">
            <label class="discord-global-toggle">Require @mention by default
              <span class="toggle-switch"><input v-model="globalDraft.require_mention" type="checkbox" /><span class="toggle-slider"></span></span>
            </label>
            <label class="discord-global-toggle">Respond to bots by default
              <span class="toggle-switch"><input v-model="globalDraft.respond_to_bots" type="checkbox" /><span class="toggle-slider"></span></span>
            </label>
            <div v-for="editor in globalListEditors" :key="editor.key" :class="['discord-global-list', { 'discord-global-list-full': editor.userAutocomplete }]">
              <strong>{{ editor.label }}</strong>
              <p>{{ editor.description }}</p>
              <div class="cfgc-chip-list">
                <span v-for="item in globalDraft[editor.key]" :key="item" class="cfgc-chip">{{ item }}
                  <button type="button" @click="removeGlobalItem(editor.key, item)" :aria-label="'Remove ' + item">×</button>
                </span>
                <span v-if="!globalDraft[editor.key].length" class="cfgc-chip-empty">No entries</span>
              </div>
              <div v-if="editor.userAutocomplete" class="cfgc-chip-add discord-global-user-picker">
                <discord-user-combobox :members="globalMembers" :excluded-ids="globalDraft[editor.key]"
                                        :options-id="'discord-global-' + editor.key + '-options'"
                                        :placeholder="editor.placeholder" :aria-label="'Search ' + editor.label.toLowerCase()"
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
            <span>Saving changes only these global defaults. Guild and channel overrides remain untouched.</span>
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
                <label class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildEnabled(guild)"
                    @change="setGuildConfig(guild.id, 'enabled', $event.target.checked)" />
                  <span class="toggle-slider"></span>
                </label>
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-400">
                Require @mention
                <label class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildMention(guild)"
                    @change="setGuildConfig(guild.id, 'require_mention', $event.target.checked)" />
                  <span class="toggle-slider"></span>
                </label>
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-400">
                Respond to bots
                <label class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildBots(guild)"
                    @change="setGuildConfig(guild.id, 'respond_to_bots', $event.target.checked)" />
                  <span class="toggle-slider"></span>
                </label>
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
                        @change="setChannelConfig(ch.id, guild.id, 'enabled', $event.target.checked)" />
                      <span class="toggle-slider"></span>
                    </label>
                  </td>
                  <td class="text-center">
                    <label class="toggle-switch">
                      <input type="checkbox"
                        :checked="ch.effective.require_mention"
                        @change="setChannelConfig(ch.id, guild.id, 'require_mention', $event.target.checked)" />
                      <span class="toggle-slider"></span>
                    </label>
                  </td>
                  <td class="text-center">
                    <label class="toggle-switch">
                      <input type="checkbox"
                        :checked="ch.effective.respond_to_bots"
                        @change="setChannelConfig(ch.id, guild.id, 'respond_to_bots', $event.target.checked)" />
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
    const loading = ref(true);
    const error = ref(null);
    const expanded = ref({});
    const globalConfig = ref(null);
    const globalDraft = ref(null);
    const globalSaving = ref(false);
    const globalError = ref(null);
    const globalArrayInputs = ref({});
    const globalMembers = ref([]);
    const globalListEditors = Object.freeze([
      { key: 'allowed_users', label: 'Allowed users', description: 'Discord user IDs allowed by the global bot policy.', placeholder: 'Search Discord users…', userAutocomplete: true },
      { key: 'channels', label: 'Allowed channels', description: 'Channel IDs included by the global bot policy.', placeholder: 'Discord channel ID' },
      { key: 'ignore_bot_ids', label: 'Ignored bot IDs', description: 'Bot identities Odin never responds to automatically.', placeholder: 'Search Discord users or bots…', userAutocomplete: true },
    ]);
    const globalChanged = computed(() => JSON.stringify(globalConfig.value) !== JSON.stringify(globalDraft.value));

    function guildEnabled(guild) {
      if (guild.config && guild.config.enabled !== undefined) return guild.config.enabled;
      return true;
    }

    function guildMention(guild) {
      if (guild.config && guild.config.require_mention !== undefined) return guild.config.require_mention;
      return false;
    }

    function guildBots(guild) {
      if (guild.config && guild.config.respond_to_bots !== undefined) return guild.config.respond_to_bots;
      return false;
    }

    function hasOverride(ch) {
      return ch.config && Object.keys(ch.config).length > 0;
    }

    function toggleGuild(id) {
      expanded.value[id] = !expanded.value[id];
    }

    async function fetchGuilds() {
      loading.value = true;
      error.value = null;
      try {
        const [loadedGuilds, loadedMembers] = await Promise.all([
          api.get('/api/discord/guilds'),
          api.get('/api/discord/members').catch(() => []),
        ]);
        guilds.value = loadedGuilds;
        globalMembers.value = loadedMembers;
        try {
          const loadedConfig = await api.get('/api/config');
          const discord = loadedConfig.discord || {};
          globalConfig.value = {
            allowed_users: [...(discord.allowed_users || [])],
            channels: [...(discord.channels || [])],
            respond_to_bots: Boolean(discord.respond_to_bots),
            require_mention: Boolean(discord.require_mention),
            ignore_bot_ids: [...(discord.ignore_bot_ids || [])],
          };
          globalDraft.value = JSON.parse(JSON.stringify(globalConfig.value));
          globalError.value = null;
        } catch (globalLoadError) {
          globalError.value = globalLoadError.message || 'Global defaults could not be loaded.';
        }
      } catch (e) {
        error.value = e.message;
      }
      loading.value = false;
    }

    async function setGuildConfig(guildId, key, value) {
      try {
        await api.put('/api/discord/guild/' + guildId + '/config', { [key]: value });
        await fetchGuilds();
      } catch (e) {
        error.value = e.message;
      }
    }

    async function setChannelConfig(channelId, guildId, key, value) {
      try {
        await api.put('/api/discord/channel/' + channelId + '/config', { [key]: value });
        await fetchGuilds();
      } catch (e) {
        error.value = e.message;
      }
    }

    async function clearOverride(channelId, guildId) {
      try {
        await api.put('/api/discord/channel/' + channelId + '/config', { clear: true });
        await fetchGuilds();
      } catch (e) {
        error.value = e.message;
      }
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

    onMounted(fetchGuilds);

    return {
      guilds, loading, error, expanded, globalDraft, globalSaving, globalError, globalArrayInputs, globalMembers, globalListEditors, globalChanged,
      guildEnabled, guildMention, guildBots, hasOverride, toggleGuild,
      fetchGuilds, setGuildConfig, setChannelConfig, clearOverride, addGlobalItem, removeGlobalItem, saveGlobalDefaults,
    };
  },
};
