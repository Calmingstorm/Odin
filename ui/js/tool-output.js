import { computed, ref, watch } from 'vue';
import { parseOutput, foldText } from './output-format.js';
export { parseOutput, foldText } from './output-format.js';

/** Inert display: expansion reveals only already received text. */
export default {
  name: 'ToolOutput',
  props: { value: { default: '' }, label: { type: String, default: 'Output' } },
  setup(props) {
    const expanded = ref(false), wrapped = ref(true), rawMode = ref(false), copyStatus = ref('');
    const model = computed(() => parseOutput(props.value));
    const sections = computed(() => rawMode.value ? [{ label: 'Raw received value', text: model.value.raw }] : model.value.sections);
    const foldedSections = computed(() => {
      let lines = 30, chars = 6000;
      return sections.value.map(section => {
        const fold = foldText(section.text, lines, chars);
        lines = Math.max(0, lines - fold.lines); chars = Math.max(0, chars - fold.chars);
        return { ...section, display: expanded.value ? section.text : fold.text, folded: fold.folded };
      });
    });
    const canExpand = computed(() => foldedSections.value.some(section => section.folded));
    const copyValue = computed(() => rawMode.value ? model.value.raw : sections.value.map(section => section.label ? `${section.label}\n${section.text}` : section.text).join('\n\n'));
    async function copyOutput() {
      const received = props.value;
      try {
        await navigator.clipboard.writeText(copyValue.value);
        if (props.value === received) copyStatus.value = 'Copied';
      } catch {
        if (props.value === received) copyStatus.value = 'Copy unavailable — select text manually';
      }
    }
    watch(() => props.value, () => { expanded.value = false; copyStatus.value = ''; });
    watch(rawMode, () => { expanded.value = false; copyStatus.value = ''; });
    return { expanded, wrapped, rawMode, copyStatus, model, foldedSections, canExpand, copyOutput };
  },
  template: `
    <section class="output-renderer" :aria-label="label">
      <div class="output-summary">
        <strong>{{ model.kind }}</strong>
        <span v-for="(item, index) in model.header" :key="index">{{ item }}</span>
      </div>
      <div class="output-controls">
        <button type="button" class="btn btn-ghost" :aria-pressed="wrapped" @click="wrapped = !wrapped">Wrap</button>
        <button type="button" class="btn btn-ghost" :aria-pressed="rawMode" @click="rawMode = !rawMode">Raw</button>
        <button type="button" class="btn btn-ghost" @click="copyOutput" :title="rawMode ? 'Copy exact received value, including locally folded text' : 'Copy formatted body, including locally folded text'">Copy</button>
        <span role="status">{{ copyStatus }}</span>
      </div>
      <div v-for="(section, index) in foldedSections" :key="index" class="output-section">
        <div v-if="section.label" class="output-section-label">{{ section.label }}</div>
        <pre class="output-body" :class="{ 'output-wrapped': wrapped }">{{ section.display }}</pre>
        <span v-if="section.folded && !expanded" class="output-fold-note">More received text hidden locally.</span>
      </div>
      <button v-if="canExpand" type="button" class="btn btn-ghost output-expand" :aria-expanded="expanded" @click="expanded = !expanded">
        {{ expanded ? 'Collapse' : 'Expand received text' }}
      </button>
    </section>
  `,
};
