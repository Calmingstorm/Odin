import TabbedPage from './tabbed-page.js';
import ToolsPage from './tools.js';
import SkillsPage from './skills.js';
import KnowledgePage from './knowledge.js';
import MemoryPage from './memory.js';
import LearnedPage from './learned.js';

// Exported so the command palette derives its destinations from the SAME
// list the tab strip renders. Hand-mirroring them meant a renamed tab id
// silently sent the palette to the default tab, with no error anywhere
// (tabbed-page falls back when ?tab= does not match).
export const TABS = [
    { id: 'tools', label: 'Tools', component: ToolsPage },
    { id: 'skills', label: 'Skills', component: SkillsPage },
    { id: 'knowledge', label: 'Knowledge', component: KnowledgePage },
    { id: 'memory', label: 'Memory', component: MemoryPage },
    { id: 'learned', label: 'Learned', component: LearnedPage },
];

export default {
  components: { TabbedPage },
  setup() {
    const tabs = TABS;
    return { tabs };
  },
  template: `<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />`,
};
