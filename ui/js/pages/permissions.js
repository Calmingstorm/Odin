import { api } from '../api.js';
import { onMounted, ref } from 'vue';

export default {
  template: `
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">Permissions</h1>
        <button @click="fetchData" class="btn btn-ghost text-xs">Refresh</button>
      </div>
      <div v-if="error" class="hm-card border-red-900 text-red-400">{{ error }}</div>
      <div v-else-if="loading" class="text-gray-400">Loading permissions...</div>
      <div v-else class="space-y-4">
        <div v-if="data.store_corrupt" class="hm-card border-red-900 text-red-400" role="alert">
          Permissions store is corrupt. Writes are blocked until the file is repaired.
        </div>
        <div v-if="Object.keys(data.invalid_overrides || {}).length" class="hm-card border-yellow-800" role="alert">
          <h2 class="font-semibold text-yellow-400 mb-2">Unrecognized permission tiers</h2>
          <p class="text-xs text-gray-400 mb-3">These entries are retained on unrelated writes. Effective tiers remain unchanged. Choose a valid tier to repair an entry or remove it.</p>
          <ul class="space-y-1 text-sm">
            <li v-for="(tier, uid) in data.invalid_overrides" :key="uid">
              <span class="font-mono">{{ uid }}</span>: <span class="font-mono">{{ tier }}</span>
              <select v-model="repairTiers[uid]" class="hm-input text-xs ml-2">
                <option value="admin">admin</option><option value="user">user</option><option value="guest">guest</option>
              </select>
              <button @click="repair(uid)" class="btn btn-ghost text-xs ml-1">Repair</button>
              <button @click="removeInvalid(uid)" class="text-red-400 hover:text-red-300 text-xs ml-2">Remove</button>
            </li>
          </ul>
        </div>
        <div class="hm-card">
          <p class="text-sm text-gray-300">Default tier: <strong>{{ data.default_tier }}</strong></p>
          <h2 class="text-sm font-semibold mt-4 mb-2">Configured tiers</h2>
          <p v-if="!Object.keys(data.config_tiers || {}).length" class="text-xs text-gray-500">None</p>
          <ul v-else class="text-sm space-y-1"><li v-for="(tier, uid) in data.config_tiers" :key="uid"><span class="font-mono">{{ uid }}</span>: {{ tier }}</li></ul>
          <h2 class="text-sm font-semibold mt-4 mb-2">Active overrides</h2>
          <p v-if="!Object.keys(data.overrides || {}).length" class="text-xs text-gray-500">None</p>
          <ul v-else class="text-sm space-y-1"><li v-for="(tier, uid) in data.overrides" :key="uid"><span class="font-mono">{{ uid }}</span>: {{ tier }}</li></ul>
        </div>
      </div>
    </div>
  `,
  setup() {
    const data = ref({});
    const loading = ref(true);
    const error = ref('');
    const repairTiers = ref({});
    async function repair(uid) {
      try { await api.post(`/api/permissions/user/${encodeURIComponent(uid)}/repair`, { tier: repairTiers.value[uid] || 'user' }); await fetchData(); }
      catch (e) { error.value = e.message || 'Failed to repair permission'; }
    }
    async function removeInvalid(uid) {
      try { await api.del(`/api/permissions/user/${encodeURIComponent(uid)}/repair`); await fetchData(); }
      catch (e) { error.value = e.message || 'Failed to remove permission'; }
    }
    async function fetchData() {
      loading.value = true;
      error.value = '';
      try { data.value = await api.get('/api/permissions/tiers'); }
      catch (e) { error.value = e.message || 'Failed to load permissions'; }
      finally { loading.value = false; }
    }
    onMounted(fetchData);
    return { data, loading, error, fetchData, repairTiers, repair, removeInvalid };
  },
};
