/**
 * Execution Viewer — Live tool execution dashboard
 * Shows active tool calls, streaming output, and execution history
 */
import { api, ws } from '../api.js';
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';
import ToolOutput from '../tool-output.js';

export default {
  components: { ToolOutput },
  setup() {
    const activeTasks = ref([]);
    const recentHistory = ref([]);
    const streamOutput = ref({});
    const maxHistory = 50;
    let legacySequence = 0;
    const field = (payload, name) => payload[name] ?? payload.metadata?.[name]
      ?? payload.audit_metadata?.[name] ?? payload.turn?.[name];
    const turnIdentity = payload => field(payload, 'originating_turn_id') || field(payload, 'turn_id') || '';
    function matches(task, payload) {
      if (task.channel !== String(field(payload, 'channel_id') || '')) return false;
      if (task.callId !== (field(payload, 'call_id') || null)) return false;
      const turnId = turnIdentity(payload);
      if (turnId && task.turnId !== String(turnId)) return false;
      const loopId = field(payload, 'loop_id');
      if (loopId && task.loopId !== String(loopId)) return false;
      const actor = field(payload, 'user_id') || payload.actor;
      if (actor && task.actor && task.actor !== String(actor)) return false;
      for (const [key, wire] of [['agentId', 'agent_id'], ['iteration', 'iteration']]) {
        const value = field(payload, wire);
        if (value != null && String(task[key]) !== String(value)) return false;
      }
      const tool = payload.action || payload.tool_name;
      return !tool || task.tool === tool;
    }
    function retireUncertain() {
      const uncertain = activeTasks.value.filter(task => task.status === 'running');
      for (const task of uncertain) {
        task.elapsed = Date.now() - task.startTime;
        task.status = 'unknown';
        task.result = 'Live evidence interrupted. Current execution state is unknown; consult audit history.';
      }
      recentHistory.value = [...uncertain, ...recentHistory.value].slice(0, maxHistory);
      activeTasks.value = activeTasks.value.filter(task => task.status !== 'unknown');
      streamOutput.value = {};
    }

    function handleEvent(event) {
      const payload = event.payload || event;
      const type = payload.type || event.type;
      // Old autonomous loop terminal events have no start/call identity and
      // must never close a main-thread card through the legacy name fallback.
      if (['loop_tool_start', 'loop_tool'].includes(type)
          && !(field(payload, 'agent_id') || field(payload, 'loop_id'))) return;
      if (['loop_tool_start', 'loop_tool'].includes(type)
          && !(payload.call_id || payload.metadata?.call_id)) return;

      if (type === 'tool_start' || type === 'loop_tool_start') {
        const callId = payload.call_id || payload.metadata?.call_id || null;
        const agentId = payload.agent_id || payload.metadata?.agent_id || '';
        const task = {
          // The model's tool_use id when the backend supplies it. Pairing
          // start with end by tool NAME cannot distinguish concurrent
          // same-name calls, and no ordering rule fixes that — LIFO closed the
          // newest card, FIFO closes the oldest, and both are wrong whenever a
          // later call finishes first.
          callId,
          agentId,
          agentLabel: payload.agent_label || payload.metadata?.agent_label || '',
          toolInput: payload.tool_input,
          id: JSON.stringify([String(field(payload, 'channel_id') || ''), agentId, field(payload, 'loop_id') || '', turnIdentity(payload), field(payload, 'iteration') ?? 0, callId, payload.action, ++legacySequence]),
          turnId: String(turnIdentity(payload)),
          loopId: String(field(payload, 'loop_id') || ''),
          tool: payload.action,
          actor: String(field(payload, 'user_id') || payload.actor || ''),
          channel: String(field(payload, 'channel_id') || ''),
          iteration: payload.iteration ?? payload.metadata?.iteration ?? 0,
          startTime: Date.now(),
          elapsed: 0,
          status: 'running',
          output: '',
          result: '',
        };
        activeTasks.value.unshift(task);
        return;
      }

      if (type === 'tool_end' || type === 'loop_tool') {
        // Pair by call id — the only identity that survives concurrency.
        const endCallId = payload.call_id || payload.metadata?.call_id || null;
        const endAgentId = payload.agent_id || payload.metadata?.agent_id || '';
        let idx = -1;
        if (endCallId) {
          const candidates = activeTasks.value.filter(t => matches(t, payload) && t.status === 'running');
          if (candidates.length === 1) idx = activeTasks.value.indexOf(candidates[0]);
        }
        if (idx < 0 && !endCallId) {
          // Older backends (and any event predating this field) send no id.
          // Legacy events can close a uniquely matching legacy card only.
          // Ambiguity is missing evidence, not permission to pick a winner.
          const candidates = activeTasks.value.filter(t => !t.callId && t.tool === payload.action
            && t.channel === String(field(payload, 'channel_id') || '') && t.agentId === endAgentId && t.status === 'running');
          if (candidates.length === 1) idx = activeTasks.value.indexOf(candidates[0]);
        }
        if (idx >= 0) {
          const task = activeTasks.value[idx];
          const remainingStreams = { ...streamOutput.value };
          delete remainingStreams[task.id];
          streamOutput.value = remainingStreams;
          task.status = payload.error || payload.metadata?.error || ['error', 'failed', 'cancelled', 'denied', 'outcome_unknown'].includes(payload.status || payload.metadata?.status) ? 'error' : 'success';
          // A canonical execution may also be the terminal lifecycle event.
          // Prefer its full result and measured duration over legacy fields.
          task.elapsed = payload.execution_time_ms ?? payload.duration_ms ?? payload.metadata?.elapsed_ms ?? (Date.now() - task.startTime);
          task.result = payload.result_summary ?? payload.detail ?? '';
          task.fadingOut = true;
          setTimeout(() => {
            const i = activeTasks.value.indexOf(task);
            if (i >= 0) activeTasks.value.splice(i, 1);
            recentHistory.value.unshift(task);
            if (recentHistory.value.length > maxHistory) {
              recentHistory.value.pop();
            }
          }, 5000);
        }
        return;
      }

      if (type === 'tool_stream') {
        // Key by invocation, not tool name: two concurrent run_command calls
        // stream under the SAME name, so a name key merged their output onto
        // both cards and let either completion delete both streams.
        const candidates = activeTasks.value.filter(task => matches(task, payload) && task.status === 'running');
        // Older stream messages lack agent/iteration. Only attach when the
        // complete live invocation is unambiguous; never mix plausible owners.
        if (candidates.length > 1) return;
        // Unbound legacy/agent streams remain visible as standalone output,
        // but cannot be projected onto a card with incomplete attribution.
        const key = candidates.length === 1 ? candidates[0].id : JSON.stringify([
          'stream', field(payload, 'channel_id') || '', field(payload, 'agent_id') || '',
          field(payload, 'loop_id') || '', turnIdentity(payload), field(payload, 'iteration') ?? '',
          field(payload, 'call_id') || payload.tool_name || '',
        ]);
        if (payload.finished) {
          const next = { ...streamOutput.value };
          delete next[key];
          streamOutput.value = next;
        } else {
          const current = streamOutput.value[key] || '';
          const lines = (current + (payload.chunk || '')).split('\n');
          streamOutput.value = { ...streamOutput.value, [key]: lines.slice(-30).join('\n') };
        }
        return;
      }
    }

    let timer = null;
    function updateElapsed() {
      const now = Date.now();
      activeTasks.value.forEach(t => {
        if (t.status === 'running') {
          t.elapsed = now - t.startTime;
        }
      });
    }

    let armed = false;
    let unsubscribeState = null;

    function arm() {
      if (armed) return;
      armed = true;
      unsubscribeState = ws.onState(onConnectionState);
      // Vue fires BOTH onMounted and onActivated on the initial keep-alive
      // mount, so arming must be idempotent — otherwise the websocket
      // handler is registered twice and unsubscribe() (which removes one
      // occurrence) leaves a live copy behind on every visit.
      // Tabs live inside <keep-alive> (tabbed-page.js), so switching away
      // DEACTIVATES this component without unmounting it. Anything armed in
      // onMounted would keep running invisibly until a top-level route change.
      // Same pattern as loops.js/agents.js/logs.js.
      ws.on('events', handleEvent);
      if (!timer) timer = setInterval(updateElapsed, 500);
    }

    function disarm() {
      if (!armed) return;
      armed = false;
      retireUncertain();
      unsubscribeState?.();
      unsubscribeState = null;
      ws.off('events', handleEvent);
      if (timer) { clearInterval(timer); timer = null; }
    }

    onMounted(arm);
    onActivated(arm);
    onDeactivated(disarm);
    onUnmounted(disarm);

    function onConnectionState(state) {
      if (state !== 'connected') retireUncertain();
    }

    function formatMs(ms) {
      if (ms < 1000) return `${ms}ms`;
      const s = (ms / 1000).toFixed(1);
      return `${s}s`;
    }

    function statusIcon(status) {
      if (status === 'running') return 'clock';
      if (status === 'success') return 'success';
      if (status === 'error') return 'error';
      return 'info';
    }

    return { activeTasks, recentHistory, streamOutput, formatMs, statusIcon };
  },

  template: `
    <div class="p-6 page-fade-in space-y-6">
      <h2 class="text-xl font-bold text-white flex items-center gap-2">
        <odin-icon name="target" :size="22" /> Execution Viewer
      </h2>

      <!-- Active Tasks -->
      <div class="bg-gray-800 rounded-lg p-4">
        <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Active</h3>
        <div v-if="activeTasks.length === 0" class="text-gray-500 text-sm py-4 text-center">
          No active tool executions
        </div>
        <div v-for="task in activeTasks" :key="task.id"
             class="bg-gray-900 rounded-lg p-3 mb-2"
             :class="task.fadingOut
               ? (task.status === 'error' ? 'border border-red-500/40' : 'border border-green-500/40')
               : 'border border-blue-500/30'"
             :style="task.fadingOut ? 'opacity: 0; transition: opacity 4.5s ease-out;' : ''">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span v-if="task.fadingOut" :class="task.status === 'error' ? 'text-red-400' : 'text-green-400'"><odin-icon :name="statusIcon(task.status)" :size="17" /></span>
              <span v-else class="animate-pulse text-blue-400"><odin-icon name="clock" :size="17" /></span>
              <span class="text-white font-mono text-sm font-bold">{{ task.tool }}</span>
              <span class="text-gray-500 text-xs">iter {{ task.iteration }}</span>
              <span v-if="task.agentId" class="text-gray-400 text-xs">agent {{ task.agentLabel || task.agentId }}</span>
            </div>
            <span :class="task.fadingOut ? 'text-gray-400' : 'text-blue-400'" class="font-mono text-sm">{{ formatMs(task.elapsed) }}</span>
          </div>
          <!-- Streaming output for this tool -->
          <details v-if="task.toolInput"><summary class="text-xs text-gray-400">Arguments</summary><tool-output :value="task.toolInput" label="Tool arguments" /></details>
          <tool-output v-if="streamOutput[task.id]" :value="streamOutput[task.id]" label="Streaming tool output" />
          <tool-output v-if="task.result" :value="task.result" label="Tool result" />
        </div>
      </div>

      <!-- Streaming Output (tools without active task match) -->
      <div v-if="Object.keys(streamOutput).length > 0" class="bg-gray-800 rounded-lg p-4">
        <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Live Output</h3>
        <div v-for="(output, tool) in streamOutput" :key="tool"
             class="bg-black rounded p-2 mb-2">
          <div class="text-gray-400 text-xs mb-1 font-mono break-all">{{ tool }}</div>
          <!-- break-all: one long unbroken token (a URL, a base64 blob, a deep
               path) widened this div past the viewport and scrolled the whole
               Operations page sideways on a phone. -->
          <tool-output :value="output" label="Live tool output" />
        </div>
      </div>

      <!-- Recent History -->
      <div class="bg-gray-800 rounded-lg p-4">
        <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Recent ({{ recentHistory.length }})
        </h3>
        <div v-if="recentHistory.length === 0" class="text-gray-500 text-sm py-4 text-center">
          No recent executions
        </div>
        <div v-for="task in recentHistory" :key="task.id"
             class="flex flex-wrap items-center gap-3 py-2 border-b border-gray-700/50 last:border-0">
          <span class="text-lg"><odin-icon :name="statusIcon(task.status)" :size="17" /></span>
          <span class="text-white font-mono text-sm flex-1">{{ task.tool }}</span>
          <span v-if="task.agentId" class="text-gray-400 text-xs">agent {{ task.agentLabel || task.agentId }}</span>
          <span class="text-gray-500 font-mono text-xs whitespace-nowrap">{{ formatMs(task.elapsed) }}</span>
          <details v-if="task.toolInput" class="w-full"><summary class="text-xs text-gray-400">Arguments</summary><tool-output :value="task.toolInput" label="Recent tool arguments" /></details>
          <tool-output class="w-full" :value="task.result" label="Recent tool result" />
        </div>
      </div>
    </div>
  `,
};
