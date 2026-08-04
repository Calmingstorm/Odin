import TabbedPage from './tabbed-page.js';
import AuditPage from './audit.js';
import SessionsPage from './sessions.js';
import TracesPage from './traces.js';
import UsagePage from './usage.js';

// Exported so the command palette derives its destinations from the SAME
// list the tab strip renders. Hand-mirroring them meant a renamed tab id
// silently sent the palette to the default tab, with no error anywhere
// (tabbed-page falls back when ?tab= does not match).
export const TABS = [
    { id: 'audit', label: 'Audit', component: AuditPage },
    { id: 'sessions', label: 'Sessions', component: SessionsPage },
    { id: 'traces', label: 'Traces', component: TracesPage },
    { id: 'usage', label: 'Usage', component: UsagePage },
];

export default {
  components: { TabbedPage },
  setup() {
    const tabs = TABS;
    return { tabs };
  },
  template: `<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />`,
};
