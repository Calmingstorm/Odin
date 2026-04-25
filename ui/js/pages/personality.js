import { api } from '../api.js';

const { ref, computed, onMounted } = Vue;

export default {
  setup() {
    const preset = ref('odin');
    const customIdentity = ref('');
    const customVoice = ref('');
    const presets = ref({});
    const saving = ref(false);
    const saved = ref(false);
    const error = ref(null);
    const loading = ref(true);

    const isCustom = computed(() => preset.value === 'custom');
    const presetNames = computed(() => Object.keys(presets.value));

    const previewIdentity = computed(() => {
      if (isCustom.value) return customIdentity.value || '(empty — will use Odin default)';
      return presets.value[preset.value]?.identity || '';
    });

    const previewVoice = computed(() => {
      if (isCustom.value) return customVoice.value || '(empty — will use Odin default)';
      return presets.value[preset.value]?.voice || '';
    });

    async function load() {
      loading.value = true;
      try {
        const data = await api.get('/api/personality');
        preset.value = data.preset || 'odin';
        customIdentity.value = data.custom_identity || '';
        customVoice.value = data.custom_voice || '';
        presets.value = data.presets || {};
      } catch (e) {
        error.value = e.message;
      } finally {
        loading.value = false;
      }
    }

    async function save() {
      saving.value = true;
      error.value = null;
      saved.value = false;
      try {
        await api.put('/api/personality', {
          preset: preset.value,
          custom_identity: customIdentity.value,
          custom_voice: customVoice.value,
        });
        saved.value = true;
        setTimeout(() => saved.value = false, 3000);
      } catch (e) {
        error.value = e.message;
      } finally {
        saving.value = false;
      }
    }

    onMounted(load);

    return { preset, customIdentity, customVoice, presets, presetNames, isCustom,
             previewIdentity, previewVoice, saving, saved, error, loading, save };
  },

  template: `
  <div class="space-y-6 max-w-3xl">
    <div>
      <h2 class="text-lg font-semibold mb-1">Personality</h2>
      <p class="text-gray-400 text-sm">Configure how Odin presents itself. Changes apply immediately — no restart needed.</p>
    </div>

    <div v-if="loading" class="flex items-center gap-2 text-gray-400">
      <span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Loading...
    </div>

    <template v-else>
      <!-- Preset selector -->
      <div class="hm-card">
        <label class="block text-sm font-medium mb-2">Preset</label>
        <select v-model="preset" class="hm-input w-full max-w-xs">
          <option v-for="name in presetNames" :key="name" :value="name">{{ name.charAt(0).toUpperCase() + name.slice(1) }}</option>
          <option value="custom">Custom</option>
        </select>
        <p class="text-gray-500 text-xs mt-1">Select a personality preset or choose Custom to write your own.</p>
      </div>

      <!-- Custom fields -->
      <div v-if="isCustom" class="hm-card space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Identity</label>
          <textarea v-model="customIdentity" class="hm-input w-full" rows="4"
            placeholder="Describe who the bot is — background, role, perspective..."></textarea>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Voice</label>
          <textarea v-model="customVoice" class="hm-input w-full" rows="6"
            placeholder="Define communication style — tone, formatting, constraints. Use one rule per line starting with -"></textarea>
        </div>
      </div>

      <!-- Preview -->
      <div class="hm-card">
        <h3 class="text-sm font-medium mb-2">Preview</h3>
        <div class="bg-gray-900 rounded-lg p-4 text-sm space-y-3">
          <div>
            <span class="text-gray-500 text-xs uppercase tracking-wide">Identity</span>
            <p class="text-gray-300 mt-1 whitespace-pre-wrap">{{ previewIdentity }}</p>
          </div>
          <div>
            <span class="text-gray-500 text-xs uppercase tracking-wide">Voice</span>
            <p class="text-gray-300 mt-1 whitespace-pre-wrap">{{ previewVoice }}</p>
          </div>
        </div>
      </div>

      <!-- Save -->
      <div class="flex items-center gap-3">
        <button @click="save" :disabled="saving" class="btn btn-primary">
          <span v-if="saving" class="spinner" style="width:14px;height:14px;border-width:2px;"></span>
          {{ saving ? 'Saving...' : 'Save & Apply' }}
        </button>
        <span v-if="saved" class="text-green-400 text-sm">Applied successfully</span>
        <span v-if="error" class="text-red-400 text-sm">{{ error }}</span>
      </div>
    </template>
  </div>
  `,
};
