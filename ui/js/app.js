/**
 * Odin Management UI — Main App
 * Vue 3 + Vue Router (CDN globals) + Tailwind CSS
 */
import { api, ws } from './api.js';
import DashboardPage from './pages/dashboard.js';
import ChatPage from './pages/chat.js';
import OperationsPage from './pages/operations.js';
import HistoryPage from './pages/history.js';
import CapabilitiesPage from './pages/capabilities.js';
import PersonalityPage from './pages/personality.js';
import SystemPage from './pages/system.js';

const { createApp, ref, computed, onMounted, onUnmounted, watch, nextTick } = Vue;
const { createRouter, createWebHashHistory } = VueRouter;

// ---------------------------------------------------------------------------
// Router — 6 top-level items, sub-pages rendered as tabs within each
// ---------------------------------------------------------------------------
const routes = [
  { path: '/',              redirect: '/dashboard' },
  { path: '/dashboard',     component: DashboardPage,    meta: { label: 'Dashboard',     icon: '\u{1F4CA}' } },
  { path: '/chat',          component: ChatPage,          meta: { label: 'Chat',          icon: '\u{1F4AD}' } },
  { path: '/operations',    component: OperationsPage,    meta: { label: 'Operations',    icon: '\u{1F3AF}' } },
  { path: '/history',       component: HistoryPage,       meta: { label: 'History',       icon: '\u{1F4DD}' } },
  { path: '/capabilities',  component: CapabilitiesPage,  meta: { label: 'Capabilities',  icon: '\u{1F527}' } },
  { path: '/personality',   component: PersonalityPage,   meta: { label: 'Personality',   icon: '\u{1F3AD}' } },
  { path: '/system',        component: SystemPage,        meta: { label: 'System',        icon: '\u{2699}\u{FE0F}' } },
  // Redirects from old routes to new grouped locations
  { path: '/execution',  redirect: { path: '/operations', query: { tab: 'live' } } },
  { path: '/agents',     redirect: { path: '/operations', query: { tab: 'agents' } } },
  { path: '/loops',      redirect: { path: '/operations', query: { tab: 'loops' } } },
  { path: '/processes',  redirect: { path: '/operations', query: { tab: 'processes' } } },
  { path: '/schedules',  redirect: { path: '/operations', query: { tab: 'schedules' } } },
  { path: '/audit',      redirect: { path: '/history', query: { tab: 'audit' } } },
  { path: '/sessions',   redirect: { path: '/history', query: { tab: 'sessions' } } },
  { path: '/traces',     redirect: { path: '/history', query: { tab: 'traces' } } },
  { path: '/usage',      redirect: { path: '/history', query: { tab: 'usage' } } },
  { path: '/tools',      redirect: { path: '/capabilities', query: { tab: 'tools' } } },
  { path: '/skills',     redirect: { path: '/capabilities', query: { tab: 'skills' } } },
  { path: '/knowledge',  redirect: { path: '/capabilities', query: { tab: 'knowledge' } } },
  { path: '/memory',     redirect: { path: '/capabilities', query: { tab: 'memory' } } },
  { path: '/health',     redirect: { path: '/system', query: { tab: 'health' } } },
  { path: '/resources',  redirect: { path: '/system', query: { tab: 'resources' } } },
  { path: '/logs',       redirect: { path: '/system', query: { tab: 'logs' } } },
  { path: '/config',     redirect: { path: '/system', query: { tab: 'config' } } },
  { path: '/host-access', redirect: { path: '/system', query: { tab: 'host-access' } } },
  { path: '/internals',  redirect: { path: '/system', query: { tab: 'internals' } } },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// Update browser tab title on navigation
router.afterEach((to) => {
  const label = to.meta?.label;
  document.title = label ? `Odin \u2014 ${label}` : 'Odin \u2014 Management';
});

// ---------------------------------------------------------------------------
// Login component
// ---------------------------------------------------------------------------
const LoginScreen = {
  template: `
    <div class="min-h-screen flex items-center justify-center" role="main">
      <div class="hm-card w-full max-w-sm">
        <h1 id="login-title" class="text-xl font-semibold mb-1 text-center">Odin</h1>
        <p class="text-gray-400 text-sm text-center mb-4">Management Interface</p>
        <div v-if="error" class="mb-3 text-red-400 text-sm text-center" role="alert">{{ error }}</div>
        <div v-if="sessionExpired" class="mb-3 text-amber-400 text-sm text-center" role="alert">Session expired. Please log in again.</div>
        <form @submit.prevent="login" aria-labelledby="login-title">
          <label for="login-token" class="sr-only">API Token</label>
          <input
            id="login-token"
            v-model="token"
            type="password"
            placeholder="API Token"
            class="hm-input mb-3"
            autofocus
            autocomplete="current-password"
          />
          <label class="flex items-center gap-2 mb-3 text-sm text-gray-400 cursor-pointer select-none">
            <input type="checkbox" v-model="persist" class="rounded bg-gray-800 border-gray-600" />
            Stay logged in
          </label>
          <button type="submit" class="btn btn-primary w-full justify-center" :disabled="busy">
            <span v-if="busy" class="spinner" style="width:14px;height:14px;border-width:2px;" aria-hidden="true"></span>
            {{ busy ? 'Connecting...' : 'Connect' }}
          </button>
        </form>
      </div>
    </div>`,
  props: ['onLogin', 'sessionExpired'],
  setup(props) {
    const token = ref('');
    const error = ref(null);
    const busy = ref(false);
    const persist = ref(false);

    async function login() {
      busy.value = true;
      error.value = null;
      try {
        api.setPersist(persist.value);
        await api.login(token.value);
        props.onLogin();
      } catch (e) {
        error.value = e.message || 'Login failed';
      } finally {
        busy.value = false;
      }
    }
    return { token, error, busy, persist, login };
  },
};

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------
const App = {
  template: `
    <div v-if="authState === 'checking'" class="min-h-screen flex items-center justify-center" role="status" aria-label="Loading">
      <div class="spinner" aria-hidden="true"></div>
      <span class="sr-only">Loading application...</span>
    </div>
    <login-screen v-else-if="authState === 'login'" :on-login="onLogin" :session-expired="sessionExpired" />
    <div v-else class="flex min-h-screen">
      <!-- Sidebar -->
      <aside class="hm-sidebar" :class="{ collapsed: sidebarCollapsed, 'mobile-open': mobileOpen }" role="navigation" aria-label="Main navigation">
        <div class="flex items-center gap-2 px-3 py-3 border-b border-gray-800">
          <button @click="toggleSidebar" class="btn-ghost p-1 rounded sidebar-toggle-btn"
                  :aria-expanded="!sidebarCollapsed" aria-controls="sidebar-nav"
                  :aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'">
            <span style="font-size:1.1rem;" aria-hidden="true">{{ sidebarCollapsed ? '\u{25B6}' : '\u{2630}' }}</span>
          </button>
          <span class="sidebar-header-text font-semibold text-sm tracking-wide">ODIN</span>
        </div>
        <nav id="sidebar-nav" class="flex-1 py-2 overflow-y-auto" aria-label="Page navigation">
          <router-link
            v-for="r in navRoutes"
            :key="r.path"
            :to="r.path"
            class="nav-item"
            active-class="active"
            :aria-current="$route.path === r.path ? 'page' : undefined"
            @click="mobileOpen = false"
          >
            <span class="nav-icon" aria-hidden="true">{{ r.meta.icon }}</span>
            <span class="nav-label">{{ r.meta.label }}</span>
          </router-link>
        </nav>
        <div class="px-3 py-2 border-t border-gray-800 text-xs text-gray-500 sidebar-header-text">
          <div class="flex items-center gap-1.5 mb-1" aria-live="polite">
            <span class="ws-indicator" :class="'ws-' + wsState" aria-hidden="true"></span>
            <span>{{ wsLabel }}</span>
            <span v-if="wsLatency >= 0" class="text-gray-600" style="font-size:0.5625rem;">{{ wsLatency }}ms</span>
          </div>
          <div class="text-gray-600 mobile-hide" style="font-size:0.625rem;" aria-label="Keyboard shortcuts">
            <kbd class="px-1 py-0.5 bg-gray-800 rounded">/</kbd> search
            <kbd class="px-1 py-0.5 bg-gray-800 rounded ml-1">Esc</kbd> close
          </div>
        </div>
        <!-- Connection toast -->
        <transition name="ws-toast">
          <div v-if="wsToast" class="ws-toast" :class="'ws-toast-' + wsToast.level" role="status" aria-live="assertive">
            {{ wsToast.text }}
          </div>
        </transition>
      </aside>

      <!-- Mobile overlay -->
      <div v-if="mobileOpen" class="fixed inset-0 bg-black/50 z-30 md:hidden" @click="mobileOpen = false" aria-hidden="true"></div>

      <!-- Main content -->
      <main id="main-content" class="hm-main" role="main">
        <header class="hm-topbar" role="banner">
          <button class="btn-ghost p-1 rounded md:hidden" @click="mobileOpen = !mobileOpen"
                  :aria-expanded="mobileOpen" aria-controls="sidebar-nav" aria-label="Open navigation menu">
            <span style="font-size:1.1rem;" aria-hidden="true">\u{2630}</span>
          </button>
          <div class="flex items-center gap-2">
            <span class="status-dot" :class="botStatus" role="img" :aria-label="'Bot status: ' + botStatus"></span>
            <span class="text-sm font-medium">Odin</span>
          </div>
          <span v-if="botUptime" class="text-xs text-gray-500" aria-label="Uptime">{{ botUptime }}</span>
          <div class="flex-1"></div>
          <button @click="logout" class="btn btn-ghost text-xs" aria-label="Log out">Logout</button>
        </header>
        <router-view />
      </main>
    </div>`,
  setup() {
    const authState = ref('checking'); // 'checking' | 'login' | 'ready'
    const sessionExpired = ref(false);
    const sidebarCollapsed = ref(false);
    const mobileOpen = ref(false);
    const wsConnected = ref(false);
    const wsState = ref('disconnected'); // disconnected | connecting | connected | reconnecting
    const wsLatency = ref(-1);
    const wsToast = ref(null);
    let wsToastTimer = null;
    const botStatus = ref('starting');
    const botUptime = ref('');

    const navRoutes = routes.filter(r => r.meta);

    // Handle session expiry from the API client
    api.onSessionExpired = () => {
      sessionExpired.value = true;
      ws.disconnect();
      api.setToken('');
      authState.value = 'login';
    };

    // Global keyboard shortcuts
    function onKeydown(e) {
      // Esc: close mobile sidebar, or modals (modals handle their own Esc via @click.self)
      if (e.key === 'Escape') {
        if (mobileOpen.value) { mobileOpen.value = false; e.preventDefault(); return; }
      }
      // / : focus first search input on page (unless already in an input)
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        e.preventDefault();
        const input = document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');
        if (input) input.focus();
      }
    }

    // Check auth on mount
    onMounted(async () => {
      document.addEventListener('keydown', onKeydown);
      const check = await api.check();
      if (check.ok) {
        authState.value = 'ready';
        startLive();
      } else if (check.needsAuth) {
        authState.value = 'login';
      } else {
        // Server unreachable — try without auth
        authState.value = 'ready';
        startLive();
      }
    });

    function onLogin() {
      sessionExpired.value = false;
      authState.value = 'ready';
      startLive();
    }

    async function logout() {
      await api.logout();
      ws.disconnect();
      authState.value = 'login';
    }

    function toggleSidebar() {
      sidebarCollapsed.value = !sidebarCollapsed.value;
    }

    const wsLabel = computed(() => {
      switch (wsState.value) {
        case 'connected': return 'Live';
        case 'connecting': return 'Connecting\u2026';
        case 'reconnecting': return 'Reconnecting\u2026';
        default: return 'Disconnected';
      }
    });

    function showWsToast(text, level = 'info', duration = 3000) {
      wsToast.value = { text, level };
      clearTimeout(wsToastTimer);
      wsToastTimer = setTimeout(() => { wsToast.value = null; }, duration);
    }

    // Live updates
    let statusInterval = null;
    let wasConnected = false;

    function startLive() {
      ws.onStatusChange = (connected) => { wsConnected.value = connected; };
      ws.onStateChange = (state, detail) => {
        wsState.value = state;
        wsLatency.value = detail.latency ?? -1;
        if (state === 'connected') {
          if (wasConnected) {
            showWsToast('Connection restored', 'success');
          }
          wasConnected = true;
        } else if (state === 'reconnecting' && detail.attempt === 1) {
          showWsToast('Connection lost \u2014 reconnecting\u2026', 'warn');
        }
      };
      ws.connect();
      fetchStatus();
      statusInterval = setInterval(fetchStatus, 15000);
    }

    async function fetchStatus() {
      try {
        const s = await api.get('/api/status');
        botStatus.value = s.status === 'online' ? 'online' : 'starting';
        const sec = s.uptime_seconds || 0;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        botUptime.value = `${h}h ${m}m uptime`;
      } catch {
        botStatus.value = 'offline';
        botUptime.value = '';
      }
    }

    onUnmounted(() => {
      if (statusInterval) clearInterval(statusInterval);
      ws.disconnect();
      document.removeEventListener('keydown', onKeydown);
    });

    return {
      authState, sessionExpired, sidebarCollapsed, mobileOpen, wsConnected,
      wsState, wsLatency, wsLabel, wsToast,
      botStatus, botUptime, navRoutes,
      onLogin, logout, toggleSidebar,
    };
  },
};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
const app = createApp(App);
app.component('login-screen', LoginScreen);
app.use(router);
app.mount('#app');
