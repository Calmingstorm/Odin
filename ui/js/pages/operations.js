import TabbedPage from './tabbed-page.js';
import ExecutionPage from './execution.js';
import AgentsPage from './agents.js';
import LoopsPage from './loops.js';
import ProcessesPage from './processes.js';
import SchedulesPage from './schedules.js';

// Exported so the command palette derives its destinations from the SAME
// list the tab strip renders. Hand-mirroring them meant a renamed tab id
// silently sent the palette to the default tab, with no error anywhere
// (tabbed-page falls back when ?tab= does not match).
export const TABS = [
    { id: 'live', label: 'Live', component: ExecutionPage },
    { id: 'agents', label: 'Agents', component: AgentsPage },
    { id: 'loops', label: 'Loops', component: LoopsPage },
    { id: 'processes', label: 'Processes', component: ProcessesPage },
    { id: 'schedules', label: 'Schedules', component: SchedulesPage },
];

export default {
  components: { TabbedPage },
  setup() {
    const tabs = TABS;
    return { tabs };
  },
  template: `<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />`,
};
