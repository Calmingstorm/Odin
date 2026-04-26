import TabbedPage from './tabbed-page.js';
import HealthPage from './health.js';
import ResourcesPage from './resources.js';
import LogsPage from './logs.js';
import ConfigPage from './config.js';
import DiscordConfigPage from './discord-config.js';
import HostAccessPage from './host-access.js';
import InternalsPage from './internals.js';
import UpdatePage from './update.js';

export default {
  components: { TabbedPage },
  setup() {
    const tabs = [
      { id: 'health', label: 'Health', component: HealthPage },
      { id: 'resources', label: 'Resources', component: ResourcesPage },
      { id: 'logs', label: 'Logs', component: LogsPage },
      { id: 'config', label: 'Config', component: ConfigPage },
      { id: 'discord', label: 'Discord', component: DiscordConfigPage },
      { id: 'host-access', label: 'Host Access', component: HostAccessPage },
      { id: 'internals', label: 'Internals', component: InternalsPage },
      { id: 'update', label: 'Update', component: UpdatePage },
    ];
    return { tabs };
  },
  template: `<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />`,
};
