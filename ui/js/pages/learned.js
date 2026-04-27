/**
 * Learned Context page — view and manage reflector entries.
 */
import { api } from '../api.js';

const { ref, computed, onMounted } = Vue;

export default {
  template: `
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-xl font-semibold">Learned Context</h1>
          <p class="text-xs text-gray-500 mt-1" v-if="meta">
            {{ entries.length }} entries | Last reflection: {{ formatTime(meta.last_reflection) }}
          </p>
        </div>
        <button @click="fetchEntries" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>

      <div v-if="loading && entries.length === 0" class="space-y-2">
        <div v-for="n in 5" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state">
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchEntries" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="entries.length === 0" class="hm-card empty-state">
        <span class="empty-state-icon">🧠</span>
        <span class="empty-state-text">No learned entries yet</span>
        <span class="empty-state-hint">Odin learns from conversations automatically</span>
      </div>

      <div v-else class="space-y-2">
        <!-- Filter -->
        <div class="flex gap-2 mb-3">
          <button v-for="cat in categories" :key="cat"
                  @click="filterCat = filterCat === cat ? null : cat"
                  :class="['btn text-xs', filterCat === cat ? 'btn-primary' : 'btn-ghost']">
            {{ cat }} ({{ catCounts[cat] || 0 }})
          </button>
        </div>

        <!-- Entries -->
        <div v-for="entry in filtered" :key="entry.key" class="hm-card">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-mono text-sm text-white">{{ entry.key }}</span>
                <span :class="catBadge(entry.category)" class="badge text-xs">{{ entry.category }}</span>
                <span v-if="entry.user_id && entry.user_id !== 'global'" class="text-xs text-gray-500">
                  user: {{ entry.user_id }}
                </span>
              </div>
              <div v-if="editing === entry.key" class="mt-2">
                <textarea v-model="editContent" class="hm-input font-mono text-xs w-full" rows="3"></textarea>
                <div class="flex gap-2 mt-2">
                  <button @click="saveEdit(entry.key)" class="btn btn-primary text-xs">Save</button>
                  <button @click="editing = null" class="btn btn-ghost text-xs">Cancel</button>
                </div>
              </div>
              <p v-else class="text-sm text-gray-300 mt-1">{{ entry.content }}</p>
              <div class="text-xs text-gray-600 mt-1">
                Created: {{ formatTime(entry.created_at) }}
                <span v-if="entry.updated_at !== entry.created_at"> | Updated: {{ formatTime(entry.updated_at) }}</span>
              </div>
            </div>
            <div class="flex gap-1 shrink-0">
              <button @click="startEdit(entry)" class="btn btn-ghost text-xs" title="Edit">✏️</button>
              <button @click="deleteEntry(entry.key)" class="btn btn-ghost text-xs text-red-400" title="Delete">🗑️</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,

  setup() {
    const entries = ref([]);
    const meta = ref(null);
    const loading = ref(true);
    const error = ref(null);
    const filterCat = ref(null);
    const editing = ref(null);
    const editContent = ref('');

    const categories = computed(() => {
      const cats = new Set(entries.value.map(e => e.category));
      return [...cats].sort();
    });

    const catCounts = computed(() => {
      const counts = {};
      entries.value.forEach(e => { counts[e.category] = (counts[e.category] || 0) + 1; });
      return counts;
    });

    const filtered = computed(() => {
      if (!filterCat.value) return entries.value;
      return entries.value.filter(e => e.category === filterCat.value);
    });

    function catBadge(cat) {
      if (cat === 'correction') return 'badge-warning';
      if (cat === 'operational') return 'badge-info';
      if (cat === 'preference') return 'badge-success';
      return 'badge-info';
    }

    function formatTime(ts) {
      if (!ts) return '—';
      try {
        const d = new Date(ts);
        return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch { return ts; }
    }

    function startEdit(entry) {
      editing.value = entry.key;
      editContent.value = entry.content;
    }

    async function saveEdit(key) {
      try {
        await api.put('/api/learned/' + encodeURIComponent(key), { content: editContent.value });
        editing.value = null;
        await fetchEntries();
      } catch (e) {
        error.value = e.message;
      }
    }

    async function deleteEntry(key) {
      try {
        await api.del('/api/learned/' + encodeURIComponent(key));
        await fetchEntries();
      } catch (e) {
        error.value = e.message;
      }
    }

    async function fetchEntries() {
      loading.value = true;
      error.value = null;
      try {
        const data = await api.get('/api/learned');
        entries.value = data.entries || [];
        meta.value = { last_reflection: data.last_reflection, count: data.count };
      } catch (e) {
        error.value = e.message;
      }
      loading.value = false;
    }

    onMounted(fetchEntries);

    return {
      entries, meta, loading, error, filterCat, editing, editContent,
      categories, catCounts, filtered,
      catBadge, formatTime, startEdit, saveEdit, deleteEntry, fetchEntries,
    };
  },
};
