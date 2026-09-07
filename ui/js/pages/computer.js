/** Private operator inspector and admin lifecycle controls. No direct input or automatic capture. */
import { computed, onMounted, onUnmounted, onActivated, onDeactivated, ref } from 'vue';
import { api } from '../api.js';

export default {
  template: `
    <div class="p-6 page-fade-in computer-page" role="region" aria-labelledby="computer-title">
      <header class="page-header mb-4">
        <div class="page-header-copy">
          <h1 id="computer-title" class="text-xl font-semibold">Computer operator</h1>
          <p class="page-lede">Private session inspection. This page does not send mouse or keyboard input.</p>
        </div>
        <div class="page-header-actions" aria-label="Emergency session controls">
          <button class="btn btn-ghost btn-touch" @click="control('pause')" :disabled="pausing" aria-label="Pause and revoke agent input">
            <odin-icon name="pause" :size="15" />
            {{ pausing ? 'Pausing…' : 'Pause / revoke input' }}
          </button>
          <button class="btn btn-danger btn-touch" @click="control('stop')" :disabled="stopping" aria-label="Stop computer session">
            <odin-icon name="error" :size="15" />
            {{ stopping ? 'Stopping…' : 'Stop session' }}
          </button>
        </div>
      </header>
      <div v-if="error" class="hm-card border-red-900 error-state mb-4" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
      </div>
      <div class="hm-card computer-status-card mb-4" role="status" aria-live="polite">
        <div>
          <div class="section-eyebrow">Current session</div>
          <div class="computer-state">{{ status.state || 'unknown' }}</div>
        </div>
        <span class="badge badge-info">{{ loading ? 'Checking status' : 'Session status' }}</span>
      </div>
      <div class="space-y-4">
      <section class="hm-card" aria-labelledby="computer-lifecycle-title">
        <div class="section-card-header">
          <div>
            <h2 id="computer-lifecycle-title" class="text-sm font-semibold text-gray-300">Administrator lifecycle controls</h2>
            <p class="page-lede">Configuration and runtime state are separate. Changes here never restart Odin.</p>
          </div>
        </div>
        <dl class="detail-grid mb-4">
          <div><dt>Configured</dt><dd>{{ enabledLabel(status.configured_enabled ?? status.enabled) }}</dd></div>
          <div><dt>Runtime lifecycle</dt><dd>{{ enabledLabel(status.runtime_enabled) }}</dd></div>
          <div><dt>Runtime generation</dt><dd>{{ status.generation ?? 'Unknown' }}</dd></div>
          <div><dt>Backend platform / environment</dt><dd>{{ status.backend?.platform || 'Unknown' }} / {{ status.backend?.environment || 'Unknown' }}</dd></div>
          <div><dt>Restart-required settings</dt><dd>{{ restartSettings }}</dd></div>
        </dl>
        <div v-if="adminReady" class="action-row mb-3">
          <button class="btn btn-primary btn-touch" @click="setEnabled(true)" :disabled="toggling || stopping || pausing || (status.configured_enabled ?? status.enabled) === true">Enable computer use</button>
          <button class="btn btn-danger btn-touch" @click="setEnabled(false)" :disabled="toggling || stopping || pausing">Disable computer use</button>
        </div>
        <p v-else class="page-lede">Lifecycle controls require a successful authenticated administrator status check.</p>
        <p v-if="toggling" class="text-sm text-amber-400" role="status">Applying lifecycle change and checking status…</p>
        <p class="page-lede">Enabling does not prove backend readiness or start a session. Session startup checks capabilities. Unavailable input remains unavailable.</p>
        <p v-if="status.backend?.input_supported === false" class="page-lede">Input unavailable: this backend cannot act. Enabling computer use does not grant mouse or keyboard control.</p>
        <p v-else-if="status.backend?.input_supported !== true" class="page-lede">Input capability is unknown. Do not assume this backend can act.</p>
        <p v-else class="page-lede">Backend reports input support; session authorization and startup checks still apply.</p>
        <p class="text-xs text-gray-500 mt-3">Runtime settings are generation-pinned. Pending restart-required settings are not live; this page does not restart Odin.</p>
      </section>
      <section v-if="status.input_admission" class="hm-card text-break" aria-labelledby="computer-input-admission-title">
        <div class="section-card-header">
          <h2 id="computer-input-admission-title" class="text-sm font-semibold text-gray-300">Input eligibility evidence</h2>
          <span class="badge badge-info">{{ status.input_admission.state }}</span>
        </div>
        <div class="detail-stack text-sm text-gray-300">
          <p><strong>{{ status.input_admission.state }}</strong>: {{ status.input_admission.code }}</p>
          <p v-if="status.input_admission.compositor">Compositor: {{ status.input_admission.compositor.name }} {{ status.input_admission.compositor.version }} ({{ status.input_admission.compositor.backend }}). Build: {{ status.input_admission.compositor.build_id }}.</p>
          <p>{{ status.input_admission.reason }}</p>
          <p>Operator action: {{ status.input_admission.remedy }}</p>
          <p>Probe scope: {{ status.input_admission.probe_scope }}.</p>
        </div>
        <p v-if="status.input_admission.probe_scope === 'same_stack_disposable'" class="page-lede">Behavior was tested in a separate disposable compositor with the matched stack, not by abandoning held input on your desktop.</p>
        <p class="page-lede">Eligibility evidence does not replace current portal consent, source mapping or application checks. Opening this page runs no input probe.</p>
      </section>
      <section v-if="!attached" class="hm-card" aria-labelledby="computer-apps-title">
        <div class="section-card-header">
          <h2 id="computer-apps-title" class="text-sm font-semibold text-gray-300">Application profiles</h2>
        </div>
        <ul v-if="applicationProfiles.length" class="profile-list mb-3">
          <li v-for="profile in applicationProfiles" :key="profile.id" class="profile-list-item">
            <strong>{{ profile.label }}</strong>: {{ profile.input === 'supported' ? 'Input eligible' : 'Capture only' }}
            <span v-if="profile.input === 'capture_only'"> (application provenance unavailable)</span>
            <p v-if="profile.task_scope" class="page-lede">{{ profile.task_scope }}</p>
          </li>
        </ul>
        <p v-else class="page-lede">No application profiles reported for this backend.</p>
        <p class="page-lede">Profiles describe supported scope, not installation, focus, permission or task success. Input readiness is checked against a fresh observation.</p>
      </section>
      <section v-else class="hm-card text-break" aria-labelledby="computer-attached-title">
        <div class="section-card-header">
          <h2 id="computer-attached-title" class="text-sm font-semibold text-gray-300">Attached application</h2>
        </div>
        <p class="page-lede">Focus the application you want help with, then ask in ordinary chat. There is no application allowlist. Normal dialogs, file pickers, menus and document open/new/close/reopen are ordinary use. Session Stop only detaches input; applications stay open.</p>
        <p class="page-lede">Denied classes remain blocked: terminals, shells, authentication and password prompts, polkit, keyring, sudo and Odin control-plane windows. Session authorization, current target checks and input-release checks still apply.</p>
        <dl class="detail-grid mt-4 mb-3">
          <div><dt>Observed executable</dt><dd>{{ status.application_provenance?.exe_basename || 'Not observed' }}</dd></div>
          <div><dt>Observed WM_CLASS</dt><dd>{{ status.application_provenance?.wm_class || 'Not observed' }}</dd></div>
          <div><dt>Observed PID</dt><dd>{{ status.application_provenance?.pid ?? 'Not observed' }}</dd></div>
          <div><dt>Trusted executable metadata</dt><dd>{{ status.application_provenance?.trusted_executable === true ? 'Yes' : status.application_provenance?.trusted_executable === false ? 'No' : 'Unknown' }}</dd></div>
          <div v-if="status.application_provenance?.script_identity"><dt>Script identity evidence</dt><dd>{{ scriptIdentity }}</dd></div>
          <div><dt>Pointer</dt><dd>{{ status.backend?.pointer || 'unknown' }}</dd></div>
          <div><dt>Keyboard focus</dt><dd>{{ status.backend?.keyboard_focus || 'unknown' }}</dd></div>
          <div><dt>Widget focus</dt><dd>{{ status.backend?.widget_focus || 'unknown' }}</dd></div>
        </dl>
        <p class="page-lede">Provenance describes the last observed target, not application approval or task success. Untrusted executable metadata is evidence, not an application refusal. Focus within one window may be shared even with an independent pointer. Unknown capabilities are not proof of independence.</p>
        <p v-if="inputLimits" class="page-lede">Per-call input bounds: {{ inputLimits }}. These limits are not application restrictions.</p>
      </section>
      <div v-if="status.state === 'unavailable'" class="hm-card border-amber-900 text-sm text-amber-300" role="status">Disabled or unavailable. Check configured state, lifecycle state and backend prerequisites separately.</div>
      <div v-if="status.state === 'paused'" class="hm-card border-amber-900 text-sm text-amber-300" role="status">Agent input is revoked. This inspector does not provide remote mouse or keyboard control. Resume requires a renewed generation and fresh evidence.</div>
      <div v-if="status.state === 'unknown'" class="hm-card border-amber-900 text-sm text-amber-300" role="status">Outcome is unknown. Refresh status; do not replay the last action.</div>
      <section v-if="status.recovery" class="hm-card" aria-labelledby="computer-recovery-title">
        <div class="section-card-header">
          <h2 id="computer-recovery-title" class="text-sm font-semibold text-gray-300">Recovery evidence</h2>
          <span class="badge" :class="status.recovery.complete ? 'badge-success' : 'badge-warning'">{{ status.recovery.complete ? 'Verified' : 'Review required' }}</span>
        </div>
        <p>{{ status.recovery.status }}: {{ status.recovery.reason }}. Cleanup {{ status.recovery.complete ? 'verified' : 'not verified' }}.</p>
        <p class="page-lede">Reconciliation only inspects the recorded workload. It never sends input, terminates applications or replays actions.</p>
        <button v-if="status.state === 'quarantined'" class="btn btn-ghost btn-touch mt-3" @click="recover" :disabled="recovering || !adminReady">{{ recovering ? 'Checking recorded workload…' : 'Reconcile recorded workload' }}</button>
      </section>
      <section class="hm-card" aria-labelledby="computer-session-title">
        <div class="section-card-header">
          <h2 id="computer-session-title" class="text-sm font-semibold text-gray-300">Session details</h2>
        </div>
        <dl class="detail-grid">
          <div><dt>Owner</dt><dd>{{ status.owner_id || '—' }}</dd></div>
          <div><dt>Session</dt><dd class="text-break">{{ status.session_id || '—' }}</dd></div>
          <div v-if="!attached"><dt>Application</dt><dd>{{ status.app || '—' }}</dd></div>
          <div><dt>Last action / verification</dt><dd>{{ status.last_action || '—' }} / {{ status.last_verification || 'unavailable' }}</dd></div>
        </dl>
      </section>

      <section class="hm-card" aria-labelledby="computer-evidence-title">
        <div class="section-card-header">
          <div>
            <h2 id="computer-evidence-title" class="text-sm font-semibold text-gray-300">Visual evidence</h2>
            <p class="page-lede">Frames are captured only on request. Opening or refreshing this view never captures or posts an image.</p>
          </div>
          <div class="action-row">
            <button class="btn btn-ghost btn-touch" @click="refresh" :disabled="loading"><odin-icon name="refresh" :size="15" /> Refresh status</button>
            <button class="btn btn-primary btn-touch" @click="observe" :disabled="observing || !status.available"><odin-icon name="eye" :size="15" /> {{ observing ? 'Observing…' : 'Observe / view frame' }}</button>
            <button v-if="frameUrl" class="btn btn-ghost btn-touch" @click="clearFrame">Hide frame</button>
          </div>
        </div>
        <figure v-if="frameUrl" class="evidence-figure">
          <figcaption class="text-xs text-gray-500 mb-3">{{ freshness }} · Captured {{ frame.captured_at }} · Private evidence expires {{ frame.expires_at }}</figcaption>
          <img class="evidence-frame" :src="frameUrl" alt="Requested frame from the authorized application; read-only" />
        </figure>
        <p v-else-if="frameExpired" class="text-sm text-amber-400" role="status">Frame expired. Observe again for current evidence.</p>
      </section>

      <section class="hm-card" aria-labelledby="computer-export-title">
        <form @submit.prevent="exportFile">
          <div class="section-card-header">
            <div>
              <h2 id="computer-export-title" class="text-sm font-semibold text-gray-300">Export a saved workspace file</h2>
              <p class="page-lede">Choose one exact filename, not a host path. Downloads are never executed.</p>
            </div>
          </div>
          <label class="field-label" for="computer-export-name">Filename</label>
          <div class="export-controls mt-2">
            <input id="computer-export-name" class="hm-input export-name" v-model="name" maxlength="100" required autocomplete="off" placeholder="drawing.png" />
            <button class="btn btn-primary btn-touch" type="submit" :disabled="exporting || !status.available">{{ exporting ? 'Preparing…' : 'Prepare export' }}</button>
          </div>
        </form>
        <div v-if="artifact" class="artifact-row mt-4">
          <button class="btn btn-ghost btn-touch" @click="download" :disabled="downloading"><odin-icon name="download" :size="15" /> Download {{ artifact.name }}</button>
          <span class="text-xs text-gray-500">Expires {{ artifact.expires_at }}</span>
        </div>
      </section>
      </div>
    </div>`,

  setup() {
    const status = ref({ state: 'unknown', available: false });
    const loading = ref(false), observing = ref(false), stopping = ref(false), pausing = ref(false);
    const exporting = ref(false), downloading = ref(false), error = ref('');
    const toggling = ref(false), adminReady = ref(false), recovering = ref(false);
    const frame = ref(null), frameUrl = ref(''), frameExpired = ref(false), now = ref(Date.now());
    const name = ref(''), artifact = ref(null);
    let generation = 0, timer = null, active = false, token = api.token, lastRefresh = 0;
    const enabledLabel = value => value === true ? 'Enabled' : value === false ? 'Disabled' : 'Unknown';
    const attached = computed(() => status.value.backend?.environment === 'existing_session');
    const inputLimits = computed(() => Object.entries(status.value.input_limits || {})
      .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
      .map(([key, value]) => `${key}: ${value}`).join(', '));
    const scriptIdentity = computed(() => {
      const script = status.value.application_provenance?.script_identity;
      if (typeof script === 'string') return script;
      if (!script || typeof script !== 'object') return 'Not observed';
      return `${script.interpreter_basename || 'Unknown interpreter'}; argv digest ${script.argv_digest || 'not recorded'}; ${script.verified === true ? 'verified' : 'not verified'}`;
    });
    const applicationProfiles = computed(() => Array.isArray(status.value.application_profiles)
      ? status.value.application_profiles.filter(p => p && typeof p.id === 'string' && typeof p.label === 'string'
        && ['supported', 'capture_only'].includes(p.input)).slice(0, 16) : []);
    const restartSettings = computed(() => {
      const value = status.value.restart_required;
      if (Array.isArray(value)) return value.length ? value.join(', ') : 'None reported';
      return value === true ? 'Pending; restart required' : value === false ? 'None reported' : 'Unknown';
    });
    const freshness = computed(() => {
      const captured = Date.parse(frame.value?.captured_at || '');
      return Number.isFinite(captured) && now.value < captured + Math.min(10000, frame.value?.fresh_for_ms || 0)
        ? 'Fresh frame' : 'Stale frame — observe again before acting';
    });
    function clearFrame() {
      if (frameUrl.value) URL.revokeObjectURL(frameUrl.value);
      frameUrl.value = ''; frame.value = null;
    }
    function invalidate() {
      generation++; clearFrame(); artifact.value = null;
      observing.value = false; exporting.value = false; downloading.value = false;
    }
    function current(g, t) { return active && g === generation && t === api.token; }
    function fail(e) {
      invalidate();
      adminReady.value = false;
      const code = e.status || (e.name === 'AuthError' ? 401 : 0);
      status.value = { available: false, state: code === 503 ? 'unavailable' : 'unknown' };
      error.value = code === 401 || code === 403 || code === 404
        ? 'Access unavailable or revoked. Authenticate as the session owner, then refresh.'
        : code === 410 ? 'Evidence or artifact expired. Observe or prepare the export again.'
          : code === 503 ? 'Computer use is disabled or unavailable.' : 'Request failed; outcome unknown. Refresh status. No action was replayed.';
    }
    async function refresh() {
      if (loading.value || toggling.value || stopping.value || pausing.value || recovering.value || !active) return;
      const g = generation, t = api.token; loading.value = true; lastRefresh = Date.now();
      try {
        const value = await api.get('/api/computer');
        if (!current(g, t)) return;
        acceptStatus(value);
      } catch (e) { if (current(g, t)) fail(e); }
      finally { loading.value = false; }
    }
    function acceptStatus(value) {
      if ((status.value.session_id && status.value.session_id !== value.session_id)
          || (status.value.generation != null && status.value.generation !== value.generation)
          || (status.value.session_generation != null && status.value.session_generation !== value.session_generation)) invalidate();
      status.value = value; adminReady.value = true; error.value = '';
    }
    async function setEnabled(enabled) {
      if (!active || !adminReady.value || toggling.value || stopping.value || pausing.value) return;
      invalidate(); const g = generation, t = api.token; toggling.value = true;
      try {
        await api.post('/api/computer/enabled', { enabled });
        if (!current(g, t)) return;
        // The mutation acknowledgement is not evidence of backend readiness.
        const value = await api.get('/api/computer');
        if (current(g, t)) acceptStatus(value);
      } catch (e) { if (current(g, t)) fail(e); }
      finally { toggling.value = false; }
    }
    async function control(operation) {
      // Separate request path: Stop remains usable while Observe is blocked.
      invalidate(); const g = generation, t = api.token;
      const busy = operation === 'stop' ? stopping : pausing; busy.value = true;
      try {
        const value = await api.post('/api/computer/' + operation, {});
        if (current(g, t)) {
          // Stop intentionally returns state only. Read current lifecycle/session
          // metadata separately rather than erasing it or treating old data as live.
          status.value = { ...status.value, ...value };
          const latest = await api.get('/api/computer');
          if (current(g, t)) acceptStatus(latest);
        }
      } catch (e) { if (current(g, t)) fail(e); }
      finally { busy.value = false; }
    }
    async function recover() {
      if (!active || !adminReady.value || recovering.value || status.value.state !== 'quarantined') return;
      const selected = { session_id: status.value.session_id, generation: status.value.session_generation };
      if (!selected.session_id || !Number.isInteger(selected.generation)) return;
      invalidate(); const g = generation, t = api.token; recovering.value = true;
      try {
        const value = await api.post('/api/computer/recover', selected);
        if (current(g, t)) acceptStatus(value);
      } catch (e) { if (current(g, t)) fail(e); }
      finally { recovering.value = false; }
    }
    async function observe() {
      clearFrame(); frameExpired.value = false;
      const g = generation, t = api.token; observing.value = true;
      try {
        const value = await api.post('/api/computer/observe', {});
        if (!current(g, t)) return;
        if (!/^[A-Za-z0-9_-]{8,128}$/.test(value.frame?.evidence_id || '')) throw new Error('Invalid evidence');
        const blob = await api.getBlob('/api/computer/evidence/' + value.frame.evidence_id);
        if (!current(g, t)) return;
        if (!['image/png', 'image/jpeg'].includes(blob.type) || blob.size > 2097152 || !Number.isFinite(Date.parse(value.frame.expires_at)) || Date.parse(value.frame.expires_at) <= Date.now()) throw new Error('Invalid evidence');
        frame.value = value.frame; frameUrl.value = URL.createObjectURL(blob); error.value = '';
      } catch (e) { if (current(g, t)) fail(e); }
      finally { if (g === generation) observing.value = false; }
    }
    async function exportFile() {
      artifact.value = null; const g = generation, t = api.token; exporting.value = true;
      try {
        const value = await api.post('/api/computer/export', { name: name.value });
        if (current(g, t)) { artifact.value = value; error.value = ''; }
      } catch (e) { if (current(g, t)) fail(e); }
      finally { if (g === generation) exporting.value = false; }
    }
    async function download() {
      const g = generation, t = api.token, selected = artifact.value; downloading.value = true;
      try {
        if (!/^[A-Za-z0-9_-]{8,128}$/.test(selected?.artifact_id || '')) throw new Error('Invalid export');
        const blob = await api.getBlob('/api/computer/download/' + selected.artifact_id);
        if (!current(g, t)) return;
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = selected.name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) { if (current(g, t)) fail(e); }
      finally { if (g === generation) downloading.value = false; }
    }
    function start() {
      if (active) return; active = true; refresh();
      timer = setInterval(() => {
        now.value = Date.now();
        if (token !== api.token) { token = api.token; invalidate(); adminReady.value = false; status.value = { state: 'unknown', available: false }; }
        if (frame.value && Date.parse(frame.value.expires_at) <= now.value) { clearFrame(); frameExpired.value = true; }
        if (artifact.value && Date.parse(artifact.value.expires_at) <= now.value) artifact.value = null;
        if (now.value - lastRefresh >= 5000) refresh();
      }, 500);
    }
    function cleanup() { active = false; clearInterval(timer); timer = null; invalidate(); adminReady.value = false; }
    onMounted(start); onActivated(start); onDeactivated(cleanup); onUnmounted(cleanup);
    return { status, loading, observing, stopping, pausing, exporting, downloading, error, frame, frameUrl, frameExpired, freshness, name, artifact, refresh, control, observe, clearFrame, exportFile, download, toggling, adminReady, enabledLabel, restartSettings, setEnabled, recovering, recover, applicationProfiles, attached, scriptIdentity, inputLimits };
  },
};
