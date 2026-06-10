/**
 * Odin Management UI — Shared Confirm Dialog
 *
 * Promise-based replacement for native confirm() and the per-page modal
 * copies that loops/processes/schedules each carried.
 *
 * Usage:
 *   import { confirmDialog } from '../confirm.js';
 *   if (await confirmDialog({
 *     title: 'Delete schedule',
 *     message: 'Delete "nightly-backup"? This cannot be undone.',
 *     confirmLabel: 'Delete',
 *     danger: true,
 *   })) { ... }
 *
 * The <confirm-host> component is mounted once in app.js.
 */
const { reactive } = Vue;

const state = reactive({
  open: false,
  title: 'Confirm',
  message: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: false,
});

let resolver = null;

export function confirmDialog({ title = 'Confirm', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  // If a dialog is somehow already open, settle it as cancelled first.
  if (resolver) resolver(false);
  state.title = title;
  state.message = message;
  state.confirmLabel = confirmLabel;
  state.cancelLabel = cancelLabel;
  state.danger = danger;
  state.open = true;
  return new Promise((resolve) => { resolver = resolve; });
}

function settle(result) {
  state.open = false;
  if (resolver) {
    resolver(result);
    resolver = null;
  }
}

export const ConfirmHost = {
  setup() {
    function onKeydown(e) {
      if (!state.open) return;
      if (e.key === 'Escape') { e.stopPropagation(); settle(false); }
      if (e.key === 'Enter') { e.stopPropagation(); settle(true); }
    }
    Vue.onMounted(() => document.addEventListener('keydown', onKeydown, true));
    Vue.onUnmounted(() => document.removeEventListener('keydown', onKeydown, true));
    return { state, settle };
  },
  template: `
    <transition name="modal">
      <div v-if="state.open" class="modal-overlay" @click.self="settle(false)" role="dialog" aria-modal="true" :aria-label="state.title">
        <div class="modal-content confirm-dialog">
          <h3 class="text-base font-semibold mb-2">{{ state.title }}</h3>
          <p class="text-sm text-gray-400 mb-4" style="white-space: pre-wrap;">{{ state.message }}</p>
          <div class="flex justify-end gap-2">
            <button class="btn btn-ghost text-sm" @click="settle(false)">{{ state.cancelLabel }}</button>
            <button class="btn text-sm" :class="state.danger ? 'btn-danger' : 'btn-primary'" @click="settle(true)" autofocus>
              {{ state.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  `,
};
