const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(el) {
  return [...el.querySelectorAll(FOCUSABLE)].filter(node =>
    !node.hasAttribute('hidden') && node.getAttribute('aria-hidden') !== 'true'
  );
}

/**
 * Focus containment for modal surfaces. Records/restores the invoking control,
 * moves focus into the dialog, and cycles Tab within the active surface.
 */
export const ModalFocusDirective = {
  mounted(el) {
    const previous = document.activeElement;
    const onKeydown = event => {
      if (event.key !== 'Tab') return;
      const items = focusableElements(el);
      if (!items.length) {
        event.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    el.__odinModalFocus = { previous, onKeydown };
    el.addEventListener('keydown', onKeydown);
    requestAnimationFrame(() => {
      const target = el.querySelector('[autofocus]') || focusableElements(el)[0] || el;
      target.focus();
    });
  },
  unmounted(el) {
    const state = el.__odinModalFocus;
    if (!state) return;
    el.removeEventListener('keydown', state.onKeydown);
    if (state.previous?.isConnected && typeof state.previous.focus === 'function') {
      requestAnimationFrame(() => state.previous.focus());
    }
    delete el.__odinModalFocus;
  },
};
