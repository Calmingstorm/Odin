/**
 * Odin Management UI — Command Palette (Ctrl+K / Cmd+K)
 *
 * Fuzzy jump to any page or tab. The destination list mirrors the route
 * table in app.js and the tab lists in the four group pages — update it
 * when adding a page or tab.
 *
 * The <command-palette> component is mounted once in app.js, which also
 * owns the Ctrl+K keybinding (calls openPalette()).
 */
const { reactive, computed, nextTick } = Vue;

// Group › Label → route. Keep in sync with app.js routes and group tabs.
const DESTINATIONS = [
  { group: '', label: 'Dashboard', icon: '\u{1F4CA}', to: { path: '/dashboard' } },
  { group: '', label: 'Chat', icon: '\u{1F4AD}', to: { path: '/chat' } },
  { group: 'Operations', label: 'Live', icon: '\u{1F3AF}', to: { path: '/operations', query: { tab: 'live' } } },
  { group: 'Operations', label: 'Agents', icon: '\u{1F3AF}', to: { path: '/operations', query: { tab: 'agents' } } },
  { group: 'Operations', label: 'Loops', icon: '\u{1F3AF}', to: { path: '/operations', query: { tab: 'loops' } } },
  { group: 'Operations', label: 'Processes', icon: '\u{1F3AF}', to: { path: '/operations', query: { tab: 'processes' } } },
  { group: 'Operations', label: 'Schedules', icon: '\u{1F3AF}', to: { path: '/operations', query: { tab: 'schedules' } } },
  { group: 'History', label: 'Audit', icon: '\u{1F4DD}', to: { path: '/history', query: { tab: 'audit' } } },
  { group: 'History', label: 'Sessions', icon: '\u{1F4DD}', to: { path: '/history', query: { tab: 'sessions' } } },
  { group: 'History', label: 'Traces', icon: '\u{1F4DD}', to: { path: '/history', query: { tab: 'traces' } } },
  { group: 'History', label: 'Usage', icon: '\u{1F4DD}', to: { path: '/history', query: { tab: 'usage' } } },
  { group: 'Capabilities', label: 'Tools', icon: '\u{1F527}', to: { path: '/capabilities', query: { tab: 'tools' } } },
  { group: 'Capabilities', label: 'Skills', icon: '\u{1F527}', to: { path: '/capabilities', query: { tab: 'skills' } } },
  { group: 'Capabilities', label: 'Knowledge', icon: '\u{1F527}', to: { path: '/capabilities', query: { tab: 'knowledge' } } },
  { group: 'Capabilities', label: 'Memory', icon: '\u{1F527}', to: { path: '/capabilities', query: { tab: 'memory' } } },
  { group: 'Capabilities', label: 'Learned', icon: '\u{1F527}', to: { path: '/capabilities', query: { tab: 'learned' } } },
  { group: '', label: 'Personality', icon: '\u{1F3AD}', to: { path: '/personality' } },
  { group: 'System', label: 'Health', icon: '⚙️', to: { path: '/system', query: { tab: 'health' } } },
  { group: 'System', label: 'Resources', icon: '⚙️', to: { path: '/system', query: { tab: 'resources' } } },
  { group: 'System', label: 'Logs', icon: '⚙️', to: { path: '/system', query: { tab: 'logs' } } },
  { group: 'System', label: 'Config', icon: '⚙️', to: { path: '/system', query: { tab: 'config' } } },
  { group: 'System', label: 'Discord', icon: '⚙️', to: { path: '/system', query: { tab: 'discord' } } },
  { group: 'System', label: 'Host Access', icon: '⚙️', to: { path: '/system', query: { tab: 'host-access' } } },
  { group: 'System', label: 'API Tokens', icon: '⚙️', to: { path: '/system', query: { tab: 'api-tokens' } } },
  { group: 'System', label: 'LLM Config', icon: '⚙️', to: { path: '/system', query: { tab: 'llm' } } },
  { group: 'System', label: 'Internals', icon: '⚙️', to: { path: '/system', query: { tab: 'internals' } } },
  { group: 'System', label: 'Update', icon: '⚙️', to: { path: '/system', query: { tab: 'update' } } },
];

const state = reactive({ open: false, query: '', selected: 0 });

export function openPalette() {
  state.query = '';
  state.selected = 0;
  state.open = true;
}

export function closePalette() {
  state.open = false;
}

/** Rank: prefix match on label > prefix on full path > substring. */
function score(dest, q) {
  const label = dest.label.toLowerCase();
  const full = (dest.group ? dest.group + ' ' : '') + dest.label;
  const fullLower = full.toLowerCase();
  if (!q) return 1;
  if (label.startsWith(q)) return 100;
  if (fullLower.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  if (fullLower.includes(q)) return 40;
  return 0;
}

export const CommandPalette = {
  setup() {
    const { useRouter } = VueRouter;
    const router = useRouter();
    const inputEl = Vue.ref(null);

    const results = computed(() => {
      const q = state.query.trim().toLowerCase();
      return DESTINATIONS
        .map(d => ({ ...d, _score: score(d, q) }))
        .filter(d => d._score > 0)
        .sort((a, b) => b._score - a._score);
    });

    Vue.watch(() => state.open, async (open) => {
      if (open) {
        await nextTick();
        inputEl.value?.focus();
      }
    });

    Vue.watch(() => state.query, () => { state.selected = 0; });

    function go(dest) {
      closePalette();
      router.push(dest.to);
    }

    function onKeydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); closePalette(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.selected = Math.min(state.selected + 1, results.value.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.selected = Math.max(state.selected - 1, 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const dest = results.value[state.selected];
        if (dest) go(dest);
      }
    }

    return { state, results, inputEl, go, onKeydown, closePalette };
  },
  template: `
    <transition name="modal">
      <div v-if="state.open" class="modal-overlay palette-overlay" @click.self="closePalette()" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="palette">
          <input
            ref="inputEl"
            v-model="state.query"
            type="text"
            class="palette-input"
            placeholder="Jump to page or tab…"
            aria-label="Search pages"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            @keydown="onKeydown"
          />
          <div id="palette-results" class="palette-results" role="listbox">
            <div v-if="!results.length" class="palette-empty">No matches</div>
            <button
              v-for="(r, i) in results"
              :key="(r.group || 'top') + '-' + r.label"
              class="palette-item"
              :class="{ selected: i === state.selected }"
              role="option"
              :aria-selected="i === state.selected"
              @click="go(r)"
              @mousemove="state.selected = i"
            >
              <span class="palette-icon" aria-hidden="true">{{ r.icon }}</span>
              <span v-if="r.group" class="palette-group">{{ r.group }} ›</span>
              <span class="palette-label">{{ r.label }}</span>
            </button>
          </div>
          <div class="palette-footer">
            <kbd>↑↓</kbd> navigate <kbd>↵</kbd> open <kbd>Esc</kbd> close
          </div>
        </div>
      </div>
    </transition>
  `,
};
