/**
 * Odin Management UI — Chat Page
 * Polished messaging interface with bubbles, timestamps, tool cards,
 * markdown code-copy, inline images, and typing indicator.
 */
import DOMPurify from 'dompurify';
import { marked } from 'marked';

import { api, ws } from '../api.js';
import { toast } from '../toast.js';
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';


// Configure marked for safe rendering
const markedOpts = { breaks: true, gfm: true };

function renderMarkdown(text) {
  if (!text) return '';
  try {
    if (typeof marked !== 'undefined' && marked.parse) {
      const html = marked.parse(text, markedOpts);
      return typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html) : html;
    }
  } catch { /* fall through */ }
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

/** Format a timestamp for display */
function formatTime(ts) {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** Map tool names to category icons */
const TOOL_ICONS = {
  run_command: 'terminal', ssh_command: 'terminal', run_script: 'terminal',
  read_file: 'file', apply_patch: 'edit', list_directory: 'folder',
  search_knowledge: 'search', ingest_document: 'book',
  generate_image: 'image', analyze_image: 'eye',
  analyze_pdf: 'file', browser_screenshot: 'globe',
  manage_process: 'sliders',
};

function getToolIcon(name) {
  return TOOL_ICONS[name] || 'wrench';
}

/** Detect image URLs in text for inline display */
const IMG_URL_RE = /https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;

function extractImageUrls(text) {
  if (!text) return [];
  const matches = text.match(IMG_URL_RE);
  return matches ? [...new Set(matches)] : [];
}

// A WebSocket chat turn outlives this page: the socket and the server turn
// keep going when the user opens another page. Leaving Chat mid-turn and
// coming back must still show the turn as running, and then its answer.
const chatTurn = { pending: false, missed: null };

function rememberChatWhileAway(data) {
  if (!chatTurn.pending) return;
  chatTurn.pending = false;
  chatTurn.missed = data;
}

export default {
  template: `
    <div class="chat-container page-fade-in" role="region" aria-label="Chat">
      <div v-if="historyError" class="chat-history-warning" role="alert">{{ historyError }}</div>
      <!-- Message list -->
      <div class="chat-messages" ref="messagesEl" role="log" aria-live="polite" aria-label="Messages">
        <!-- Empty state -->
        <div v-if="messages.length === 0" class="chat-empty">
          <div class="chat-welcome">
            <div class="chat-welcome-icon">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                <circle cx="12" cy="12" r="9" stroke-dasharray="4 3"/>
              </svg>
            </div>
            <div class="chat-welcome-title">Odin is watching</div>
            <div class="chat-welcome-subtitle">Ask anything. Run commands. Manage infrastructure.</div>
            <div class="chat-suggestions">
              <button v-for="s in suggestions" :key="s" class="chat-suggestion" @click="useSuggestion(s)">{{ s }}</button>
            </div>
          </div>
        </div>

        <!-- Messages -->
        <template v-for="(msg, i) in messages" :key="msg.id">
          <!-- Date separator -->
          <div v-if="showDateSeparator(i)" class="chat-date-sep">
            <span>{{ formatDate(msg.timestamp) }}</span>
          </div>

          <div class="chat-message" :class="'chat-' + msg.role">
            <!-- Avatar -->
            <div class="chat-avatar" :class="'chat-avatar-' + msg.role">
              <span v-if="msg.role === 'bot'" class="chat-avatar-eye">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                  <path d="M10 3C5 3 1.73 7.11 1 10c.73 2.89 4 7 9 7s8.27-4.11 9-7c-.73-2.89-4-7-9-7zm0 12a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z"/>
                </svg>
              </span>
              <span v-else class="chat-avatar-user">
                <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                  <path d="M10 10a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0H3z"/>
                </svg>
              </span>
            </div>

            <!-- Bubble -->
            <div class="chat-bubble-wrap">
              <!-- User message -->
              <div v-if="msg.role === 'user'" class="chat-bubble chat-bubble-user">
                <div class="chat-bubble-text">{{ msg.content }}</div>
              </div>

              <!-- Bot message -->
              <div v-else class="chat-bubble chat-bubble-bot">
                <div class="chat-bubble-header">
                  <span class="chat-bubble-label">Odin</span>
                  <span v-if="msg.post" class="chat-post-indicator" title="Posted after its turn, by a loop or background task">later post</span>
                  <span v-if="msg.is_error" class="chat-error-indicator">error</span>
                </div>

                <!-- Tool cards -->
                <div v-if="msg.tools_used && msg.tools_used.length > 0" class="chat-tool-cards">
                  <button class="chat-tools-toggle" @click="msg._showTools = !msg._showTools"
                          :aria-expanded="msg._showTools" aria-label="Toggle tool details">
                    <span class="chat-tools-toggle-icon" aria-hidden="true"><odin-icon :name="msg._showTools ? 'chevronUp' : 'chevronDown'" :size="13" /></span>
                    <span class="chat-tools-toggle-count">{{ msg.tools_used.length }}</span>
                    <span>tool{{ msg.tools_used.length > 1 ? 's' : '' }} executed</span>
                  </button>
                  <div v-if="msg._showTools" class="chat-tool-list">
                    <div v-for="t in msg.tools_used" :key="t" class="chat-tool-card">
                      <span class="chat-tool-icon"><odin-icon :name="getToolIcon(t)" :size="15" /></span>
                      <span class="chat-tool-name">{{ t }}</span>
                    </div>
                  </div>
                </div>

                <!-- Markdown body -->
                <div class="chat-bubble-text chat-markdown" v-html="msg.html"></div>

                <!-- Inline images -->
                <div v-if="msg.images && msg.images.length > 0" class="chat-images">
                  <div v-for="(url, j) in msg.images" :key="j" class="chat-image-thumb">
                    <img :src="url" :alt="'Image ' + (j+1)" loading="lazy" @click="openImage(url)" @error="onImageError($event)"/>
                  </div>
                </div>

                <!-- Attached files (from tool calls like browser_screenshot, post_file) -->
                <div v-if="msg.files && msg.files.length > 0" class="chat-files" style="margin-top: 8px;">
                  <div v-for="(file, j) in msg.files" :key="'f'+j" style="margin-bottom: 6px;">
                    <img
                      v-if="file.content_type && file.content_type.startsWith('image/')"
                      :src="'data:' + file.content_type + ';base64,' + file.data"
                      :alt="file.filename"
                      style="max-width: 100%; border-radius: 6px; border: 1px solid var(--hm-border); cursor: pointer;"
                      @click="openImage('data:' + file.content_type + ';base64,' + file.data)"
                      loading="lazy"
                    />
                    <a
                      v-else
                      :href="'data:' + file.content_type + ';base64,' + file.data"
                      :download="file.filename"
                      style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--hm-border); color: var(--hm-text-muted); font-size: 13px; text-decoration: none;"
                    >
                      <odin-icon name="attachment" :size="15" /> {{ file.filename }} ({{ (file.size / 1024).toFixed(1) }} KB)
                    </a>
                  </div>
                </div>
              </div>

              <!-- Timestamp -->
              <div class="chat-timestamp">{{ formatTime(msg.timestamp) }}</div>
            </div>
          </div>
        </template>

        <!-- Typing indicator -->
        <div v-if="sending" class="chat-message chat-bot" role="status" aria-label="Odin is responding">
          <div class="chat-avatar chat-avatar-bot">
            <span class="chat-avatar-eye chat-avatar-pulse">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M10 3C5 3 1.73 7.11 1 10c.73 2.89 4 7 9 7s8.27-4.11 9-7c-.73-2.89-4-7-9-7zm0 12a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z"/>
              </svg>
            </span>
          </div>
          <div class="chat-bubble-wrap">
            <div class="chat-bubble chat-bubble-bot chat-bubble-typing">
              <div class="chat-typing" aria-hidden="true">
                <span></span><span></span><span></span>
              </div>
              <span class="chat-typing-text">{{ typingText }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Input area -->
      <div class="chat-input-area" role="form" aria-label="Send message">
        <div class="chat-input-row">
          <label for="chat-message-input" class="sr-only">Message</label>
          <textarea
            id="chat-message-input"
            ref="inputEl"
            v-model="input"
            class="chat-input"
            placeholder="Message Odin..."
            rows="1"
            :disabled="sending"
            @keydown.enter.exact.prevent="send"
            @input="autoResize"
          ></textarea>
          <button class="btn btn-primary chat-send-btn" :disabled="!canSend" @click="send" aria-label="Send message">
            <span v-if="sending" class="spinner" style="width:14px;height:14px;border-width:2px;" aria-hidden="true"></span>
            <svg v-else viewBox="0 0 20 20" width="16" height="16" fill="currentColor" class="chat-send-icon" aria-hidden="true">
              <path d="M2.94 5.34l6.22 2.6L2.94 5.34zM9.16 12.06l-6.22 2.6 1.36-5.2 4.86 2.6zM18.44 10L2.12 2.4l2.06 7.6-2.06 7.6L18.44 10z"/>
            </svg>
          </button>
        </div>
        <div class="chat-input-hint">
          <span class="text-gray-600 text-xs">Enter to send &middot; Shift+Enter for newline</span>
          <span class="chat-connection-status" :class="wsStatus === 'Connected' ? 'chat-ws-on' : 'chat-ws-off'">
            <span class="chat-status-dot"></span>
            {{ wsStatus }}
          </span>
        </div>
      </div>
    </div>`,

  setup() {
    const messages = ref([]);
    const input = ref('');
    const sending = ref(false);
    const historyError = ref('');
    const messagesEl = ref(null);
    const inputEl = ref(null);
    const typingElapsed = ref(0);
    const channelId = ref('');
    let typingTimer = null;
    let msgIdCounter = 0;

    const suggestions = [
      'Check system health',
      'List running services',
      'Show disk usage',
      'What can you do?',
    ];

    const canSend = computed(() => input.value.trim().length > 0 && !sending.value);
    // ws is a plain class instance, not a reactive object, so a computed over
    // ws.state has NO reactive dependency — it evaluates once and freezes,
    // leaving the pill claiming "Connected" long after the socket dropped and
    // sends fell back to REST. Hold a ref, fed by an owned state listener.
    const wsState = ref(ws.state || 'disconnected');
    let unsubState = null;

    const wsStatus = computed(() => {
      const state = wsState.value;
      if (state === 'connected') return 'Connected';
      if (state === 'reconnecting') return 'Reconnecting\u2026';
      if (state === 'connecting') return 'Connecting\u2026';
      return 'REST fallback';
    });

    const typingPhrases = [
      'Watching across all realms...',
      'Processing...',
      'Consulting the bifrost...',
      'Observing...',
    ];
    const typingText = computed(() => {
      const idx = Math.floor(typingElapsed.value / 4) % typingPhrases.length;
      const secs = typingElapsed.value;
      return secs > 3 ? `${typingPhrases[idx]} (${secs}s)` : typingPhrases[0];
    });

    function scrollToBottom() {
      nextTick(() => {
        if (messagesEl.value) {
          messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
        }
      });
    }

    function autoResize() {
      if (!inputEl.value) return;
      const el = inputEl.value;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    function addMessage(role, content, extras = {}) {
      const msg = {
        id: ++msgIdCounter,
        role,
        content,
        timestamp: Date.now(),
        html: role === 'bot' ? renderMarkdown(content) : '',
        tools_used: extras.tools_used || [],
        is_error: extras.is_error || false,
        post: extras.post || false,
        images: role === 'bot' ? extractImageUrls(content) : [],
        files: extras.files || [],
        _showTools: false,
      };
      if (extras.timestamp) msg.timestamp = extras.timestamp;
      messages.value.push(msg);
      scrollToBottom();
      // Attach copy buttons after render
      if (role === 'bot') {
        nextTick(() => attachCopyButtons());
      }
      return msg;
    }

    /** Attach copy-to-clipboard buttons on code blocks */
    function attachCopyButtons() {
      if (!messagesEl.value) return;
      const blocks = messagesEl.value.querySelectorAll('.chat-markdown pre:not([data-copy])');
      blocks.forEach(pre => {
        pre.setAttribute('data-copy', 'true');
        pre.style.position = 'relative';
        const btn = document.createElement('button');
        btn.className = 'chat-code-copy';
        btn.textContent = 'Copy';
        btn.addEventListener('click', () => {
          const code = pre.querySelector('code');
          const text = code ? code.textContent : pre.textContent;
          navigator.clipboard.writeText(text).then(() => {
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
          }).catch(() => {});
        });
        pre.appendChild(btn);
      });
    }

    function showDateSeparator(i) {
      if (i === 0) return true;
      const prev = messages.value[i - 1];
      const curr = messages.value[i];
      const pDay = new Date(prev.timestamp).toDateString();
      const cDay = new Date(curr.timestamp).toDateString();
      return pDay !== cDay;
    }

    function formatDate(ts) {
      const d = new Date(ts);
      const today = new Date();
      if (d.toDateString() === today.toDateString()) return 'Today';
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function useSuggestion(text) {
      input.value = text;
      nextTick(() => send());
    }

    function openImage(url) {
      window.open(url, '_blank', 'noopener');
    }

    function onImageError(event) {
      event.target.style.display = 'none';
    }

    function startTypingTimer() {
      typingElapsed.value = 0;
      typingTimer = setInterval(() => {
        typingElapsed.value++;
      }, 1000);
    }

    function stopTypingTimer() {
      if (typingTimer) { clearInterval(typingTimer); typingTimer = null; }
      typingElapsed.value = 0;
    }

    // A turn sent on an earlier visit to this page; its question is already
    // in the stored history, not in this page's messages.
    let resumedTurn = false;
    // That turn's reply details the stored history does not keep (its files
    // and tool list), put on the stored reply when the history shows it.
    let resumedDetails = null;
    // Each history load replaces the page's messages; only the newest may.
    let historyGeneration = 0;

    // A post's identity: the server pushes it with its stored timestamp.
    function postKey(m) {
      return `${m.timestamp}\u0000${m.content}`;
    }

    // WebSocket chat handler
    function onChatMessage(data) {
      if (!sending.value) return;
      sending.value = false;
      chatTurn.pending = false;
      stopTypingTimer();
      if (resumedTurn) {
        resumedTurn = false;
        if (data.type === 'chat_response' && !data.is_error) {
          // The stored history now holds the question and the reply, in order.
          resumedDetails = {
            content: data.content,
            tools_used: data.tools_used || [],
            files: data.files || [],
          };
          loadHistory();
          return;
        }
      }
      if (data.type === 'chat_response') {
        addMessage('bot', data.content, {
          tools_used: data.tools_used || [],
          is_error: data.is_error || false,
          files: data.files || [],
        });
      } else if (data.type === 'chat_error') {
        addMessage('bot', data.error || 'Unknown error', { is_error: true });
      }
      nextTick(() => inputEl.value?.focus());
    }

    // A post made into this chat after its turn ended (a loop's, a background
    // task's). The server pushes it to every open page of the chat's owner.
    function onChatPost(data) {
      if (!data || data.channel_id !== channelId.value) return;
      const post = {
        content: data.content || '',
        timestamp: data.timestamp ? data.timestamp * 1000 : Date.now(),
      };
      // A history load that ran after it was stored already shows it.
      if (messages.value.some((m) => m.post && postKey(m) === postKey(post))) return;
      addMessage('bot', post.content, { post: true, timestamp: post.timestamp });
    }

    async function sendViaRest(content) {
      try {
        const result = await api.post('/api/chat', {
          content,
          channel_id: channelId.value,
        });
        addMessage('bot', result.response, {
          tools_used: result.tools_used || [],
          is_error: result.is_error || false,
          files: result.files || [],
        });
      } catch (e) {
        addMessage('bot', e.message || 'Failed to send message', { is_error: true });
      }
    }

    async function send() {
      const content = input.value.trim();
      if (!content || sending.value) return;

      addMessage('user', content);
      input.value = '';
      sending.value = true;
      startTypingTimer();

      if (inputEl.value) inputEl.value.style.height = 'auto';

      // No client-side response timer: long tool-loop turns are healthy
      // and the server imposes no outer wall either. If the socket drops
      // mid-turn, OdinWebSocket dispatches a chat_error via onChatMessage.
      const sentOverWs = ws.connected && ws.sendChat(content, { channelId: channelId.value });
      if (sentOverWs) chatTurn.pending = true;
      if (!sentOverWs) {
        await sendViaRest(content);
        sending.value = false;
        stopTypingTimer();
      }

      nextTick(() => inputEl.value?.focus());
    }

    async function loadHistory() {
      const generation = ++historyGeneration;
      // Messages shown now are replaced; ones added while this load runs
      // (a live post, a reply) are kept after the stored ones.
      const shown = new Set(messages.value);
      historyError.value = '';
      try {
        if (!channelId.value) {
          const sess = await api.get('/api/auth/session');
          channelId.value = sess.channel_id || sess.user_id || 'web-user';
        }
        const session = await api.get('/api/sessions/' + encodeURIComponent(channelId.value));
        // A newer load (a resumed turn's reply) replaces the page instead:
        // this older one must not add a second copy of the history.
        if (generation !== historyGeneration) return;
        // Later posts (a loop's, a background task's) sit beside the stored
        // conversation; show them in time order with it.
        const records = [
          ...((session && session.messages) || []),
          ...((session && session.posts) || []).map((p) => ({ ...p, role: 'post' })),
        ].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        const loaded = [];
        if (records.length > 0) {
          for (const m of records) {
            const role = m.role === 'user' ? 'user' : 'bot';
            let content = m.content || '';
            // Strip "[Username]: " prefix from user messages
            if (role === 'user') {
              const prefixMatch = content.match(/^\[.*?\]:\s*/);
              if (prefixMatch) content = content.slice(prefixMatch[0].length);
            }
            if (!content.trim()) continue;
            const msg = {
              id: ++msgIdCounter,
              role,
              content,
              timestamp: m.timestamp ? m.timestamp * 1000 : Date.now(),
              html: role === 'bot' ? renderMarkdown(content) : '',
              tools_used: [],
              is_error: false,
              post: m.role === 'post',
              images: role === 'bot' ? extractImageUrls(content) : [],
              files: [],
              _showTools: false,
            };
            loaded.push(msg);
          }
        }
        if (resumedDetails) {
          const { content, tools_used, files } = resumedDetails;
          resumedDetails = null;
          const reply = [...loaded].reverse().find(
            (m) => m.role === 'bot' && !m.post && m.content === content);
          if (reply) {
            reply.tools_used = tools_used;
            reply.files = files;
          } else {
            // Nothing stored can show it (a reply of files only has no text
            // to store): show the reply itself, as when it arrived live.
            loaded.push({
              id: ++msgIdCounter,
              role: 'bot',
              content: content || '',
              timestamp: Date.now(),
              html: renderMarkdown(content || ''),
              tools_used,
              is_error: false,
              post: false,
              images: extractImageUrls(content || ''),
              files,
              _showTools: false,
            });
          }
        }
        const storedPosts = new Set(loaded.filter((m) => m.post).map(postKey));
        const live = messages.value.filter(
          (m) => !shown.has(m) && !(m.post && storedPosts.has(postKey(m))));
        messages.value = [...loaded, ...live];
        nextTick(() => {
          scrollToBottom();
          attachCopyButtons();
        });
      } catch (e) {
        if (generation !== historyGeneration) return;
        if (resumedDetails) {
          // The history could not show the resumed turn's reply: show it here.
          const { content, tools_used, files } = resumedDetails;
          resumedDetails = null;
          addMessage('bot', content, { tools_used, files });
        }
        // 404 = no session yet, a fresh start. Anything else is a REAL
        // load failure — starting silently "fresh" hides existing history
        // (audit 2.7); say so instead of impersonating an empty session.
        if (e && e.status !== 404) {
          historyError.value = 'Couldn\'t load chat history — earlier messages may be missing. Refresh to retry.';
          toast.error(historyError.value);
        }
      }
    }

    onMounted(() => {
      ws.unsubscribe('chat', rememberChatWhileAway);
      ws.subscribe('chat', onChatMessage);
      ws.subscribe('chat_post', onChatPost);
      wsState.value = ws.state || 'disconnected';
      unsubState = ws.onState((state) => { wsState.value = state; });
      if (chatTurn.pending) {
        // Still running: its reply arrives here, not in a page that left.
        resumedTurn = true;
        sending.value = true;
        startTypingTimer();
      }
      const missed = chatTurn.missed;
      chatTurn.missed = null;
      if (missed && missed.type === 'chat_response' && !missed.is_error) {
        // Its text is in the history; its files and tools are only here.
        resumedDetails = {
          content: missed.content,
          tools_used: missed.tools_used || [],
          files: missed.files || [],
        };
      }
      loadHistory().then(() => {
        // A successful reply that arrived while away is in the history; a
        // failure is not stored, so show it here.
        if (missed && (missed.type === 'chat_error' || missed.is_error)) {
          addMessage('bot', missed.error || missed.content || 'Unknown error', { is_error: true });
        }
      });
      nextTick(() => inputEl.value?.focus());
    });

    onUnmounted(() => {
      ws.unsubscribe('chat', onChatMessage);
      ws.unsubscribe('chat_post', onChatPost);
      if (chatTurn.pending) ws.subscribe('chat', rememberChatWhileAway);
      if (unsubState) { unsubState(); unsubState = null; }
      stopTypingTimer();
    });

    return {
      messages, input, sending, historyError, messagesEl, inputEl,
      canSend, wsStatus, typingText, suggestions,
      send, autoResize, formatTime, formatDate,
      showDateSeparator, useSuggestion, openImage,
      onImageError, getToolIcon, loadHistory,
    };
  },
};
