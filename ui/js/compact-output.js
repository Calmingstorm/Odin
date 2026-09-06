import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { compactOutput } from './compact-output-format.js';

/** The Live-tail presentation of ToolOutput. All expansion is local; no API imports. */
export default {
  name: 'CompactOutput',
  props: { value: { default: '' }, rawValue: { default: undefined }, label: { type: String, default: 'Output' } },
  setup(props) {
    const expanded = ref(false), wrapped = ref(true), rawMode = ref(false), copyStatus = ref('');
    const previewElement = ref(null), summaryElement = ref(null), layoutFolded = ref(false);
    const model = computed(() => compactOutput(props.value));
    const rawText = computed(() => {
      const value = props.rawValue === undefined ? props.value : props.rawValue;
      return typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? '';
    });
    const body = computed(() => rawMode.value ? rawText.value : model.value.formatted);
    const canExpand = computed(() => (model.value.promoted && model.value.preview.folded) || layoutFolded.value);
    const showBody = computed(() => expanded.value ? Boolean(body.value) : model.value.promoted);
    let observer;
    function measure() {
      // Do not change the fold affordance while inspecting full content.
      if (expanded.value) return;
      const el = model.value.promoted ? previewElement.value : summaryElement.value;
      layoutFolded.value = Boolean(el && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1));
    }
    function observe() {
      observer?.disconnect();
      for (const el of [previewElement.value, summaryElement.value]) if (el) observer?.observe(el);
      measure();
    }
    function toggleExpanded() { expanded.value = !expanded.value; if (!expanded.value) rawMode.value = false; }
    function toggleRaw() { rawMode.value = !rawMode.value; expanded.value = true; copyStatus.value = ''; }
    async function copyOutput() {
      const received = props.value;
      try {
        await navigator.clipboard.writeText(body.value);
        if (received === props.value) copyStatus.value = 'Copied';
      } catch { if (received === props.value) copyStatus.value = 'Copy unavailable — select text manually'; }
    }
    watch(() => props.value, () => { expanded.value = false; rawMode.value = false; copyStatus.value = ''; });
    watch([previewElement, summaryElement, expanded, wrapped, model], () => nextTick(observe), { flush: 'post' });
    onMounted(() => { observer = new ResizeObserver(measure); observe(); });
    onUnmounted(() => observer?.disconnect());
    return { expanded, wrapped, rawMode, copyStatus, previewElement, summaryElement, model, body,
      canExpand, showBody, toggleExpanded, toggleRaw, copyOutput };
  },
  template: `
    <section class="output-renderer output-compact" :class="{ 'output-compact-expanded': expanded }" :aria-label="label">
      <div class="output-event-row">
        <div class="output-event-heading">
          <slot name="header" />
          <div class="output-compact-actions" @pointerdown.stop @keydown.stop>
            <div v-if="model.chars > 0" class="output-controls">
              <button type="button" :aria-pressed="wrapped" @click="wrapped = !wrapped">Wrap</button>
              <button type="button" :aria-pressed="rawMode" @click="toggleRaw" title="Inspect raw retained record">Raw</button>
              <button type="button" @click="copyOutput" :title="rawMode ? 'Copy raw retained record' : 'Copy complete display body'">Copy</button>
            </div>
            <button type="button" class="output-expand" :aria-expanded="expanded" @click="toggleExpanded"
                    :title="canExpand ? 'More received text hidden locally — expand without retrieving' : 'Inspect already-loaded record'">
              {{ expanded ? 'Collapse' : model.promoted ? 'Expand' : 'Inspect' }}
            </button>
          </div>
        </div>
        <button v-if="model.warnings.length" type="button" class="output-compact-warning" @click="expanded = true"
                @pointerdown.stop @keydown.stop :aria-label="model.warnings.join('; ') + ' — inspect record'" :title="model.warnings.join('; ')">
          <span class="output-warning-full">{{ model.warnings.join('; ') }}</span><span class="output-warning-short" aria-hidden="true">Warning</span>
        </button>
        <span ref="summaryElement" class="output-inline-summary">
          <slot name="context" />
          <span v-if="model.outcome" class="output-compact-outcome" :title="model.outcome">{{ model.outcome }}</span>
          {{ model.summary }}
        </span>
      </div>
      <pre v-if="showBody" ref="previewElement" class="output-body output-compact-preview"
           :class="{ 'output-wrapped': wrapped, 'output-compact-folded': !expanded }">{{ expanded ? body : model.preview.text }}</pre>
      <div v-if="expanded && !rawMode" class="output-compact-detail">
        <div v-if="model.warnings.length" class="output-compact-warning-detail">{{ model.warnings.join('; ') }}</div>
        <div v-if="model.header.length" class="output-compact-envelope-detail">{{ model.header.join(' · ') }}</div>
        <slot name="details" />
      </div>
      <span v-if="copyStatus" class="output-copy-status" role="status">{{ copyStatus }}</span>
    </section>`,
};
