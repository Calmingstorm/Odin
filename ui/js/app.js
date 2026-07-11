/**
 * Odin Management UI — Main App
 * Vue 3 + Vue Router (CDN globals) + Tailwind CSS
 */
import '../css/fonts.css';
import '../css/tailwind.css';
import '../css/style.css';
import '../css/foundation.css';

import { api, ws } from './api.js';
import { ToastContainer } from './toast.js';
import { ConfirmHost } from './confirm.js';
import { CommandPalette, openPalette } from './palette.js';
import { OdinIcon } from './icons.js';
import { ModalFocusDirective } from './focus-trap.js';
import DashboardPage from './pages/dashboard.js';
import ChatPage from './pages/chat.js';
import OperationsPage from './pages/operations.js';
import HistoryPage from './pages/history.js';
import CapabilitiesPage from './pages/capabilities.js';
import PersonalityPage from './pages/personality.js';
import SystemPage from './pages/system.js';
import { computed, createApp, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';


// ---------------------------------------------------------------------------
// Router — 6 top-level items, sub-pages rendered as tabs within each
// ---------------------------------------------------------------------------
const routes = [
  { path: '/',              redirect: '/dashboard' },
  { path: '/dashboard',     component: DashboardPage,    meta: { label: 'Dashboard',    icon: 'dashboard',    section: 'Workspace', description: 'System posture and recent activity' } },
  { path: '/chat',          component: ChatPage,          meta: { label: 'Chat',         icon: 'chat',         section: 'Workspace', description: 'Direct operator conversation' } },
  { path: '/operations',    component: OperationsPage,    meta: { label: 'Operations',   icon: 'operations',   section: 'Operate',   description: 'Execution, agents, loops, processes, and schedules' } },
  { path: '/history',       component: HistoryPage,       meta: { label: 'History',      icon: 'history',      section: 'Observe',   description: 'Audit trail, sessions, traces, and usage' } },
  { path: '/capabilities',  component: CapabilitiesPage,  meta: { label: 'Capabilities', icon: 'capabilities', section: 'Manage',    description: 'Tools, skills, knowledge, and memory' } },
  { path: '/personality',   component: PersonalityPage,   meta: { label: 'Personality',  icon: 'personality',  section: 'Manage',    description: 'Behavior and response profile' } },
  { path: '/system',        component: SystemPage,        meta: { label: 'System',       icon: 'system',       section: 'Manage',    description: 'Health, configuration, access, and updates' } },
  // Redirects from old routes to new grouped locations. Preserve deep links.
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
  { path: '/learned',    redirect: { path: '/capabilities', query: { tab: 'learned' } } },
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
    <div class="login-shell" role="main">
      <div class="login-panel">
        <div class="login-brand" aria-hidden="true"><odin-icon name="brand" :size="30" /></div>
        <p class="login-eyebrow">Operator console</p>
        <h1 id="login-title" class="login-title">Odin</h1>
        <p class="login-subtitle">Authenticate to manage the system.</p>
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
    <div v-if="authState === 'checking'" class="app-loading" role="status" aria-label="Loading">
      <div class="brand-loader"><odin-icon name="brand" :size="28" /></div>
      <span class="sr-only">Loading application...</span>
    </div>
    <login-screen v-else-if="authState === 'login'" :on-login="onLogin" :session-expired="sessionExpired" />
    <div v-else class="app-shell">
      <aside ref="sidebarEl" class="hm-sidebar" :class="{ collapsed: sidebarCollapsed, 'mobile-open': mobileOpen }" aria-label="Primary navigation">
        <div class="sidebar-brand">
          <div class="brand-mark" aria-hidden="true"><odin-icon name="brand" :size="24" /></div>
          <div class="sidebar-brand-copy">
            <span class="brand-wordmark">ODIN</span>
            <span class="brand-caption">Management</span>
          </div>
          <button @click="toggleSidebar" class="icon-btn sidebar-toggle-btn"
                  :aria-expanded="!sidebarCollapsed" aria-controls="sidebar-nav"
                  :aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'">
            <odin-icon :name="sidebarCollapsed ? 'chevronRight' : 'chevronLeft'" :size="17" />
          </button>
        </div>
        <nav id="sidebar-nav" class="sidebar-nav" aria-label="Page navigation">
          <div v-for="group in navGroups" :key="group.name" class="nav-group">
            <div class="nav-section-label">{{ group.name }}</div>
            <router-link
              v-for="r in group.routes"
              :key="r.path"
              :to="r.path"
              class="nav-item"
              active-class="active"
              :aria-current="$route.path === r.path ? 'page' : undefined"
              :title="sidebarCollapsed ? r.meta.label : undefined"
              @click="mobileOpen = false"
            >
              <span class="nav-icon" aria-hidden="true"><odin-icon :name="r.meta.icon" :size="18" /></span>
              <span class="nav-label">{{ r.meta.label }}</span>
            </router-link>
          </div>
        </nav>
        <div class="sidebar-footer">
          <div class="connection-card" :class="'connection-' + wsState" aria-live="polite">
            <span class="ws-indicator" :class="'ws-' + wsState" aria-hidden="true"></span>
            <div class="connection-copy">
              <span class="connection-label">{{ wsLabel }}</span>
              <span v-if="wsLatency >= 0" class="connection-latency">{{ wsLatency }}ms</span>
            </div>
          </div>
          <button class="shortcut-hint" @click="openPalette" aria-label="Open command palette">
            <odin-icon name="command" :size="14" />
            <span>Quick jump</span><kbd>Ctrl K</kbd>
          </button>
        </div>
        <transition name="ws-toast">
          <div v-if="wsToast" class="ws-toast" :class="'ws-toast-' + wsToast.level" role="status" aria-live="assertive">
            {{ wsToast.text }}
          </div>
        </transition>
      </aside>

      <div v-if="mobileOpen" class="mobile-scrim" @click="mobileOpen = false" aria-hidden="true"></div>

      <main id="main-content" class="hm-main" role="main">
        <header class="hm-topbar" role="banner">
          <button ref="mobileMenuButton" class="icon-btn mobile-menu-btn" @click="toggleMobileNavigation"
                  :aria-expanded="mobileOpen" aria-controls="sidebar-nav" aria-label="Open navigation menu">
            <odin-icon name="menu" :size="20" />
          </button>
          <div class="topbar-context">
            <span class="topbar-kicker">{{ currentSection }}</span>
            <div class="topbar-title-row">
              <h1>{{ currentPage }}</h1>
              <span class="status-pill" :class="'status-' + botStatus">
                <span class="status-dot" :class="botStatus" aria-hidden="true"></span>
                {{ botStatus }}
              </span>
            </div>
          </div>
          <p class="topbar-description">{{ currentDescription }}</p>
          <div class="topbar-actions">
            <span v-if="botUptime" class="uptime-label" aria-label="Uptime">{{ botUptime }}</span>
            <button class="command-trigger" @click="openPalette" aria-label="Open command palette">
              <odin-icon name="search" :size="15" />
              <span>Jump to</span><kbd>Ctrl K</kbd>
            </button>
            <button @click="logout" class="icon-btn" aria-label="Log out" title="Log out">
              <odin-icon name="logout" :size="17" />
            </button>
          </div>
        </header>
        <div class="page-viewport"><router-view /></div>
      </main>
    </div>
    <toast-container />
    <confirm-host />
    <command-palette />`,
  setup() {
    const authState = ref('checking'); // 'checking' | 'login' | 'ready'
    const sessionExpired = ref(false);
    const sidebarCollapsed = ref(false);
    const mobileOpen = ref(false);
    const sidebarEl = ref(null);
    const mobileMenuButton = ref(null);
    let mobileReturnFocus = null;
    const wsConnected = ref(false);
    const wsState = ref('disconnected'); // disconnected | connecting | connected | reconnecting
    const wsLatency = ref(-1);
    const wsToast = ref(null);
    let wsToastTimer = null;
    const botStatus = ref('starting');
    const botUptime = ref('');

    const navRoutes = routes.filter(r => r.meta);
    const navGroups = computed(() => ['Workspace', 'Operate', 'Observe', 'Manage'].map(name => ({
      name,
      routes: navRoutes.filter(route => route.meta.section === name),
    })).filter(group => group.routes.length));
    const currentPage = computed(() => router.currentRoute.value.meta?.label || 'Odin');
    const currentSection = computed(() => router.currentRoute.value.meta?.section || 'Management');
    const currentDescription = computed(() => router.currentRoute.value.meta?.description || 'Management console');

    // Handle session expiry from the API client
    api.onSessionExpired = () => {
      sessionExpired.value = true;
      ws.disconnect();
      api.setToken('');
      authState.value = 'login';
    };

    // Global keyboard shortcuts
    function onKeydown(e) {
      // Ctrl+K / Cmd+K: open command palette (only when authenticated)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        if (authState.value === 'ready') {
          e.preventDefault();
          openPalette();
        }
        return;
      }
      // Keep keyboard navigation inside the open mobile drawer.
      if (mobileOpen.value && e.key === 'Tab') {
        const items = [...(sidebarEl.value?.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])];
        if (items.length) {
          const first = items[0];
          const last = items[items.length - 1];
          if (e.shiftKey && (document.activeElement === first || !sidebarEl.value.contains(document.activeElement))) {
            e.preventDefault(); last.focus(); return;
          }
          if (!e.shiftKey && (document.activeElement === last || !sidebarEl.value.contains(document.activeElement))) {
            e.preventDefault(); first.focus(); return;
          }
        }
      }
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

    function toggleMobileNavigation() {
      mobileOpen.value = !mobileOpen.value;
    }

    watch(mobileOpen, async open => {
      if (open) {
        mobileReturnFocus = document.activeElement;
        await nextTick();
        sidebarEl.value?.querySelector('.nav-item')?.focus();
      } else if (mobileReturnFocus?.isConnected) {
        const target = mobileReturnFocus;
        mobileReturnFocus = null;
        requestAnimationFrame(() => target.focus());
      }
    });

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
      if (statusInterval) clearInterval(statusInterval);
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
      botStatus, botUptime, navRoutes, navGroups,
      currentPage, currentSection, currentDescription, sidebarEl, mobileMenuButton,
      onLogin, logout, toggleSidebar, toggleMobileNavigation, openPalette,
    };
  },
};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
const app = createApp(App);
app.component('odin-icon', OdinIcon);
app.component('login-screen', LoginScreen);
app.component('toast-container', ToastContainer);
app.component('confirm-host', ConfirmHost);
app.component('command-palette', CommandPalette);
app.directive('modal-focus', ModalFocusDirective);
app.use(router);
app.mount('#app');
