import TabbedPage from './tabbed-page.js';
import ToolsPage from './tools.js';
import SkillsPage from './skills.js';
import KnowledgePage from './knowledge.js';
import MemoryPage from './memory.js';
import LearnedPage from './learned.js';

export default {
  components: { TabbedPage },
  setup() {
    const tabs = [
      { id: 'tools', label: 'Tools', component: ToolsPage },
      { id: 'skills', label: 'Skills', component: SkillsPage },
      { id: 'knowledge', label: 'Knowledge', component: KnowledgePage },
      { id: 'memory', label: 'Memory', component: MemoryPage },
      { id: 'learned', label: 'Learned', component: LearnedPage },
    ];
    return { tabs };
  },
  template: `<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />`,
};
