import TabbedPage from './tabbed-page.js';
import HealthPage from './health.js';
import ResourcesPage from './resources.js';
import LogsPage from './logs.js';
import ConfigPage from './config.js';
import InternalsPage from './internals.js';

export default {
  components: { TabbedPage },
  setup() {
    const tabs = [
      { id: 'health', label: 'Health', component: HealthPage },
      { id: 'resources', label: 'Resources', component: ResourcesPage },
      { id: 'logs', label: 'Logs', component: LogsPage },
      { id: 'config', label: 'Config', component: ConfigPage },
      { id: 'internals', label: 'Internals', component: InternalsPage },
    ];
    return { tabs };
  },
  template: `<tabbed-page :tabs="tabs" default-tab="health" />`,
};
