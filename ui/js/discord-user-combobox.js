import { computed, nextTick, onMounted, ref } from 'vue';

const DISCORD_ID = /^\d{15,25}$/;

/**
 * Reusable Discord-member picker.
 *
 * Host Access and Discord's global policy editors intentionally share this
 * component and the `/api/discord/members` response shape. Unknown users can
 * still be entered by snowflake ID, which keeps the control useful for people
 * who are not currently visible in a mutual guild.
 */
export const DiscordUserCombobox = {
  props: {
    members: { type: Array, default: () => [] },
    excludedIds: { type: Array, default: () => [] },
    placeholder: { type: String, default: 'Search Discord users…' },
    ariaLabel: { type: String, default: 'Search Discord users' },
    optionsId: { type: String, required: true },
    autofocus: { type: Boolean, default: false },
  },
  emits: ['select'],
  template: `
    <div class="discord-user-combobox">
      <input ref="input" v-model="query" type="text" class="hm-input"
             :placeholder="placeholder" role="combobox" :aria-label="ariaLabel"
             aria-autocomplete="list" :aria-expanded="open" :aria-controls="optionsId"
             :aria-activedescendant="activeOptionId"
             @focus="openOptions" @input="onInput"
             @keydown.down.prevent="highlightNext" @keydown.up.prevent="highlightPrevious"
             @keydown.enter.prevent="selectHighlighted" @keydown.escape="closeOptions"
             @blur="onBlur" />
      <div v-if="open && (filteredMembers.length || rawId)" :id="optionsId" role="listbox"
           class="discord-user-combobox-options">
        <button v-for="(member, index) in filteredMembers" :key="member.id" type="button"
                :id="optionsId + '-' + index" role="option" :aria-selected="index === highlightedIndex"
                :class="['discord-user-combobox-option', { active: index === highlightedIndex }]"
                @mousedown.prevent="selectMember(member)">
          <img v-if="member.avatar_url" :src="member.avatar_url + '?size=24'" alt="" />
          <span v-else class="discord-user-combobox-avatar">{{ memberName(member).charAt(0) }}</span>
          <span class="discord-user-combobox-name">{{ memberName(member) }}</span>
          <span class="discord-user-combobox-username">{{ member.username }}</span>
          <span v-if="member.bot" class="discord-user-combobox-bot">BOT</span>
        </button>
        <button v-if="rawId" type="button" :id="optionsId + '-raw'" role="option"
                :aria-selected="highlightedIndex === 0" class="discord-user-combobox-option"
                :class="{ active: highlightedIndex === 0 }" @mousedown.prevent="selectId(rawId)">
          <span class="discord-user-combobox-avatar">?</span>
          <span class="discord-user-combobox-name">Add by ID: {{ rawId }}</span>
          <span class="discord-user-combobox-username">press Enter</span>
        </button>
      </div>
    </div>
  `,
  setup(props, { emit }) {
    const query = ref('');
    const open = ref(false);
    const highlightedIndex = ref(0);
    const input = ref(null);

    const excluded = computed(() => new Set((props.excludedIds || []).map(String)));
    const filteredMembers = computed(() => {
      const needle = query.value.toLowerCase().trim();
      return (props.members || []).filter(member => {
        if (excluded.value.has(String(member.id))) return false;
        if (!needle) return true;
        return memberName(member).toLowerCase().includes(needle)
          || String(member.username || '').toLowerCase().includes(needle)
          || String(member.id).includes(needle);
      });
    });
    const rawId = computed(() => {
      const value = query.value.trim();
      return filteredMembers.value.length === 0
        && DISCORD_ID.test(value)
        && !excluded.value.has(value)
        ? value
        : '';
    });
    const optionCount = computed(() => filteredMembers.value.length + (rawId.value ? 1 : 0));
    const activeOptionId = computed(() => {
      if (!open.value) return undefined;
      if (filteredMembers.value[highlightedIndex.value]) {
        return `${props.optionsId}-${highlightedIndex.value}`;
      }
      if (rawId.value && highlightedIndex.value === filteredMembers.value.length) return `${props.optionsId}-raw`;
      return undefined;
    });

    function memberName(member) {
      return String(member?.display_name || member?.username || member?.id || 'Unknown user');
    }

    function openOptions() {
      open.value = true;
      highlightedIndex.value = 0;
    }

    function onInput() {
      openOptions();
    }

    function highlightNext() {
      const last = Math.max(optionCount.value - 1, 0);
      highlightedIndex.value = Math.min(highlightedIndex.value + 1, last);
    }

    function highlightPrevious() {
      highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0);
    }

    function selectHighlighted() {
      const member = filteredMembers.value[highlightedIndex.value];
      if (member) selectMember(member);
      else if (rawId.value && highlightedIndex.value === filteredMembers.value.length) selectId(rawId.value);
    }

    function selectMember(member) {
      selectId(String(member.id));
    }

    function selectId(id) {
      emit('select', id);
      query.value = '';
      open.value = false;
      highlightedIndex.value = 0;
    }

    function closeOptions() {
      open.value = false;
    }

    function onBlur() {
      setTimeout(closeOptions, 150);
    }

    onMounted(() => {
      if (props.autofocus) nextTick(() => input.value?.focus());
    });

    return {
      query, open, highlightedIndex, input, filteredMembers, rawId, activeOptionId,
      memberName, openOptions, onInput, highlightNext, highlightPrevious,
      selectHighlighted, selectMember, selectId, closeOptions, onBlur,
    };
  },
};
