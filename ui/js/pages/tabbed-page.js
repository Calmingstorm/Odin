/**
 * TabbedPage — Reusable wrapper that renders sub-pages as tabs
 */
const { ref, computed, watch } = Vue;

export default {
  props: {
    tabs: { type: Array, required: true },
    // Each tab: { id: 'live', label: 'Live', component: ComponentRef }
    defaultTab: { type: String, default: '' },
  },
  setup(props) {
    const activeTab = ref(props.defaultTab || props.tabs[0]?.id || '');

    const activeComponent = computed(() => {
      const tab = props.tabs.find(t => t.id === activeTab.value);
      return tab?.component || null;
    });

    return { activeTab, activeComponent };
  },
  template: `
    <div>
      <div class="flex border-b border-gray-700 mb-4 overflow-x-auto">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          class="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors"
          :class="activeTab === tab.id
            ? 'text-blue-400 border-b-2 border-blue-400'
            : 'text-gray-400 hover:text-gray-200'"
        >{{ tab.label }}</button>
      </div>
      <component :is="activeComponent" />
    </div>
  `,
};
