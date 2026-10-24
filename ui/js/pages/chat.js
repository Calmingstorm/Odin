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
// The page also holds, by each reply's stored id, what the stored history
// lacks: a reply's files and tools, and the error a stored error marker
// stands for. All of it belongs to the sign-in that made it: a sign-out, an
// expiry or another sign-in starts over (a sign-in has one chat).
let kept = null;

function keptState() {
  const owner = api.token || '';
  if (!kept || kept.owner !== owner) {
    kept = { owner, pending: false, missed: null, held: new Map(), heldChars: 0 };
  }
  return kept;
}

function rememberChatWhileAway(data) {
  const state = keptState();
  if (!state.pending) return;
  state.pending = false;
  state.missed = data;
}

// Held replies: the newest 50, with up to 64 MiB of their files' base64 text.
// The oldest go first; the newest is always kept, even alone over the limit.
const HELD_REPLIES = 50;
const HELD_FILE_CHARS = 64 * 1024 * 1024;

function holdReply(reply) {
  // A reply that was never stored has nothing to be matched with.
  if (!reply.reply_id) return;
  if (!reply.tools_used.length && !reply.files.length && !reply.is_error) return;
  const state = keptState();
  const size = reply.files.reduce((n, f) => n + String(f.data || '').length, 0);
  const previous = state.held.get(reply.reply_id);
  if (previous) {
    state.held.delete(reply.reply_id);
    state.heldChars -= previous.size;
  }
  state.held.set(reply.reply_id, { ...reply, size });
  state.heldChars += size;
  for (const [id, entry] of state.held) {
    if (state.held.size === 1) break;
    if (state.held.size <= HELD_REPLIES && state.heldChars <= HELD_FILE_CHARS) break;
    state.held.delete(id);
    state.heldChars -= entry.size;
  }
}

// One shape for a turn's result, from the socket (content) or REST (response).
function chatResult(data) {
  return {
    content: (data.content ?? data.response) || '',
    tools_used: data.tools_used || [],
    files: data.files || [],
    is_error: Boolean(data.is_error),
    reply_id: data.reply_id || null,
  };
}

// The page's id for its question: a history load tells the stored copy of a
// turn from a new one by it, never by text (#730).
function newMessageId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  template: `
    <div class="chat-container page-fade-in" role="region" aria-label="Chat">
      <div v-if="historyError" class="chat-history-warning" role="alert">{{ historyError }}</div>
      <!-- Message list -->
      <div class="chat-messages" ref="messagesEl" role="log" aria-live="polite" aria-label="Messages"
           @scroll.passive="onMessagesScroll">
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

    // The list follows its newest content while the reader is at its bottom
    // (#738): new messages, and growth, since a reply's image loads after the
    // reply is shown. Scrolling up stops that until the reader scrolls back
    // down or sends a message. Jumps are instant, as on the Logs page: the
    // list scrolls smoothly in CSS, and an animated jump's in-between
    // positions would read as the reader having scrolled away.
    const FOLLOW_SLACK_PX = 40;
    let following = true;
    let lastTop = 0; // the list's position at its last scroll event or jump
    let listWatch = null;
    let childWatch = null;

    function atBottom(el) {
      return el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK_PX;
    }

    function jumpToBottom() {
      const el = messagesEl.value;
      if (!el || !following) return;
      el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
      lastTop = el.scrollTop;
    }

    function scrollToBottom() {
      nextTick(jumpToBottom);
    }

    // Only a move up decides that the reader left the bottom: any move up, so
    // that slow scrolling, a pixel at a time, leaves it too. Content growing
    // below fires no scroll event, and a jump's own event can arrive after
    // more growth, at the jump's position: neither is a move up, and the next
    // jump catches up. Reaching the bottom resumes following.
    function onMessagesScroll() {
      const el = messagesEl.value;
      if (!el) return;
      const top = el.scrollTop;
      if (top < lastTop) following = atBottom(el);
      else if (atBottom(el)) following = true;
      lastTop = top;
    }

    // A size change can bring the bottom to a reader who scrolled up (a
    // taller window, a history that now fits) without a scroll event.
    function onListResize() {
      const el = messagesEl.value;
      if (el && !following && atBottom(el)) following = true;
      jumpToBottom();
    }

    // The list's own box changes with the window (or a phone's keyboard); its
    // children's boxes change as messages are added and their images load.
    function watchList() {
      const el = messagesEl.value;
      if (!el || typeof ResizeObserver !== 'function') return;
      listWatch = new ResizeObserver(onListResize);
      listWatch.observe(el);
      for (const child of el.children) listWatch.observe(child);
      if (typeof MutationObserver !== 'function') return;
      childWatch = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) if (node.nodeType === 1) listWatch.observe(node);
          for (const node of record.removedNodes) if (node.nodeType === 1) listWatch.unobserve(node);
        }
      });
      childWatch.observe(el, { childList: true });
    }

    function autoResize() {
      if (!inputEl.value) return;
      const el = inputEl.value;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    function makeMessage(role, content, extras = {}) {
      return {
        id: ++msgIdCounter,
        role,
        content,
        timestamp: extras.timestamp || Date.now(),
        html: role === 'bot' ? renderMarkdown(content) : '',
        tools_used: extras.tools_used || [],
        is_error: extras.is_error || false,
        post: extras.post || false,
        images: role === 'bot' ? extractImageUrls(content) : [],
        files: extras.files || [],
        // The stored message's id (a question's, a reply's), once known.
        serverId: extras.serverId || null,
        _showTools: false,
      };
    }

    function addMessage(role, content, extras = {}) {
      const msg = makeMessage(role, content, extras);
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
    // Its reply, once it arrived: the history load that follows shows it.
    let resumedReply = null;
    // Each history load replaces the page's messages; only the newest may.
    let historyGeneration = 0;

    // A stored reply shows what the page received for it: its files and
    // tools, and for a stored error marker the error itself.
    function applyHeld(msg, held) {
      msg.tools_used = held.tools_used;
      msg.files = held.files;
      if (held.is_error) {
        msg.is_error = true;
        msg.content = held.content;
        msg.html = renderMarkdown(held.content);
        msg.images = extractImageUrls(held.content);
      }
    }

    // A reply is shown once: a history load may already show its stored copy.
    function showReply(reply) {
      const shown = reply.reply_id && messages.value.find(
        (m) => m.role === 'bot' && !m.post && m.serverId === reply.reply_id);
      if (shown) {
        applyHeld(shown, reply);
        return;
      }
      addMessage('bot', reply.content, {
        tools_used: reply.tools_used,
        is_error: reply.is_error,
        files: reply.files,
        serverId: reply.reply_id,
      });
    }

    // A post's identity: the server pushes it with its stored timestamp.
    function postKey(m) {
      return `${m.timestamp}\u0000${m.content}`;
    }

    // WebSocket chat handler
    function onChatMessage(data) {
      if (!sending.value) return;
      sending.value = false;
      keptState().pending = false;
      stopTypingTimer();
      const reply = data.type === 'chat_response' ? chatResult(data) : null;
      if (reply) holdReply(reply);
      if (resumedTurn) {
        resumedTurn = false;
        if (reply && reply.reply_id) {
          // The stored history now holds the question and the reply, in order.
          resumedReply = reply;
          loadHistory();
          return;
        }
      }
      if (reply) {
        showReply(reply);
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

    async function sendViaRest(content, messageId) {
      const owner = keptState().owner;
      let reply = null;
      try {
        reply = chatResult(await api.post('/api/chat', {
          content,
          channel_id: channelId.value,
          message_id: messageId,
        }));
      } catch (e) {
        // A turn that ended in an error answers 502 with its result (its
        // question and error marker are stored); anything else did not send.
        const data = e && e.status === 502 ? e.data : null;
        if (data && typeof data.response === 'string') {
          reply = chatResult(data);
        } else if (keptState().owner === owner) {
          addMessage('bot', e.message || 'Failed to send message', { is_error: true });
        }
      }
      // Signed out, or in as someone else, meanwhile: not this chat's result.
      if (!reply || keptState().owner !== owner) return;
      holdReply(reply);
      showReply(reply);
    }

    async function send() {
      const content = input.value.trim();
      if (!content || sending.value) return;

      const messageId = newMessageId();
      // Sending is the reader's own move to the newest message.
      following = true;
      addMessage('user', content, { serverId: messageId });
      input.value = '';
      sending.value = true;
      startTypingTimer();

      if (inputEl.value) inputEl.value.style.height = 'auto';

      // No client-side response timer: long tool-loop turns are healthy
      // and the server imposes no outer wall either. If the socket drops
      // mid-turn, OdinWebSocket dispatches a chat_error via onChatMessage.
      const sentOverWs = ws.connected
        && ws.sendChat(content, { channelId: channelId.value, messageId });
      if (sentOverWs) keptState().pending = true;
      if (!sentOverWs) {
        await sendViaRest(content, messageId);
        sending.value = false;
        stopTypingTimer();
      }

      nextTick(() => inputEl.value?.focus());
    }

    async function loadHistory() {
      const generation = ++historyGeneration;
      const owner = keptState().owner;
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
        // this older one must not add a second copy of the history. Nor may
        // a load from before a sign-out or another sign-in.
        if (generation !== historyGeneration || keptState().owner !== owner) return;
        // Later posts (a loop's, a background task's) sit beside the stored
        // conversation; show them in time order with it.
        const records = [
          ...((session && session.messages) || []),
          ...((session && session.posts) || []).map((p) => ({ ...p, role: 'post' })),
        ].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        // A stored message the page shows already (its live question or a
        // reply, by stored id and role) stays that message, once, in place.
        const onPage = new Map();
        for (const m of messages.value) {
          if (m.serverId && !m.post) onPage.set(`${m.role}\u0000${m.serverId}`, m);
        }
        const { held } = keptState();
        const loaded = [];
        for (const m of records) {
          const role = m.role === 'user' ? 'user' : 'bot';
          const post = m.role === 'post';
          const serverId = !post && m.message_id ? m.message_id : null;
          const timestamp = m.timestamp ? m.timestamp * 1000 : Date.now();
          const same = serverId && onPage.get(`${role}\u0000${serverId}`);
          if (same) {
            same.timestamp = timestamp;
            loaded.push(same);
            continue;
          }
          let content = m.content || '';
          // Strip "[Username]: " prefix from user messages
          if (role === 'user') {
            const prefixMatch = content.match(/^\[.*?\]:\s*/);
            if (prefixMatch) content = content.slice(prefixMatch[0].length);
          }
          const details = role === 'bot' && serverId ? held.get(serverId) : undefined;
          // A reply of files only has no text; its held files still show.
          if (!content.trim() && !details) continue;
          const msg = makeMessage(role, content, { post, timestamp, serverId });
          if (details) applyHeld(msg, details);
          loaded.push(msg);
        }
        if (resumedReply) {
          const reply = resumedReply;
          resumedReply = null;
          // Nothing stored shows it (the chat was cleared meanwhile): show
          // the reply itself, as when it arrived live.
          if (!loaded.some((m) => m.role === 'bot' && m.serverId === reply.reply_id)) {
            loaded.push(makeMessage('bot', reply.content, {
              tools_used: reply.tools_used,
              is_error: reply.is_error,
              files: reply.files,
              serverId: reply.reply_id,
            }));
          }
        }
        const inPlace = new Set(loaded);
        const storedPosts = new Set(loaded.filter((m) => m.post).map(postKey));
        const live = messages.value.filter((m) => !shown.has(m) && !inPlace.has(m)
          && !(m.post && storedPosts.has(postKey(m))));
        messages.value = [...loaded, ...live];
        nextTick(() => {
          scrollToBottom();
          attachCopyButtons();
        });
      } catch (e) {
        if (generation !== historyGeneration || keptState().owner !== owner) return;
        if (resumedReply) {
          // The history could not show the resumed turn's reply: show it here.
          const reply = resumedReply;
          resumedReply = null;
          showReply(reply);
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
      watchList();
      ws.unsubscribe('chat', rememberChatWhileAway);
      ws.subscribe('chat', onChatMessage);
      ws.subscribe('chat_post', onChatPost);
      wsState.value = ws.state || 'disconnected';
      unsubState = ws.onState((state) => { wsState.value = state; });
      const state = keptState();
      if (state.pending) {
        // Still running: its reply arrives here, not in a page that left.
        resumedTurn = true;
        sending.value = true;
        startTypingTimer();
      }
      const missed = state.missed;
      state.missed = null;
      // A reply that arrived while away: its stored copy is in the history,
      // and what the history lacks is held. If the history cannot show it (the
      // load fails, or the snapshot lacks it), it is shown as a resumed reply.
      const reply = missed && missed.type === 'chat_response' ? chatResult(missed) : null;
      if (reply) holdReply(reply);
      if (reply && reply.reply_id) resumedReply = reply;
      loadHistory().then(() => {
        // A result that was never stored can only be shown here.
        if (missed && missed.type === 'chat_error') {
          addMessage('bot', missed.error || 'Unknown error', { is_error: true });
        } else if (reply && !reply.reply_id) {
          showReply(reply);
        }
      });
      nextTick(() => inputEl.value?.focus());
    });

    onUnmounted(() => {
      ws.unsubscribe('chat', onChatMessage);
      ws.unsubscribe('chat_post', onChatPost);
      if (keptState().pending) ws.subscribe('chat', rememberChatWhileAway);
      if (unsubState) { unsubState(); unsubState = null; }
      if (childWatch) { childWatch.disconnect(); childWatch = null; }
      if (listWatch) { listWatch.disconnect(); listWatch = null; }
      stopTypingTimer();
    });

    return {
      messages, input, sending, historyError, messagesEl, inputEl,
      canSend, wsStatus, typingText, suggestions,
      send, autoResize, formatTime, formatDate,
      showDateSeparator, useSuggestion, openImage,
      onImageError, getToolIcon, loadHistory, onMessagesScroll,
    };
  },
};
