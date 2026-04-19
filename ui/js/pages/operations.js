import TabbedPage from './tabbed-page.js';
import ExecutionPage from './execution.js';
import AgentsPage from './agents.js';
import LoopsPage from './loops.js';
import ProcessesPage from './processes.js';
import SchedulesPage from './schedules.js';

export default {
  components: { TabbedPage },
  setup() {
    const tabs = [
      { id: 'live', label: 'Live', component: ExecutionPage },
      { id: 'agents', label: 'Agents', component: AgentsPage },
      { id: 'loops', label: 'Loops', component: LoopsPage },
      { id: 'processes', label: 'Processes', component: ProcessesPage },
      { id: 'schedules', label: 'Schedules', component: SchedulesPage },
    ];
    return { tabs };
  },
  template: `<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />`,
};
