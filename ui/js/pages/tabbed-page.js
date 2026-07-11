/**
 * TabbedPage — URL-driven section navigation with preserved deep links.
 */
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export default {
  props: {
    tabs: { type: Array, required: true },
    defaultTab: { type: String, default: '' },
    groupLabel: { type: String, default: '' },
  },
  setup(props) {
    const route = useRoute();
    const router = useRouter();
    const activeTab = computed({
      get() {
        const q = route.query.tab;
        if (q && props.tabs.some(t => t.id === q)) return q;
        return props.defaultTab || props.tabs[0]?.id || '';
      },
      set(val) { router.replace({ query: { ...route.query, tab: val } }); },
    });
    const activeComponent = computed(() => props.tabs.find(t => t.id === activeTab.value)?.component || null);
    const activeLabel = computed(() => props.tabs.find(t => t.id === activeTab.value)?.label || '');
    watch(activeLabel, label => {
      if (props.groupLabel && label) document.title = `Odin — ${props.groupLabel} › ${label}`;
    }, { immediate: true });
    function onTabKeydown(event, index) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % props.tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + props.tabs.length) % props.tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = props.tabs.length - 1;
      activeTab.value = props.tabs[next].id;
      requestAnimationFrame(() => document.getElementById('tab-' + props.tabs[next].id)?.focus());
    }
    return { activeTab, activeComponent, activeLabel, onTabKeydown };
  },
  template: `
    <section class="section-shell" :aria-label="groupLabel">
      <div class="section-tabs-wrap">
        <div class="section-tabs" role="tablist" :aria-label="groupLabel + ' navigation'">
          <button v-for="(tab, index) in tabs" :key="tab.id" @click="activeTab = tab.id"
            @keydown="onTabKeydown($event, index)" role="tab" :id="'tab-' + tab.id"
            :aria-selected="activeTab === tab.id" :aria-controls="'panel-' + tab.id"
            :tabindex="activeTab === tab.id ? 0 : -1" class="section-tab"
            :class="{ active: activeTab === tab.id }">{{ tab.label }}</button>
        </div>
      </div>
      <div class="section-panel" role="tabpanel" :id="'panel-' + activeTab" :aria-labelledby="'tab-' + activeTab">
        <keep-alive><component :is="activeComponent" :key="activeTab" /></keep-alive>
      </div>
    </section>
  `,
};
