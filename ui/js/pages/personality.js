import { api } from '../api.js';

const { ref, computed, onMounted } = Vue;

export default {
  setup() {
    const preset = ref('odin');
    const customName = ref('');
    const customIdentity = ref('');
    const customVoice = ref('');
    const presets = ref({});
    const builtinPresets = ref([]);
    const userPresets = ref([]);
    const saving = ref(false);
    const saved = ref(false);
    const error = ref(null);
    const loading = ref(true);
    const newPresetName = ref('');
    const showSavePreset = ref(false);
    const savingPreset = ref(false);

    const isCustom = computed(() => preset.value === 'custom');
    const presetNames = computed(() => [...builtinPresets.value, ...userPresets.value]);
    const isUserPreset = computed(() => userPresets.value.includes(preset.value));

    const previewName = computed(() => {
      if (isCustom.value) return customName.value || 'Odin';
      return presets.value[preset.value]?.name || preset.value;
    });

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
        customName.value = data.custom_name || '';
        customIdentity.value = data.custom_identity || '';
        customVoice.value = data.custom_voice || '';
        presets.value = data.presets || {};
        builtinPresets.value = data.builtin_presets || [];
        userPresets.value = data.user_presets || [];
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
          custom_name: customName.value,
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

    async function saveAsPreset() {
      const name = newPresetName.value.trim();
      if (!name) return;
      savingPreset.value = true;
      error.value = null;
      try {
        await api.post('/api/personality/presets', {
          name,
          display_name: previewName.value,
          identity: previewIdentity.value,
          voice: previewVoice.value,
        });
        showSavePreset.value = false;
        newPresetName.value = '';
        await load();
        preset.value = name.toLowerCase().replace(/ /g, '_');
      } catch (e) {
        error.value = e.message;
      } finally {
        savingPreset.value = false;
      }
    }

    async function deletePreset() {
      if (!confirm(`Delete preset "${preset.value}"?`)) return;
      error.value = null;
      try {
        await api.del(`/api/personality/presets/${preset.value}`);
        await load();
        preset.value = 'odin';
      } catch (e) {
        error.value = e.message;
      }
    }

    onMounted(load);

    return { preset, customName, customIdentity, customVoice, presets, presetNames, isCustom, isUserPreset,
             previewName, previewIdentity, previewVoice, saving, saved, error, loading, save,
             showSavePreset, newPresetName, savingPreset, saveAsPreset, deletePreset,
             builtinPresets, userPresets };
  },

  template: `
  <div class="p-6 space-y-6 max-w-3xl">
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
        <div class="flex items-center gap-2">
          <select v-model="preset" class="hm-input max-w-xs">
            <optgroup label="Built-in">
              <option v-for="name in builtinPresets" :key="name" :value="name">{{ name.charAt(0).toUpperCase() + name.slice(1) }}</option>
            </optgroup>
            <optgroup v-if="userPresets.length" label="Custom presets">
              <option v-for="name in userPresets" :key="name" :value="name">{{ name.charAt(0).toUpperCase() + name.slice(1) }}</option>
            </optgroup>
            <optgroup label="Other">
              <option value="custom">Custom</option>
            </optgroup>
          </select>
          <button v-if="isUserPreset" @click="deletePreset" class="btn btn-ghost text-red-400 text-xs">Delete</button>
        </div>
        <p class="text-gray-500 text-xs mt-1">Select a personality preset or choose Custom to write your own.</p>
      </div>

      <!-- Custom fields -->
      <div v-if="isCustom" class="hm-card space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Name</label>
          <input v-model="customName" class="hm-input w-full max-w-xs" placeholder="e.g. Muninn, Heimdall, Loki..." />
          <p class="text-gray-500 text-xs mt-1">The bot's name as used in prompts and responses.</p>
        </div>
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
            <span class="text-gray-500 text-xs uppercase tracking-wide">Name</span>
            <p class="text-gray-300 mt-1 font-semibold">{{ previewName }}</p>
          </div>
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

      <!-- Save actions -->
      <div class="flex items-center gap-3 flex-wrap">
        <button @click="save" :disabled="saving" class="btn btn-primary">
          <span v-if="saving" class="spinner" style="width:14px;height:14px;border-width:2px;"></span>
          {{ saving ? 'Saving...' : 'Save & Apply' }}
        </button>
        <button @click="showSavePreset = !showSavePreset" class="btn btn-ghost text-sm">
          {{ showSavePreset ? 'Cancel' : 'Save as preset...' }}
        </button>
        <span v-if="saved" class="text-green-400 text-sm">Applied successfully</span>
        <span v-if="error" class="text-red-400 text-sm">{{ error }}</span>
      </div>

      <!-- Save as preset form -->
      <div v-if="showSavePreset" class="hm-card">
        <label class="block text-sm font-medium mb-2">New preset name</label>
        <div class="flex items-center gap-2">
          <input v-model="newPresetName" class="hm-input max-w-xs" placeholder="e.g. incident-commander"
            @keyup.enter="saveAsPreset" />
          <button @click="saveAsPreset" :disabled="savingPreset || !newPresetName.trim()" class="btn btn-primary text-sm">
            {{ savingPreset ? 'Saving...' : 'Save preset' }}
          </button>
        </div>
        <p class="text-gray-500 text-xs mt-1">Saves the current preview as a reusable preset.</p>
      </div>
    </template>
  </div>
  `,
};
