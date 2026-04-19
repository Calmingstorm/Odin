/**
 * TabbedPage — Reusable wrapper with URL-driven tabs
 * Tab state persisted in query param (?tab=agents) for deep-linking,
 * back/forward support, and refresh survival.
 */
const { computed, watch, onMounted } = Vue;
const { useRoute, useRouter } = VueRouter;

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
      set(val) {
        router.replace({ query: { ...route.query, tab: val } });
      },
    });

    const activeComponent = computed(() => {
      const tab = props.tabs.find(t => t.id === activeTab.value);
      return tab?.component || null;
    });

    const activeLabel = computed(() => {
      const tab = props.tabs.find(t => t.id === activeTab.value);
      return tab?.label || '';
    });

    watch(activeLabel, (label) => {
      if (props.groupLabel && label) {
        document.title = `Odin \u2014 ${props.groupLabel} \u203A ${label}`;
      }
    }, { immediate: true });

    return { activeTab, activeComponent, activeLabel };
  },
  template: `
    <div>
      <div class="flex border-b border-gray-700 mb-4 overflow-x-auto" role="tablist" :aria-label="groupLabel + ' navigation'">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          role="tab"
          :id="'tab-' + tab.id"
          :aria-selected="activeTab === tab.id"
          :aria-controls="'panel-' + tab.id"
          class="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors"
          :class="activeTab === tab.id
            ? 'text-blue-400 border-b-2 border-blue-400'
            : 'text-gray-400 hover:text-gray-200'"
        >{{ tab.label }}</button>
      </div>
      <div role="tabpanel" :id="'panel-' + activeTab" :aria-labelledby="'tab-' + activeTab">
        <keep-alive>
          <component :is="activeComponent" :key="activeTab" />
        </keep-alive>
      </div>
    </div>
  `,
};
