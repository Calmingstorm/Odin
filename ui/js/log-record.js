import ToolOutput from './tool-output.js';

/** One row for both chronological and turn-grouped audit streams. */
export default {
  components: { ToolOutput },
  props: { entry: { type: Object, required: true } },
  emits: ['copy'],
  template: `
    <article class="log-line py-2 leading-relaxed border-b border-gray-800 min-w-0"
             :class="{ 'log-line-error': entry.level === 'ERROR', 'log-line-warning': entry.level === 'WARNING' }"
             :data-log-id="entry.id">
      <div class="flex flex-wrap items-center gap-2 break-all mb-1">
        <button class="log-ts text-gray-500 hover:text-gray-300" @click="$emit('copy', entry)"
                title="Copy complete retained record">{{ entry.ts }}</button>
        <span :class="entry.level === 'ERROR' ? 'text-red-400' : 'text-blue-400'">{{ entry.level }}</span>
        <span v-if="entry.tool" class="logs-tool-badge">{{ entry.tool }}</span>
        <span v-if="entry.record && entry.record.type" class="text-gray-500">{{ entry.record.type }}</span>
        <span v-else-if="entry.tool" class="text-gray-500">execution</span>
        <span v-if="entry.record && (entry.record.status || entry.record.metadata?.status)" class="text-gray-400">{{ entry.record.status || entry.record.metadata?.status }}</span>
        <span v-if="entry.attribution.agentId" class="text-gray-400">Agent {{ entry.attribution.label || entry.attribution.agentId }} ({{ entry.attribution.agentId }})</span>
        <span v-if="entry.attribution.turnId" class="text-gray-500">turn {{ entry.attribution.turnId }}</span>
        <span v-if="entry.attribution.parentId" class="text-gray-500">parent {{ entry.attribution.parentId }}</span>
        <span v-if="entry.attribution.rootId" class="text-gray-500">root {{ entry.attribution.rootId }}</span>
        <span v-if="entry.attribution.iteration" class="text-gray-500">iteration {{ entry.attribution.iteration }}</span>
        <span v-if="entry.attribution.callId" class="text-gray-500">call {{ entry.attribution.callId }}</span>
        <span v-if="entry.record && entry.record.execution_time_ms !== undefined" class="text-gray-500">{{ entry.record.execution_time_ms }}ms</span>
      </div>
      <div v-if="entry.record && entry.record.tool_input" class="mb-2" data-log-arguments>
        <div class="text-gray-500">Arguments</div>
        <tool-output :value="entry.record.tool_input" />
      </div>
      <tool-output v-if="entry.text" :value="entry.text" />
      <div v-if="entry.record && entry.record.error" class="mt-1 text-red-400">
        <tool-output :value="entry.record.error" />
      </div>
      <details v-if="entry.record" class="mt-1 text-gray-500">
        <summary class="cursor-pointer">Complete retained record</summary>
        <tool-output :value="entry.record" />
      </details>
    </article>`,
};
