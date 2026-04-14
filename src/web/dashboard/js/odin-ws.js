/**
 * OdinWebSocket — WebSocket client for real-time Odin dashboard updates.
 *
 * Provides event-based communication with automatic reconnection
 * and heartbeat keep-alive.
 */
class OdinWebSocket {
    /**
     * @param {string} url - WebSocket server URL
     */
    constructor(url) {
        this.url = url;
        this._ws = null;
        this._listeners = {};
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = 10;
        this._heartbeatInterval = null;
        this._shouldReconnect = true;
    }

    /**
     * Open the WebSocket connection.
     */
    connect() {
        this._shouldReconnect = true;
        this._ws = new WebSocket(this.url);

        this._ws.onopen = () => {
            this._reconnectAttempts = 0;
            this._startHeartbeat();
            this._emit('connected', null);
        };

        this._ws.onclose = (event) => {
            this._stopHeartbeat();
            this._emit('disconnected', { code: event.code, reason: event.reason });
            if (this._shouldReconnect) {
                this._reconnect();
            }
        };

        this._ws.onerror = (error) => {
            this._emit('error', error);
        };

        this._ws.onmessage = (raw) => {
            this._handleMessage(raw);
        };
    }

    /**
     * Close the connection without auto-reconnecting.
     */
    disconnect() {
        this._shouldReconnect = false;
        this._stopHeartbeat();
        if (this._ws) {
            this._ws.close(1000, 'Client disconnect');
        }
    }

    /**
     * Register an event listener.
     * @param {string} event
     * @param {Function} callback
     */
    on(event, callback) {
        if (!this._listeners[event]) {
            this._listeners[event] = [];
        }
        this._listeners[event].push(callback);
    }

    /**
     * Remove an event listener.
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
        const list = this._listeners[event];
        if (list) {
            this._listeners[event] = list.filter(cb => cb !== callback);
        }
    }

    /**
     * Send a JSON message to the server.
     * @param {string} event
     * @param {*} data
     */
    send(event, data) {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify({ event, data }));
        }
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    _emit(event, data) {
        const callbacks = this._listeners[event] || [];
        for (const cb of callbacks) {
            try {
                cb(data);
            } catch (err) {
                console.error(`[OdinWebSocket] Error in ${event} handler:`, err);
            }
        }
    }

    _handleMessage(raw) {
        try {
            const msg = JSON.parse(raw.data);
            if (msg.event) {
                this._emit(msg.event, msg.data);
            }
        } catch {
            console.warn('[OdinWebSocket] Non-JSON message received');
        }
    }

    _reconnect() {
        if (this._reconnectAttempts >= this._maxReconnectAttempts) {
            this._emit('reconnect_failed', null);
            return;
        }
        this._reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 30000);
        setTimeout(() => this.connect(), delay);
    }

    _startHeartbeat() {
        this._heartbeatInterval = setInterval(() => {
            this.send('ping', {});
        }, 30000);
    }

    _stopHeartbeat() {
        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
            this._heartbeatInterval = null;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OdinWebSocket;
}
