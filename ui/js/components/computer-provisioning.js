/** Desired-state editor only. Lifecycle enable/revoke remains on its dedicated API. */
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';
import { api } from '../api.js';

const clone = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default {
  emits: ['saved'],
  template: `
    <section class="hm-card computer-provisioning" aria-labelledby="computer-provisioning-title">
      <div class="section-card-header">
        <div>
          <h2 id="computer-provisioning-title" class="text-sm font-semibold text-gray-300">Computer provisioning</h2>
          <p class="page-lede">Edit desired target, storage and launcher policy. All settings below require an Odin restart. Startup values remain pinned, even across disable/enable cycles.</p>
        </div>
        <span class="badge badge-warning">Restart required</span>
      </div>
      <p class="page-lede mb-3">Saving does not install dependencies, create storage, grant OS permissions, attach to a desktop or restart Odin. Enable/disable and Stop session are separate lifecycle controls above.</p>
      <p v-if="message" class="text-sm text-amber-300 mb-3" role="status">{{ message }}</p>
      <p v-if="error" class="text-sm text-red-400 mb-3" role="alert">{{ error }}</p>
      <p v-if="loading" class="page-lede" role="status">Loading desired configuration and restart metadata…</p>
      <p v-if="ready" class="page-lede mb-3">{{ pending.length ? 'Saved settings still pending restart: ' + pending.join(', ') : 'No pending provisioning restart reported.' }}</p>
      <p v-if="ready && effectiveUnknown" class="page-lede mb-3">Some startup values are unknown; absence of a pending flag does not prove those settings are active.</p>
      <form v-if="ready" @submit.prevent="openReview">
        <fieldset :disabled="loading || saving || reviewing || uncertain" class="computer-provisioning-fields">
          <legend class="sr-only">Desired computer settings</legend>
          <div v-for="field in fields" :key="field.path" class="computer-provisioning-field">
            <label class="field-label" :for="fieldId(field)">{{ field.label }}</label>
            <p class="page-lede" :id="fieldId(field) + '-help'">{{ field.description }}</p>
            <select v-if="field.enum?.length" class="hm-select" :id="fieldId(field)" :aria-describedby="fieldId(field) + '-help'" v-model="draft[field.key]">
              <option v-for="option in field.enum" :key="String(option)" :value="option">{{ option }}</option>
            </select>
            <input v-else-if="field.type === 'boolean'" type="checkbox" :id="fieldId(field)" :aria-describedby="fieldId(field) + '-help'" v-model="draft[field.key]" />
            <textarea v-else-if="field.type === 'array'" class="hm-input font-mono" rows="3" :id="fieldId(field)" :aria-describedby="fieldId(field) + '-help'" :value="draft[field.key]" @input="edit(field, $event.target.value)" placeholder="One monitor name per line"></textarea>
            <input v-else class="hm-input font-mono" :type="['integer', 'number'].includes(field.type) ? 'number' : 'text'" :id="fieldId(field)" :aria-describedby="fieldId(field) + '-help'" :min="field.constraints?.minimum" :max="field.constraints?.maximum" :step="field.type === 'integer' ? 1 : 'any'" :value="draft[field.key] ?? ''" @input="edit(field, $event.target.value)" autocomplete="off" />
            <p v-if="validation[field.key]" class="text-sm text-red-400" role="alert">{{ validation[field.key] }}</p>
          </div>
        </fieldset>
        <div class="action-row mt-4">
          <button class="btn btn-primary btn-touch" type="submit" :disabled="!changes.length || invalid || loading || saving || reviewing || uncertain">Review {{ changes.length }} change{{ changes.length === 1 ? '' : 's' }}</button>
          <button class="btn btn-ghost btn-touch" type="button" @click="discard" :disabled="loading || saving || uncertain || !changes.length">Discard draft</button>
        </div>
      </form>
      <section v-if="reviewing" class="computer-provisioning-review mt-4" aria-labelledby="computer-provisioning-review-title">
        <h3 id="computer-provisioning-review-title" class="text-sm font-semibold">Review provisioning changes</h3>
        <dl class="detail-grid mt-3">
          <div v-for="change in changes" :key="change.key">
            <dt>{{ change.label }}</dt>
            <dd><strong>Saved:</strong> {{ format(original[change.key]) }}</dd>
            <dd><strong>Desired:</strong> {{ format(change.value) }}</dd>
          </div>
        </dl>
        <p class="page-lede mt-3">Only these changed provisioning fields will be saved. Running sessions keep startup settings. Nothing is enabled, stopped or restarted.</p>
        <div class="action-row mt-3">
          <button class="btn btn-primary btn-touch" type="button" @click="save" :disabled="saving || loading || invalid || uncertain || !changes.length">{{ saving ? 'Saving and checking configuration…' : 'Save reviewed provisioning' }}</button>
          <button class="btn btn-ghost btn-touch" type="button" @click="reviewing = false" :disabled="saving">Back to editing</button>
        </div>
      </section>
      <button class="btn btn-ghost btn-touch mt-3" type="button" @click="load" :disabled="loading || saving || (changes.length > 0 && !uncertain)">{{ uncertain ? 'Reload saved values (discard draft)' : 'Reload provisioning' }}</button>
      <p class="text-xs text-gray-500 mt-3">Drafts are local to this view and discarded when leaving it. Backend validation remains authoritative.</p>
    </section>`,
  setup(_props, { emit }) {
    const fields = ref([]), original = ref({}), draft = ref({});
    const ready = ref(false), loading = ref(false), saving = ref(false), reviewing = ref(false);
    const uncertain = ref(false), error = ref(''), message = ref('');
    let active = false, generation = 0, loadedToken = null;
    const current = (g, token) => active && generation === g && api.token === token;
    const fieldId = field => 'computer-provisioning-' + field.key;
    const format = value => value === null ? 'Unset' : value === '' ? 'Empty' : JSON.stringify(value);
    const valueFor = field => {
      const value = draft.value[field.key];
      if (field.type === 'array') return String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
      if (['integer', 'number'].includes(field.type)) return value === '' || value == null ? null : Number(value);
      return value;
    };
    const changes = computed(() => fields.value.map(field => ({ ...field, value: valueFor(field) }))
      .filter(field => !equal(field.value, original.value[field.key])));
    const pending = computed(() => fields.value.filter(field => field.pending_restart).map(field => field.label));
    const effectiveUnknown = computed(() => fields.value.some(field => field.apply_state === 'unknown'));
    const validation = computed(() => {
      const result = {};
      for (const field of fields.value) {
        const value = valueFor(field), limits = field.constraints || {};
        if (['integer', 'number'].includes(field.type)) {
          if (value === null && !field.nullable) result[field.key] = 'A number is required.';
          else if (value !== null && (!Number.isFinite(value) || (field.type === 'integer' && !Number.isInteger(value))
            || (limits.minimum != null && value < limits.minimum) || (limits.maximum != null && value > limits.maximum))) result[field.key] = 'Enter a number within the allowed range.';
        }
        if (field.key === 'monitor_names' && (value.length > 16 || new Set(value).size !== value.length || value.some(name => !/^[A-Za-z0-9_.-]{1,64}$/.test(name)))) result[field.key] = 'Use up to 16 unique monitor names, one per line (letters, digits, dot, underscore or hyphen).';
      }
      return result;
    });
    const invalid = computed(() => Object.keys(validation.value).length > 0);
    function edit(field, value) { draft.value[field.key] = value; message.value = ''; }
    function discard() {
      draft.value = Object.fromEntries(fields.value.map(field => [field.key,
        field.type === 'array' ? original.value[field.key].join('\n') : original.value[field.key]]));
      reviewing.value = false;
    }
    async function readSaved(g, token) {
      const [config, meta] = await Promise.all([api.get('/api/config'), api.get('/api/config/meta')]);
      if (!current(g, token)) return false;
      const records = (meta.fields || []).filter(field => /^computer\.[^.]+$/.test(field.path) && field.path !== 'computer.enabled'
        && field.sensitivity === 'public' && field.apply_mode === 'restart');
      if (!config.computer || !records.length) throw new Error('Provisioning metadata is unavailable. Reload before editing.');
      fields.value = records.map(field => ({ ...field, key: field.path.split('.')[1] }));
      original.value = Object.fromEntries(fields.value.map(field => [field.key, clone(config.computer[field.key])]));
      discard(); loadedToken = token; ready.value = true; uncertain.value = false;
      return true;
    }
    async function load() {
      if (!active || loading.value || saving.value) return;
      const g = ++generation, token = api.token;
      loading.value = true; ready.value = false; error.value = ''; message.value = ''; reviewing.value = false;
      try { await readSaved(g, token); }
      catch (e) { if (current(g, token)) { uncertain.value = true; error.value = e.message || 'Could not load provisioning. No changes were sent.'; } }
      finally { if (current(g, token)) loading.value = false; }
    }
    function openReview() {
      if (ready.value && !loading.value && !saving.value && !uncertain.value && changes.value.length && !invalid.value) reviewing.value = true;
    }
    async function save() {
      if (!active || !ready.value || !reviewing.value || saving.value || loading.value || uncertain.value || invalid.value || !changes.value.length) return;
      if (loadedToken !== api.token) { cleanup(); start(); return; }
      // Never serialize the entire config or computer.enabled. Concurrent lifecycle
      // changes and other panels' drafts cannot hitch a ride on this save.
      const patch = { computer: Object.fromEntries(changes.value.map(field => [field.key, clone(field.value)])) };
      const g = generation, token = api.token;
      saving.value = true; error.value = ''; message.value = '';
      let acknowledged = false;
      try {
        await api.put('/api/config', patch);
        acknowledged = true;
        if (!current(g, token)) return;
        if (await readSaved(g, token)) {
          message.value = 'Provisioning saved and configuration reloaded. Startup settings remain pinned until Odin restarts; no lifecycle action was requested.';
          emit('saved');
        }
      } catch (e) {
        if (current(g, token)) {
          uncertain.value = true; reviewing.value = false;
          error.value = acknowledged
            ? 'Provisioning was saved, but configuration refresh failed. Reload saved values before editing again.'
            : `Save failed or its outcome is unknown${e.status === 400 ? ': ' + e.message : '.'} Reload saved values before editing or retrying. No request was replayed.`;
        }
      } finally { if (current(g, token)) saving.value = false; }
    }
    function start() { if (!active) { active = true; load(); } }
    function cleanup() {
      active = false; generation++; ready.value = false; loading.value = false; saving.value = false;
      reviewing.value = false; loadedToken = null; fields.value = []; original.value = {}; draft.value = {}; error.value = ''; message.value = '';
    }
    onMounted(start); onActivated(start); onDeactivated(cleanup); onUnmounted(cleanup);
    return { fields, original, draft, ready, loading, saving, reviewing, uncertain, error, message, pending, effectiveUnknown, changes, validation, invalid, fieldId, format, edit, discard, load, openReview, save };
  },
};
