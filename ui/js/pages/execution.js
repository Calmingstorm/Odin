/**
 * Execution Viewer — Live tool execution dashboard
 * Shows active tool calls, streaming output, and execution history
 */
import { api, ws } from '../api.js';
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';

export default {
  setup() {
    const activeTasks = ref([]);
    const recentHistory = ref([]);
    const streamOutput = ref({});
    const maxHistory = 50;

    function handleEvent(event) {
      const payload = event.payload || event;
      const type = payload.type || event.type;

      if (type === 'tool_start') {
        const task = {
          id: `${payload.action}-${Date.now()}`,
          tool: payload.action,
          actor: payload.actor || '',
          channel: payload.channel_id || '',
          iteration: payload.metadata?.iteration ?? 0,
          startTime: Date.now(),
          elapsed: 0,
          status: 'running',
          output: '',
          result: '',
        };
        activeTasks.value.unshift(task);
        return;
      }

      if (type === 'tool_end') {
        // Tasks are unshifted, so findIndex returns the NEWEST running task
        // with this name: with two concurrent run_command calls the first
        // completion closed the second card (wrong elapsed/result) and left
        // the first running forever. Match the OLDEST running task instead,
        // which is the one that completes first absent a call id from the
        // backend to pair them exactly.
        let idx = -1;
        for (let i = activeTasks.value.length - 1; i >= 0; i--) {
          const t = activeTasks.value[i];
          if (t.tool === payload.action && t.status === 'running') { idx = i; break; }
        }
        if (idx >= 0) {
          const task = activeTasks.value[idx];
          task.status = payload.metadata?.error ? 'error' : 'success';
          task.elapsed = payload.metadata?.elapsed_ms || (Date.now() - task.startTime);
          task.result = payload.detail || '';
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
        const key = payload.tool_name || 'unknown';
        if (payload.finished) {
          delete streamOutput.value[key];
        } else {
          const current = streamOutput.value[key] || '';
          const lines = (current + (payload.chunk || '')).split('\n');
          streamOutput.value[key] = lines.slice(-30).join('\n');
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

    function arm() {
      if (armed) return;
      armed = true;
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
      ws.off('events', handleEvent);
      if (timer) { clearInterval(timer); timer = null; }
    }

    onMounted(arm);
    onActivated(arm);
    onDeactivated(disarm);
    onUnmounted(disarm);

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
            </div>
            <span :class="task.fadingOut ? 'text-gray-400' : 'text-blue-400'" class="font-mono text-sm">{{ formatMs(task.elapsed) }}</span>
          </div>
          <!-- Streaming output for this tool -->
          <div v-if="streamOutput[task.tool]"
               class="bg-black rounded p-2 mt-2 max-h-48 overflow-y-auto font-mono text-xs text-green-400 whitespace-pre-wrap">{{ streamOutput[task.tool] }}</div>
        </div>
      </div>

      <!-- Streaming Output (tools without active task match) -->
      <div v-if="Object.keys(streamOutput).length > 0" class="bg-gray-800 rounded-lg p-4">
        <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Live Output</h3>
        <div v-for="(output, tool) in streamOutput" :key="tool"
             class="bg-black rounded p-2 mb-2">
          <div class="text-gray-400 text-xs mb-1 font-mono">{{ tool }}</div>
          <div class="max-h-64 overflow-y-auto font-mono text-xs text-green-400 whitespace-pre-wrap">{{ output }}</div>
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
             class="flex items-center gap-3 py-2 border-b border-gray-700/50 last:border-0">
          <span class="text-lg"><odin-icon :name="statusIcon(task.status)" :size="17" /></span>
          <span class="text-white font-mono text-sm flex-1">{{ task.tool }}</span>
          <span class="text-gray-400 text-xs max-w-md truncate">{{ task.result }}</span>
          <span class="text-gray-500 font-mono text-xs whitespace-nowrap">{{ formatMs(task.elapsed) }}</span>
        </div>
      </div>
    </div>
  `,
};
