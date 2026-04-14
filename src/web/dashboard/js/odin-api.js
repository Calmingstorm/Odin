/**
 * OdinAPI — REST client for the Odin dashboard.
 *
 * Handles all HTTP communication with the Odin backend API.
 */
class OdinAPI {
    /**
     * @param {string} baseURL - API base path (default: '/api/v1')
     */
    constructor(baseURL = '/api/v1') {
        this.baseURL = baseURL;
        this._token = null;
    }

    /**
     * Set the authentication token for subsequent requests.
     * @param {string} token
     */
    setToken(token) {
        this._token = token;
    }

    /**
     * Fetch guild settings.
     * @param {string} guildId
     * @returns {Promise<Object>}
     */
    async getGuild(guildId) {
        return this._request('GET', `/guilds/${guildId}`);
    }

    /**
     * Update guild settings.
     * @param {string} guildId
     * @param {Object} settings
     * @returns {Promise<Object>}
     */
    async updateGuildSettings(guildId, settings) {
        return this._request('PATCH', `/guilds/${guildId}`, settings);
    }

    /**
     * Fetch infractions for a guild.
     * @param {string} guildId
     * @param {Object} [params={}] - Query parameters (user_id, page, etc.)
     * @returns {Promise<Object>}
     */
    async getInfractions(guildId, params = {}) {
        const query = new URLSearchParams(params).toString();
        const path = `/guilds/${guildId}/infractions${query ? '?' + query : ''}`;
        return this._request('GET', path);
    }

    /**
     * Internal: perform an HTTP request.
     * @param {string} method
     * @param {string} path
     * @param {Object} [body]
     * @returns {Promise<Object>}
     */
    async _request(method, path, body) {
        const url = `${this.baseURL}${path}`;
        const options = {
            method,
            headers: this._getHeaders(),
        };
        if (body) {
            options.body = JSON.stringify(body);
        }
        const response = await fetch(url, options);
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        return response.json();
    }

    /**
     * Build request headers including auth token if available.
     * @returns {Object}
     */
    _getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this._token) {
            headers['Authorization'] = `Bearer ${this._token}`;
        }
        return headers;
    }
}

// Export for module systems; also attach to window for script-tag usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OdinAPI;
}
