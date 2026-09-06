/** Private read-only operator view. No host input or automatic capture. */
import { computed, onMounted, onUnmounted, onActivated, onDeactivated, ref } from 'vue';
import { api } from '../api.js';

export default {
  template: `
    <section class="p-6 page-fade-in" aria-labelledby="computer-title">
      <header class="flex items-start justify-between flex-wrap gap-3 mb-4" style="position:sticky;top:0;z-index:2;background:var(--bg-primary,#10141c);padding:12px 0">
        <div><h1 id="computer-title" class="text-xl font-semibold">Isolated computer</h1>
          <p class="page-lede">Private offline session. Read-only inspection, never your host desktop.</p></div>
        <div class="flex gap-3 flex-wrap">
          <button class="btn btn-danger" style="min-height:44px" @click="control('stop')" :disabled="stopping" aria-label="Stop isolated session">{{ stopping ? 'Stopping…' : 'Stop' }}</button>
          <button class="btn btn-ghost" style="min-height:44px" @click="control('pause')" :disabled="pausing" aria-label="Pause and revoke agent input">{{ pausing ? 'Pausing…' : 'Pause / revoke input' }}</button>
        </div>
      </header>
      <p role="alert" v-if="error" class="text-red-400 mb-4">{{ error }}</p>
      <p role="status" aria-live="polite" class="mb-4">State: <strong>{{ status.state || 'unknown' }}</strong>{{ loading ? ' — checking status' : '' }}</p>
      <p v-if="status.state === 'unavailable'" class="page-lede mb-4">Disabled or unavailable. An authenticated administrator must configure isolation prerequisites before enabling this feature.</p>
      <p v-if="status.state === 'paused'" class="page-lede mb-4">Agent input is revoked. This inspector does not provide remote mouse or keyboard control. Resume requires a renewed generation and fresh evidence.</p>
      <p v-if="status.state === 'unknown'" class="page-lede mb-4">Outcome is unknown. Refresh status; do not replay the last action.</p>
      <dl class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div><dt>Owner</dt><dd>{{ status.owner_id || '—' }}</dd></div>
        <div><dt>Session</dt><dd style="overflow-wrap:anywhere">{{ status.session_id || '—' }}</dd></div>
        <div><dt>Application</dt><dd>{{ status.app || '—' }}</dd></div>
        <div><dt>Last action / verification</dt><dd>{{ status.last_action || '—' }} / {{ status.last_verification || 'unavailable' }}</dd></div>
      </dl>
      <div class="flex gap-3 flex-wrap mb-4">
        <button class="btn btn-ghost" style="min-height:44px" @click="refresh" :disabled="loading">Refresh status</button>
        <button class="btn btn-primary" style="min-height:44px" @click="observe" :disabled="observing || !status.available">{{ observing ? 'Observing…' : 'Observe / view frame' }}</button>
        <button v-if="frameUrl" class="btn btn-ghost" style="min-height:44px" @click="clearFrame">Hide frame</button>
      </div>
      <p class="text-gray-400 mb-4">Frames are captured only on request. Opening or refreshing this view never captures or posts an image.</p>
      <figure v-if="frameUrl" class="mb-4">
        <figcaption>{{ freshness }} · Captured {{ frame.captured_at }} · Private evidence expires {{ frame.expires_at }}</figcaption>
        <img :src="frameUrl" alt="Requested frame from the isolated application; read-only" style="display:block;max-width:100%;max-height:65vh;object-fit:contain" />
      </figure>
      <p v-else-if="frameExpired" role="status">Frame expired. Observe again for current evidence.</p>
      <form @submit.prevent="exportFile" class="mt-4" aria-labelledby="computer-export-title">
        <h2 id="computer-export-title" class="font-semibold mb-2">Export a saved workspace file</h2>
        <p class="text-gray-400 mb-2">Choose one exact filename, not a host path. Downloads are never executed.</p>
        <label for="computer-export-name">Filename</label>
        <div class="flex gap-3 flex-wrap mt-2">
          <input id="computer-export-name" class="input" v-model="name" maxlength="100" required autocomplete="off" placeholder="drawing.png" style="min-height:44px;max-width:100%" />
          <button class="btn btn-primary" style="min-height:44px" type="submit" :disabled="exporting || !status.available">{{ exporting ? 'Preparing…' : 'Prepare export' }}</button>
        </div>
      </form>
      <p v-if="artifact" class="mt-4"><button class="btn btn-ghost" style="min-height:44px" @click="download" :disabled="downloading">Download {{ artifact.name }}</button> · Expires {{ artifact.expires_at }}</p>
    </section>`,

  setup() {
    const status = ref({ state: 'unknown', available: false });
    const loading = ref(false), observing = ref(false), stopping = ref(false), pausing = ref(false);
    const exporting = ref(false), downloading = ref(false), error = ref('');
    const frame = ref(null), frameUrl = ref(''), frameExpired = ref(false), now = ref(Date.now());
    const name = ref(''), artifact = ref(null);
    let generation = 0, timer = null, active = false, token = api.token, lastRefresh = 0;
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
      const code = e.status || (e.name === 'AuthError' ? 401 : 0);
      status.value = { available: false, state: code === 503 ? 'unavailable' : 'unknown' };
      error.value = code === 401 || code === 403 || code === 404
        ? 'Access unavailable or revoked. Authenticate as the session owner, then refresh.'
        : code === 410 ? 'Evidence or artifact expired. Observe or prepare the export again.'
          : code === 503 ? 'Computer use is disabled or unavailable.' : 'Request failed; outcome unknown. Refresh status. No action was replayed.';
    }
    async function refresh() {
      if (loading.value || !active) return;
      const g = generation, t = api.token; loading.value = true; lastRefresh = Date.now();
      try {
        const value = await api.get('/api/computer');
        if (!current(g, t)) return;
        if (status.value.session_id && status.value.session_id !== value.session_id) invalidate();
        status.value = value; error.value = '';
      } catch (e) { if (current(g, t)) fail(e); }
      finally { loading.value = false; }
    }
    async function control(operation) {
      // Separate request path: Stop remains usable while Observe is blocked.
      invalidate(); const g = generation, t = api.token;
      const busy = operation === 'stop' ? stopping : pausing; busy.value = true;
      try {
        const value = await api.post('/api/computer/' + operation, {});
        if (current(g, t)) { status.value = value; error.value = ''; }
      } catch (e) { if (current(g, t)) fail(e); }
      finally { busy.value = false; }
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
        if (token !== api.token) { token = api.token; invalidate(); status.value = { state: 'unknown', available: false }; }
        if (frame.value && Date.parse(frame.value.expires_at) <= now.value) { clearFrame(); frameExpired.value = true; }
        if (artifact.value && Date.parse(artifact.value.expires_at) <= now.value) artifact.value = null;
        if (now.value - lastRefresh >= 5000) refresh();
      }, 500);
    }
    function cleanup() { active = false; clearInterval(timer); timer = null; invalidate(); }
    onMounted(start); onActivated(start); onDeactivated(cleanup); onUnmounted(cleanup);
    return { status, loading, observing, stopping, pausing, exporting, downloading, error, frame, frameUrl, frameExpired, freshness, name, artifact, refresh, control, observe, clearFrame, exportFile, download };
  },
};
