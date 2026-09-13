/**
 * First-install setup is deliberately a small, isolated client.
 *
 * Do not import configuration pages here.  While initialization is pending the
 * server permits only this page's narrow route set, and this component must not
 * turn a first boot into an inventory request for the entire control plane.
 */
import { api } from '../api.js';
import { onUnmounted, ref } from 'vue';

export default {
  props: ['onComplete'],
  template: `
    <main class="login-shell" role="main" aria-labelledby="setup-title">
      <section class="login-panel" aria-describedby="setup-copy">
        <div class="login-brand" aria-hidden="true"><odin-icon name="brand" :size="30" /></div>
        <p class="login-eyebrow">First-install setup</p>
        <h1 id="setup-title" class="login-title">Odin</h1>
        <p id="setup-copy" class="login-subtitle">Finish initialization with an optional web credential. Discord can be attached now or later.</p>

        <p class="text-sm text-gray-400 mb-4" role="status" aria-live="polite">{{ statusMessage }}</p>
        <div v-if="error" class="mb-3 text-red-400 text-sm" role="alert">{{ error }}</div>
        <button v-if="completed" @click="onComplete" class="btn btn-primary w-full justify-center mb-4">Continue</button>

        <form v-else @submit.prevent="save" aria-label="Initial setup">
          <label for="setup-web-token" class="text-xs text-gray-400 block mb-1">Web API token</label>
          <input id="setup-web-token" v-model="webApiToken" type="password" class="hm-input mb-3"
                 autocomplete="new-password" placeholder="Set one now, or continue without it" />

          <label for="setup-discord-token" class="text-xs text-gray-400 block mb-1">Discord token <span class="text-gray-500">optional</span></label>
          <input id="setup-discord-token" v-model="discordToken" type="password" class="hm-input mb-2"
                 autocomplete="off" placeholder="Attach Discord now, or leave blank" />
          <p class="text-xs text-gray-500 mb-4">Discord attachment is saved without scheduling a restart.</p>

          <button type="submit" class="btn btn-primary w-full justify-center" :disabled="saving">
            <span v-if="saving" class="spinner" style="width:14px;height:14px;border-width:2px;" aria-hidden="true"></span>
            {{ saving ? 'Saving…' : 'Save setup' }}
          </button>
        </form>

        <div class="mt-5 pt-4 border-t border-gray-700">
          <h2 class="text-sm font-semibold text-gray-300 mb-2">Codex device sign-in</h2>
          <p class="text-xs text-gray-500 mb-3">Optional. You may sign in before or after saving setup.</p>
          <button v-if="!deviceState" @click="startDeviceLogin" class="btn btn-ghost text-xs" :disabled="deviceLoading">
            {{ deviceLoading ? 'Requesting code…' : 'Start device sign-in' }}
          </button>
          <div v-else-if="deviceState === 'pending'" class="p-3 bg-gray-800 rounded border border-gray-700">
            <p class="text-sm text-gray-300 mb-1">Open <a :href="deviceInfo.verify_url" target="_blank" rel="noopener noreferrer" class="text-indigo-400 underline">{{ deviceInfo.verify_url }}</a></p>
            <p class="text-sm text-gray-300">Enter code: <code class="bg-gray-900 px-2 py-1 rounded font-bold text-white">{{ deviceInfo.user_code }}</code></p>
            <p class="text-xs text-gray-500 mt-3" role="status" aria-live="polite">Connecting account…</p>
            <button @click="cancelDeviceLogin" class="btn btn-ghost text-xs mt-2">Cancel</button>
          </div>
          <div v-else-if="deviceState === 'ready'" class="p-3 bg-green-900/30 rounded border border-green-800" role="status">
            <p class="text-green-400 text-sm">Device account ready{{ deviceResult.email ? ': ' + deviceResult.email : '' }}.</p>
            <button @click="clearDeviceState" class="btn btn-ghost text-xs mt-2">Done</button>
          </div>
          <div v-else class="p-3 bg-red-900/30 rounded border border-red-800" role="alert">
            <p class="text-red-400 text-sm">{{ deviceError }}</p>
            <button @click="clearDeviceState" class="btn btn-ghost text-xs mt-2">Try again</button>
          </div>
        </div>
      </section>
    </main>`,
  setup(props) {
    const webApiToken = ref('');
    const discordToken = ref('');
    const saving = ref(false);
    const completed = ref(false);
    const error = ref('');
    const statusMessage = ref('Initialization pending.');
    const deviceLoading = ref(false);
    const deviceState = ref('');
    const deviceInfo = ref(null);
    const deviceResult = ref({});
    const deviceError = ref('');
    let deviceAttempt = 0;
    let deviceAbort = null;

    function invalidateDeviceAttempt() {
      deviceAttempt += 1;
      deviceAbort?.abort();
      deviceAbort = null;
      return deviceAttempt;
    }

    // api.js presently exposes post(path, body).  Use the cancellation-aware
    // form when it is introduced without turning a cancelled old poll into a
    // second poll.  Generation fencing remains necessary even with AbortSignal:
    // a completed response can race cancellation.
    function postDevice(path, body, signal) {
      if (typeof api.postWithOptions === 'function') {
        return api.postWithOptions(path, body, { signal });
      }
      return api.post(path, body);
    }

    async function save() {
      saving.value = true;
      error.value = '';
      statusMessage.value = 'Saving setup…';
      const body = {};
      const hasDiscordToken = Boolean(discordToken.value.trim());
      if (webApiToken.value.trim()) body.web_api_token = webApiToken.value.trim();
      if (discordToken.value.trim()) body.discord_token = discordToken.value.trim();
      try {
        // api.post serializes synchronously before its first await. Do not
        // retain credentials in reactive state while waiting for the server.
        const request = api.post('/api/setup/complete', body);
        webApiToken.value = '';
        discordToken.value = '';
        const result = await request;
        const discordState = result.discord?.state || result.discord_status;
        if (discordState === 'failed') {
          error.value = result.discord?.error || 'Discord attachment failed. Setup was saved.';
          statusMessage.value = 'Saved. Discord attachment failed.';
        } else if (discordState === 'connecting') {
          statusMessage.value = 'Saved. Connecting Discord…';
        } else if (discordState === 'ready') {
          statusMessage.value = 'Saved. Discord ready.';
        } else if (hasDiscordToken) {
          statusMessage.value = 'Saved. Discord token stored; attachment status is pending.';
        } else {
          statusMessage.value = result.message || 'Setup saved. Ready to sign in.';
        }
        completed.value = true;
      } catch (e) {
        error.value = e.message || 'Setup could not be saved.';
        statusMessage.value = 'Initialization pending.';
      } finally {
        saving.value = false;
      }
    }

    async function startDeviceLogin() {
      const attempt = invalidateDeviceAttempt();
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      deviceAbort = controller;
      deviceLoading.value = true;
      deviceError.value = '';
      try {
        const info = await postDevice('/api/codex/device-code', undefined, controller?.signal);
        if (attempt !== deviceAttempt) return;
        deviceInfo.value = info;
        deviceState.value = 'pending';
        const result = await postDevice('/api/codex/device-poll', {
          device_auth_id: info.device_auth_id,
          user_code: info.user_code,
          interval: info.interval,
        }, controller?.signal);
        if (attempt !== deviceAttempt) return;
        deviceResult.value = result || {};
        deviceState.value = 'ready';
      } catch (e) {
        if (attempt === deviceAttempt && e?.name !== 'AbortError') {
          deviceError.value = e.message || 'Device sign-in failed.';
          deviceState.value = 'failed';
        }
      } finally {
        if (attempt === deviceAttempt) {
          deviceLoading.value = false;
          deviceAbort = null;
        }
      }
    }

    function cancelDeviceLogin() {
      invalidateDeviceAttempt();
      deviceLoading.value = false;
      clearDeviceState();
    }
    function onComplete() { props.onComplete?.(); }
    function clearDeviceState() {
      deviceState.value = '';
      deviceInfo.value = null;
      deviceResult.value = {};
      deviceError.value = '';
    }
    onUnmounted(() => { invalidateDeviceAttempt(); });
    return { webApiToken, discordToken, saving, completed, error, statusMessage, save, onComplete,
      deviceLoading, deviceState, deviceInfo, deviceResult, deviceError,
      startDeviceLogin, cancelDeviceLogin, clearDeviceState };
  },
};
