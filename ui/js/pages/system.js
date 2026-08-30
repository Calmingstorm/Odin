import TabbedPage from './tabbed-page.js';
import HealthPage from './health.js';
import ResourcesPage from './resources.js';
import LogsPage from './logs.js';
import ConfigPage from './config.js';
import DiscordConfigPage from './discord-config.js';
import HostAccessPage from './host-access.js';
import ApiTokensPage from './api-tokens.js';
import LLMConfigPage from './llm-config.js';
import InternalsPage from './internals.js';
import TurnStatePage from './turn-state.js';
import UpdatePage from './update.js';

// Exported so the command palette derives its destinations from the SAME
// list the tab strip renders. Hand-mirroring them meant a renamed tab id
// silently sent the palette to the default tab, with no error anywhere
// (tabbed-page falls back when ?tab= does not match).
export const TABS = [
    { id: 'health', label: 'Health', component: HealthPage },
    { id: 'resources', label: 'Resources', component: ResourcesPage },
    { id: 'logs', label: 'Logs', component: LogsPage },
    { id: 'config', label: 'Config', component: ConfigPage },
    { id: 'discord', label: 'Discord', component: DiscordConfigPage },
    { id: 'host-access', label: 'Host Access', component: HostAccessPage },
    { id: 'api-tokens', label: 'API Tokens', component: ApiTokensPage },
    { id: 'llm', label: 'LLM Config', component: LLMConfigPage },
    { id: 'internals', label: 'Internals', component: InternalsPage },
    { id: 'turn-state', label: 'Turn State', component: TurnStatePage },
    { id: 'update', label: 'Update', component: UpdatePage },
];

export default {
  components: { TabbedPage },
  setup() {
    const tabs = TABS;
    return { tabs };
  },
  template: `<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />`,
};
