/**
 * Odin Management UI — API Client + WebSocket Manager
 *
 * Usage:
 *   import { api, ws } from './api.js';
 *   const status = await api.get('/api/status');
 *   ws.connect(); ws.subscribe('events', handler);
 */

class OdinAPI {
  constructor() {
    this._persist = localStorage.getItem('odin_persist') === '1';
    this._token = this._persist
      ? (localStorage.getItem('odin_token') || '')
      : (sessionStorage.getItem('odin_token') || '');
    const store = this._persist ? localStorage : sessionStorage;
    this._sessionTimeout = parseInt(store.getItem('odin_session_timeout') || '0', 10);
    this._lastActivity = Date.now();
    this._activityTimer = null;
    this.onSessionExpired = null;
    if (this._token && this._sessionTimeout > 0) {
      this._startActivityMonitor();
    }
  }

  get token() { return this._token; }
  get sessionTimeout() { return this._sessionTimeout; }

  setToken(token, timeoutSeconds = 0) {
    this._token = token;
    this._sessionTimeout = timeoutSeconds;
    this._lastActivity = Date.now();
    if (token) {
      const store = this._persist ? localStorage : sessionStorage;
      store.setItem('odin_token', token);
      if (this._persist) localStorage.setItem('odin_persist', '1');
      if (timeoutSeconds > 0) {
        store.setItem('odin_session_timeout', String(timeoutSeconds));
      } else {
        store.removeItem('odin_session_timeout');
      }
      this._startActivityMonitor();
    } else {
      sessionStorage.removeItem('odin_token');
      sessionStorage.removeItem('odin_session_timeout');
      localStorage.removeItem('odin_token');
      localStorage.removeItem('odin_persist');
      localStorage.removeItem('odin_session_timeout');
      this._stopActivityMonitor();
    }
  }

  setPersist(persist) {
    this._persist = persist;
  }

  _startActivityMonitor() {
    this._stopActivityMonitor();
    if (this._sessionTimeout <= 0) return;
    this._activityTimer = setInterval(() => {
      const elapsed = (Date.now() - this._lastActivity) / 1000;
      if (elapsed >= this._sessionTimeout) {
        this._stopActivityMonitor();
        if (this.onSessionExpired) this.onSessionExpired();
      }
    }, 10000); // Check every 10s
  }

  _stopActivityMonitor() {
    if (this._activityTimer) {
      clearInterval(this._activityTimer);
      this._activityTimer = null;
    }
  }

  _headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    if (this._token) h['Authorization'] = `Bearer ${this._token}`;
    return h;
  }

  async _request(method, path, body = null, { signal } = {}) {
    this._lastActivity = Date.now();
    const opts = { method, headers: this._headers(), signal };
    if (body !== null) opts.body = JSON.stringify(body);
    const resp = await fetch(path, opts);
    if (resp.status === 401) {
      throw new AuthError('Unauthorized');
    }
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      const msg = data?.error || `HTTP ${resp.status}`;
      throw new ApiError(msg, resp.status, data);
    }
    return data;
  }

  get(path, options = {}) { return this._request('GET', path, null, options); }

  /** GET returning a Blob, for downloads.
   *
   * The alternative is putting the bearer token in a URL so an <a download>
   * can carry it — which writes the credential into browser history, the
   * referrer chain, and every server access log that records query strings.
   * The token belongs in the Authorization header, so the download has to go
   * through fetch and be handed to the browser as an object URL. */
  async getBlob(path) {
    this._lastActivity = Date.now();
    const resp = await fetch(path, { method: 'GET', headers: this._headers() });
    if (resp.status === 401) throw new AuthError('Unauthorized');
    if (!resp.ok) {
      const data = await resp.json().catch(() => null);
      throw new ApiError(data?.error || `HTTP ${resp.status}`, resp.status, data);
    }
    return resp.blob();
  }
  post(path, data) { return this._request('POST', path, data); }
  put(path, data) { return this._request('PUT', path, data); }
  del(path) { return this._request('DELETE', path); }

  /** Authenticate with the server. Returns session info or throws. */
  async login(token) {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      throw new AuthError(data?.error || 'Login failed');
    }
    this.setToken(data.session_id, data.timeout_seconds || 0);
    return data;
  }

  /** Logout — invalidate the server-side session. */
  async logout() {
    // Build the authenticated request before clearing local state; _request()
    // calls fetch synchronously up to its first await, so the request retains
    // the session credential while local privilege ends immediately even if
    // the network never settles.
    const request = this.post('/api/auth/logout', {});
    this.setToken('');
    try { await request; } catch { /* ignore errors during logout */ }
  }

  /** Check if the server is reachable and auth is valid. */
  async check() {
    try {
      await this.get('/api/status');
      return { ok: true, needsAuth: false };
    } catch (e) {
      if (e instanceof AuthError) return { ok: false, needsAuth: true };
      return { ok: false, needsAuth: false, error: e.message };
    }
  }
}

class AuthError extends Error {
  constructor(msg) { super(msg); this.name = 'AuthError'; }
}

class ApiError extends Error {
  constructor(msg, status, data) {
    super(msg);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

class OdinWebSocket {
  constructor(api) {
    this._api = api;
    this._ws = null;
    this._handlers = { logs: [], events: [], chat: [] };
    this._reconnectDelay = 1000;
    this._maxReconnectDelay = 30000;
    this._shouldConnect = false;
    this._subscriptions = new Set();
    this._reconnectAttempt = 0;
    this._reconnectTimer = null;
    this._lastPongTime = 0;
    this._pingInterval = null;
    this._forcedRetireTimer = null;
    this._subscriptionAckTimer = null;
    this._pendingReconnect = null;
    this._latency = -1;
    // True while a WS chat awaits its response — on connection loss the
    // page gets a chat_error via socket lifecycle, never a duration timer.
    this._chatPending = false;
    // state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
    this._state = 'disconnected';
    // Lifecycle listeners are SETS, never single-slot properties. The old
    // assignable callbacks made every page a rival for one hook: chat and
    // logs chained prev-handler saves around the app shell's, and an
    // interleaved order (chat mounts, logs activates, chat unmounts, logs
    // deactivates) restored a DEAD component's handler while the shell's
    // was lost for good. Registration returns an unsubscribe closure; each
    // page owns exactly its own hook.
    this._lifecycle = {
      status: new Set(),      // fn(connected: boolean)
      state: new Set(),       // fn(state: string, detail: object)
      latency: new Set(),     // fn(latencyMs: number) — published on every
      //   pong; onState alone can't carry it because _setState suppresses
      //   unchanged states, so a steady connection would never report.
      reconnected: new Set(), // fn(epoch: number) — see socket.onopen
    };
    // 'reconnected' fires only when an open FOLLOWS a drop inside one
    // connect() session — never on the first open, never after an explicit
    // disconnect() (logout/login remounts pages, which refetch anyway).
    this._everConnected = false;
    this._reconnectEpoch = 0;
  }

  onStatus(fn) { return this._addLifecycle('status', fn); }
  onState(fn) { return this._addLifecycle('state', fn); }
  onLatencyChange(fn) { return this._addLifecycle('latency', fn); }
  onReconnected(fn) { return this._addLifecycle('reconnected', fn); }

  _addLifecycle(kind, fn) {
    this._lifecycle[kind].add(fn);
    return () => { this._lifecycle[kind].delete(fn); };
  }

  _emitLifecycle(kind, ...args) {
    // Snapshot first: a listener unsubscribing (itself or a sibling) mid-
    // dispatch must not change who this emission reaches.
    for (const fn of [...this._lifecycle[kind]]) {
      try { fn(...args); } catch { /* listener errors are not ours */ }
    }
  }

  get connected() { return this._ws?.readyState === WebSocket.OPEN; }

  /** Current connection state with detail. */
  get state() { return this._state; }
  get reconnectAttempt() { return this._reconnectAttempt; }
  get latency() { return this._latency; }
  /** Monotonic count of resumed connections — lets a page that was
   * deactivated across a drop compare seen-vs-current on re-activation. */
  get reconnectEpoch() { return this._reconnectEpoch; }

  _resetLatency() {
    // Publish the reset, not just record it. Recording silently left the last
    // reading from a now-dead socket on screen, so the sidebar could read
    // "Disconnected — 12ms".
    this._latency = -1;
    this._emitLifecycle('latency', -1);
  }

  connect() {
    this._shouldConnect = true;
    this._setState('connecting');
    this._open();
  }

  disconnect() {
    this._shouldConnect = false;
    // Explicit teardown ends the session: the next open is a fresh start,
    // not a resume, so it must not fire 'reconnected'.
    this._everConnected = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._forcedRetireTimer) {
      clearTimeout(this._forcedRetireTimer);
      this._forcedRetireTimer = null;
    }
    if (this._subscriptionAckTimer) {
      clearTimeout(this._subscriptionAckTimer);
      this._subscriptionAckTimer = null;
    }
    this._pendingReconnect = null;
    this._reconnectAttempt = 0;
    this._resetLatency();
    this._stopPing();
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._setState('disconnected');
  }

  _setState(state) {
    if (this._state === state) return;
    this._state = state;
    this._emitLifecycle('state', state, {
      attempt: this._reconnectAttempt,
      latency: this._latency,
    });
  }

  _startPing(socket) {
    this._stopPing();
    this._lastPongTime = Date.now();
    this._pingInterval = setInterval(() => {
      if (this._ws !== socket || socket.readyState !== WebSocket.OPEN) return;
      // A close handshake is cooperative; a half-open peer may never deliver
      // onclose. Announce the loss now, then forcibly retire this socket on a
      // bounded timer so reconnect does not depend on the dead path.
      if (this._lastPongTime && Date.now() - this._lastPongTime > 47000) {
        this._beginForcedRetirement(socket, 'pong timeout');
        return;
      }
      try {
        socket.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
      } catch { /* ignore */ }
    }, 15000);
  }

  _beginForcedRetirement(socket, reason) {
    if (this._ws !== socket || this._forcedRetireTimer) return;
    this._stopPing();
    this._reconnectAttempt++;
    this._setState('reconnecting');
    this._emitLifecycle('status', false);
    // Arm the authoritative retirement BEFORE close(): queued close delivery
    // is normally asynchronous, but this remains correct for synchronous
    // implementations and test doubles too.
    this._forcedRetireTimer = setTimeout(() => {
      this._forcedRetireTimer = null;
      this._retireSocket(socket, true, true);
    }, 1000);
    try { socket.close(4000, reason); } catch { /* retirement timer is authoritative */ }
  }

  _scheduleReconnect(incrementAttempt = true) {
    if (!this._shouldConnect || this._reconnectTimer) return;
    if (incrementAttempt) this._reconnectAttempt++;
    this._setState('reconnecting');
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._open();
    }, this._reconnectDelay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxReconnectDelay);
  }

  _retireSocket(socket, lossAlreadyPublished = false, reconnectAlreadyPublished = false) {
    if (this._ws !== socket) return;
    if (this._forcedRetireTimer) {
      clearTimeout(this._forcedRetireTimer);
      this._forcedRetireTimer = null;
    }
    if (this._subscriptionAckTimer) {
      clearTimeout(this._subscriptionAckTimer);
      this._subscriptionAckTimer = null;
    }
    this._pendingReconnect = null;
    this._ws = null;
    this._stopPing();
    this._resetLatency();
    if (this._chatPending) {
      this._chatPending = false;
      const lost = {
        type: 'chat_error',
        error: 'Connection lost — the response may still complete; check session history.',
      };
      for (const h of this._handlers.chat || []) h(lost);
    }
    if (!lossAlreadyPublished) this._emitLifecycle('status', false);
    if (this._shouldConnect) this._scheduleReconnect(!reconnectAlreadyPublished);
    else this._setState('disconnected');
  }

  _beginReconnectBarrier(socket, resumed) {
    if (!resumed) return;
    const channels = new Set(this._subscriptions);
    if (channels.size === 0) {
      this._reconnectEpoch += 1;
      this._emitLifecycle('reconnected', this._reconnectEpoch);
      return;
    }
    this._pendingReconnect = { socket, channels };
    this._subscriptionAckTimer = setTimeout(() => {
      if (this._pendingReconnect?.socket === socket) {
        this._beginForcedRetirement(socket, 'subscription acknowledgement timeout');
      }
    }, 5000);
  }

  _ackSubscription(socket, channel) {
    const pending = this._pendingReconnect;
    if (!pending || pending.socket !== socket || !pending.channels.has(channel)) return;
    pending.channels.delete(channel);
    if (pending.channels.size > 0) return;
    this._pendingReconnect = null;
    if (this._subscriptionAckTimer) {
      clearTimeout(this._subscriptionAckTimer);
      this._subscriptionAckTimer = null;
    }
    this._reconnectEpoch += 1;
    this._emitLifecycle('reconnected', this._reconnectEpoch);
  }

  _stopPing() {
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
  }

  subscribe(channel, handler) {
    if (!this._handlers[channel]) this._handlers[channel] = [];
    this._handlers[channel].push(handler);
    // Only pub/sub channels need server-side subscription (not chat — it's request/response)
    if (channel !== 'chat') {
      this._subscriptions.add(channel);
      if (this.connected) {
        const socket = this._ws;
        if (this._pendingReconnect?.socket === socket) {
          this._pendingReconnect.channels.add(channel);
        }
        socket.send(JSON.stringify({ subscribe: channel }));
      }
    }
  }

  unsubscribe(channel, handler) {
    const arr = this._handlers[channel];
    if (arr) {
      const idx = arr.indexOf(handler);
      if (idx >= 0) arr.splice(idx, 1);
      if (arr.length === 0) {
        if (channel !== 'chat') {
          this._subscriptions.delete(channel);
          if (this.connected) {
            const socket = this._ws;
            socket.send(JSON.stringify({ unsubscribe: channel }));
            this._ackSubscription(socket, channel);
          }
        }
      }
    }
  }

  on(channel, handler) { return this.subscribe(channel, handler); }
  off(channel, handler) { return this.unsubscribe(channel, handler); }

  /** Send a chat message via WebSocket. Returns true if sent. */
  sendChat(content, { channelId, userId, username } = {}) {
    if (!this.connected) return false;
    this._ws.send(JSON.stringify({
      type: 'chat',
      content,
      channel_id: channelId || 'web-default',
      user_id: userId || undefined,
      username: username || undefined,
    }));
    this._chatPending = true;
    return true;
  }

  _open() {
    if (this._ws) return;
    if (!this._shouldConnect) return; // logged out between schedule and fire
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/api/ws`;
    // The token rides a subprotocol, NEVER the URL: query strings land
    // verbatim in server access journals, and journals ride backups
    // (audit 3.1). base64url unpadded keeps it inside RFC 6455's token
    // charset; the server echoes the selected protocol back.
    const protocols = this._api.token
      ? ['odin.bearer.' + btoa(this._api.token).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')]
      : undefined;
    const socket = protocols ? new WebSocket(url, protocols) : new WebSocket(url);
    this._ws = socket;
    // Every callback below is guarded on socket identity. Closing a socket does
    // not cancel its already-queued events: disconnect() clears _ws, connect()
    // installs a NEW socket, and the old socket's onclose then fires with no
    // idea it is obsolete — tearing down the live connection's reference, ping
    // timer and latency, and scheduling a reconnect on top of a healthy socket.
    const isCurrent = () => this._ws === socket;

    socket.onopen = () => {
      if (!isCurrent()) return;
      const resumed = this._everConnected;
      this._everConnected = true;
      this._reconnectDelay = 1000;
      this._reconnectAttempt = 0;
      // Re-subscribe to channels
      for (const ch of this._subscriptions) {
        socket.send(JSON.stringify({ subscribe: ch }));
      }
      this._startPing(socket);
      this._setState('connected');
      this._emitLifecycle('status', true);
      // A resumed view may refetch only after every desired server-side
      // subscription is acknowledged. Otherwise an event can fall between
      // the REST snapshot and subscription installation and disappear.
      this._beginReconnectBarrier(socket, resumed);
    };

    socket.onmessage = (evt) => {
      if (!isCurrent()) return;
      let data;
      try { data = JSON.parse(evt.data); } catch { return; }
      const type = data.type;
      if (type === 'pong') {
        if (data.ts) {
          this._latency = Date.now() - data.ts;
          this._lastPongTime = Date.now();
          this._emitLifecycle('latency', this._latency);
        }
        return;
      }
      if (type === 'subscribed') {
        this._ackSubscription(socket, data.channel);
        return;
      }
      if (type === 'log') {
        for (const h of this._handlers.logs || []) h(data);
      } else if (type === 'event') {
        for (const h of this._handlers.events || []) h(data);
      } else if (type === 'chat_response' || type === 'chat_error') {
        this._chatPending = false;
        for (const h of this._handlers.chat || []) h(data);
      }
      // subscribed/unsubscribed confirmations are silently consumed
    };

    socket.onclose = () => {
      // If a pong/subscription timeout already published the loss, do not
      // publish it twice; either way this path and the forced timer converge
      // on the same identity-safe retirement primitive.
      const forced = Boolean(this._forcedRetireTimer);
      this._retireSocket(socket, forced, forced);
    };

    socket.onerror = () => {
      // onclose will fire after onerror, handled there
    };
  }
}

// Singleton instances
export const api = new OdinAPI();
export const ws = new OdinWebSocket(api);
export { AuthError, ApiError };
