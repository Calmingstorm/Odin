/**
 * Odin Management UI — Global Toast Notifications
 *
 * One toast system for the whole app. Pages previously carried their own
 * showToast/showAction implementations with different styling and timing.
 *
 * Usage:
 *   import { toast } from '../toast.js';
 *   toast.success('Saved');
 *   toast.error('Failed to save: ' + e.message);
 *   toast.info('Reloading…');
 *
 * The <toast-container> component is mounted once in app.js.
 */
import { reactive } from 'vue';

const state = reactive({ items: [] });
let nextId = 1;

function push(message, type = 'info', duration = 3000) {
  const id = nextId++;
  state.items.push({ id, message: String(message), type });
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration);
  }
  return id;
}

function dismiss(id) {
  const idx = state.items.findIndex(t => t.id === id);
  if (idx >= 0) state.items.splice(idx, 1);
}

export function toast(message, type = 'info', duration = 3000) {
  return push(message, type, duration);
}
toast.success = (message, duration = 3000) => push(message, 'success', duration);
toast.error = (message, duration = 5000) => push(message, 'error', duration);
toast.info = (message, duration = 3000) => push(message, 'info', duration);
toast.dismiss = dismiss;

export const ToastContainer = {
  setup() {
    return { state, dismiss };
  },
  template: `
    <div class="toast-stack" aria-live="polite" aria-atomic="false">
      <transition-group name="toast">
        <div
          v-for="t in state.items"
          :key="t.id"
          class="toast-item"
          :class="'toast-' + t.type"
          role="status"
          @click="dismiss(t.id)"
        >
          <span class="toast-icon" aria-hidden="true">{{ t.type === 'success' ? '✓' : t.type === 'error' ? '⚠' : 'ℹ' }}</span>
          <span class="toast-text">{{ t.message }}</span>
        </div>
      </transition-group>
    </div>
  `,
};
