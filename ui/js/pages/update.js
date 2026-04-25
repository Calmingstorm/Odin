import { api } from '../api.js';

const { ref, onMounted } = Vue;

export default {
  setup() {
    const current = ref('');
    const latest = ref('');
    const updateAvailable = ref(false);
    const changelog = ref('');
    const checking = ref(false);
    const applying = ref(false);
    const applied = ref(false);
    const error = ref(null);
    const checkDone = ref(false);

    async function checkUpdate() {
      checking.value = true;
      error.value = null;
      checkDone.value = false;
      try {
        const data = await api.get('/api/update/check');
        current.value = data.current || '';
        latest.value = data.latest || '';
        updateAvailable.value = data.update_available || false;
        changelog.value = data.changelog || '';
        if (data.error) error.value = data.error;
        checkDone.value = true;
      } catch (e) {
        error.value = e.message;
      } finally {
        checking.value = false;
      }
    }

    async function applyUpdate() {
      if (!confirm('Update Odin and restart? Active tasks will be interrupted.')) return;
      applying.value = true;
      error.value = null;
      try {
        await api.post('/api/update/apply', { version: 'latest' });
        applied.value = true;
        setTimeout(() => location.reload(), 8000);
      } catch (e) {
        error.value = e.message;
      } finally {
        applying.value = false;
      }
    }

    onMounted(checkUpdate);

    return { current, latest, updateAvailable, changelog, checking, applying, applied, error, checkDone,
             checkUpdate, applyUpdate };
  },

  template: `
  <div class="p-6 space-y-6 max-w-2xl">
    <div>
      <h2 class="text-lg font-semibold mb-1">Updates</h2>
      <p class="text-gray-400 text-sm">Check for new Odin releases and apply updates.</p>
    </div>

    <!-- Current version -->
    <div class="hm-card">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-gray-400 text-sm">Current version</span>
          <p class="text-lg font-mono font-semibold">{{ current || '...' }}</p>
        </div>
        <button @click="checkUpdate" :disabled="checking" class="btn btn-ghost">
          <span v-if="checking" class="spinner" style="width:14px;height:14px;border-width:2px;"></span>
          {{ checking ? 'Checking...' : 'Check for updates' }}
        </button>
      </div>
    </div>

    <!-- Update available -->
    <div v-if="checkDone && updateAvailable" class="hm-card border-blue-500/30">
      <div class="flex items-center gap-2 mb-3">
        <span class="w-2 h-2 bg-blue-400 rounded-full"></span>
        <span class="font-medium">Update available: {{ latest }}</span>
      </div>
      <div v-if="changelog" class="bg-gray-900 rounded-lg p-4 text-sm text-gray-300 mb-4 max-h-64 overflow-y-auto whitespace-pre-wrap">{{ changelog }}</div>
      <button @click="applyUpdate" :disabled="applying" class="btn btn-primary">
        <span v-if="applying" class="spinner" style="width:14px;height:14px;border-width:2px;"></span>
        {{ applying ? 'Updating...' : 'Update & Restart' }}
      </button>
    </div>

    <!-- No update -->
    <div v-if="checkDone && !updateAvailable && !error" class="hm-card">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 bg-green-400 rounded-full"></span>
        <span class="text-gray-300">You're running the latest version.</span>
      </div>
    </div>

    <!-- Applied -->
    <div v-if="applied" class="hm-card border-green-500/30">
      <div class="flex items-center gap-2">
        <span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
        <span class="text-green-400">Update applied. Restarting... This page will reload automatically.</span>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="hm-card border-red-500/30">
      <p class="text-red-400 text-sm">{{ error }}</p>
    </div>
  </div>
  `,
};
