import TabbedPage from './tabbed-page.js';
import AuditPage from './audit.js';
import SessionsPage from './sessions.js';
import TracesPage from './traces.js';
import UsagePage from './usage.js';

export default {
  components: { TabbedPage },
  setup() {
    const tabs = [
      { id: 'audit', label: 'Audit', component: AuditPage },
      { id: 'sessions', label: 'Sessions', component: SessionsPage },
      { id: 'traces', label: 'Traces', component: TracesPage },
      { id: 'usage', label: 'Usage', component: UsagePage },
    ];
    return { tabs };
  },
  template: `<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />`,
};
