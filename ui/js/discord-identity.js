import { computed, onMounted, ref, watch } from 'vue';
import { api } from './api.js';

const DISCORD_SNOWFLAKE = /^\d{15,25}$/;
const identityCache = new Map();
const pending = new Map();
let guildMembers = null;
let guildMembersRequest = null;

async function getGuildMembers() {
  if (guildMembers) return guildMembers;
  if (!guildMembersRequest) {
    guildMembersRequest = api.get('/api/discord/members')
      .then(members => {
        guildMembers = Array.isArray(members) ? members : [];
        return guildMembers;
      })
      .catch(() => [])
      .finally(() => { guildMembersRequest = null; });
  }
  return guildMembersRequest;
}

async function lookupDiscordIdentity(id) {
  if (!DISCORD_SNOWFLAKE.test(String(id))) return null;
  const member = (await getGuildMembers()).find(item => String(item.id) === String(id));
  if (member) {
    identityCache.set(String(id), member);
    return member;
  }
  if (identityCache.has(String(id))) return identityCache.get(String(id));
  if (!pending.has(String(id))) {
    pending.set(String(id), api.get(`/api/discord/users/${encodeURIComponent(id)}`)
      .then(data => data?.user || null).catch(() => null)
      .then(user => {
        if (user) identityCache.set(String(id), user);
        pending.delete(String(id));
        return user;
      }));
  }
  return pending.get(String(id));
}

export const DiscordIdentity = {
  props: {
    userId: { type: [String, Number], required: true },
    members: { type: Array, default: () => [] },
    showId: { type: Boolean, default: true },
    fallbackLabel: { type: String, default: '' },
  },
  template: `
    <span class="inline-flex items-center gap-1.5" :title="String(userId)">
      <template v-if="identity">
        <img v-if="identity.avatar_url" :src="identity.avatar_url + '?size=32'" alt=""
             class="w-5 h-5 rounded-full" />
        <span v-else class="w-5 h-5 rounded-full bg-gray-700 inline-flex items-center justify-center text-xs text-gray-400">
          {{ (identity.display_name || identity.username || '?').charAt(0) }}
        </span>
        <span class="text-gray-200">{{ identity.display_name || identity.username }}</span>
        <span v-if="identity.username && identity.username !== identity.display_name" class="text-gray-500 text-xs">{{ identity.username }}</span>
        <span v-if="identity.bot" class="text-xs px-1 rounded bg-indigo-900 text-indigo-300">BOT</span>
      </template>
      <span v-else class="text-gray-200">{{ displayFallback }}</span>
      <span v-if="showId && identity" class="text-gray-500 text-xs font-mono">{{ userId }}</span>
    </span>
  `,
  setup(props) {
    const fetched = ref(null);
    const member = computed(() => (props.members || []).find(item => String(item.id) === String(props.userId)) || null);
    const identity = computed(() => member.value || fetched.value);
    const displayFallback = computed(() => DISCORD_SNOWFLAKE.test(String(props.userId))
      ? props.userId : (props.fallbackLabel || props.userId));
    async function resolve() {
      fetched.value = null;
      if (DISCORD_SNOWFLAKE.test(String(props.userId)) && !member.value)
        fetched.value = await lookupDiscordIdentity(props.userId);
    }
    watch(() => [props.userId, props.members], resolve, { deep: true });
    onMounted(resolve);
    return { identity, displayFallback };
  },
};

export { lookupDiscordIdentity };
export default DiscordIdentity;
