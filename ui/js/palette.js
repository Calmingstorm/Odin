/**
 * Command palette — keyboard-first navigation across all pages and tabs.
 */
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { TABS as OPERATIONS_TABS } from './pages/operations.js';
import { TABS as HISTORY_TABS } from './pages/history.js';
import { TABS as CAPABILITIES_TABS } from './pages/capabilities.js';
import { TABS as SYSTEM_TABS } from './pages/system.js';

// Derived from the SAME tab lists the host pages render, so a renamed or
// removed tab cannot leave the palette pointing at an id that silently falls
// back to the default tab.
const tabGroup = (group, icon, path, tabs) => tabs.map(({ id, label }) => ({
  group, label, icon, to: { path, query: { tab: id } },
}));

const DESTINATIONS = [
  { group: 'Workspace', label: 'Dashboard', icon: 'dashboard', to: { path: '/dashboard' } },
  { group: 'Workspace', label: 'Chat', icon: 'chat', to: { path: '/chat' } },
  ...tabGroup('Operations', 'operations', '/operations', OPERATIONS_TABS),
  ...tabGroup('History', 'history', '/history', HISTORY_TABS),
  ...tabGroup('Capabilities', 'capabilities', '/capabilities', CAPABILITIES_TABS),
  { group: 'Manage', label: 'Personality', icon: 'personality', to: { path: '/personality' } },
  ...tabGroup('System', 'system', '/system', SYSTEM_TABS),
];

const state = reactive({ open: false, query: '', selected: 0 });
export function openPalette() { state.query = ''; state.selected = 0; state.open = true; }
export function closePalette() { state.open = false; }

function score(dest, q) {
  const label = dest.label.toLowerCase();
  const full = `${dest.group} ${dest.label}`.toLowerCase();
  if (!q) return 1;
  if (label.startsWith(q)) return 100;
  if (full.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  if (full.includes(q)) return 40;
  return 0;
}

export const CommandPalette = {
  setup() {
    const router = useRouter();
    const inputEl = ref(null);
    const results = computed(() => {
      const q = state.query.trim().toLowerCase();
      return DESTINATIONS.map(d => ({ ...d, _score: score(d, q) }))
        .filter(d => d._score > 0).sort((a, b) => b._score - a._score);
    });
    watch(() => state.open, async open => { if (open) { await nextTick(); inputEl.value?.focus(); } });
    watch(() => state.query, () => { state.selected = 0; });
    function go(dest) { closePalette(); router.push(dest.to); }
    function onKeydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); closePalette(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); state.selected = Math.min(state.selected + 1, results.value.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); state.selected = Math.max(state.selected - 1, 0); }
      else if (e.key === 'Enter') { e.preventDefault(); const dest = results.value[state.selected]; if (dest) go(dest); }
    }
    return { state, results, inputEl, go, onKeydown, closePalette };
  },
  template: `
    <transition name="modal">
      <div v-if="state.open" class="modal-overlay palette-overlay" @click.self="closePalette()" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="palette" v-modal-focus tabindex="-1">
          <div class="palette-search"><odin-icon name="search" :size="19" />
            <input ref="inputEl" v-model="state.query" type="text" class="palette-input"
              placeholder="Search pages and sections" aria-label="Search pages" role="combobox"
              :aria-activedescendant="results[state.selected] ? 'palette-option-' + state.selected : undefined"
              aria-autocomplete="list" aria-expanded="true" aria-controls="palette-results" @keydown="onKeydown" />
          </div>
          <div id="palette-results" class="palette-results" role="listbox">
            <div v-if="!results.length" class="palette-empty">No destinations match your search.</div>
            <button v-for="(r, i) in results" :key="r.group + '-' + r.label"
              :id="'palette-option-' + i" class="palette-item" :class="{ selected: i === state.selected }" role="option"
              :aria-selected="i === state.selected" @click="go(r)" @mousemove="state.selected = i">
              <span class="palette-icon" aria-hidden="true"><odin-icon :name="r.icon" :size="17" /></span>
              <span class="palette-copy"><span class="palette-label">{{ r.label }}</span><span class="palette-group">{{ r.group }}</span></span>
              <odin-icon name="chevronRight" :size="15" class="palette-arrow" />
            </button>
          </div>
          <div class="palette-footer"><span><kbd>Up/Down</kbd> Navigate</span><span><kbd>Enter</kbd> Open</span><span><kbd>Esc</kbd> Close</span></div>
        </div>
      </div>
    </transition>
  `,
};
