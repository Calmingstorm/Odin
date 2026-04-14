/**
 * Odin Dashboard — main application script.
 */

(function () {
    'use strict';

    const api = new OdinAPI('/api/v1');

    // Determine WebSocket URL from current page location
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new OdinWebSocket(`${wsProtocol}//${window.location.host}/ws`);

    ws.on('connected', () => {
        console.log('[Odin] WebSocket connected');
    });

    ws.on('disconnected', ({ code, reason }) => {
        console.log(`[Odin] WebSocket disconnected: ${code} ${reason}`);
    });

    ws.on('guild_update', (data) => {
        console.log('[Odin] Guild updated:', data);
    });

    // Auto-connect WebSocket on page load
    ws.connect();
})();
