/**
 * Find the element that can actually consume a vertical scroll.
 *
 * Config Center changes from an internal scroll region to normal page flow at
 * a CSS breakpoint. Deriving ownership from layout geometry keeps actions such
 * as "Review settings" aligned with CSS without duplicating that breakpoint in
 * JavaScript.
 */
export function findVerticalScrollOwner(start, options = {}) {
  const getStyle = options.getStyle || (element => globalThis.getComputedStyle(element));
  const fallback = Object.hasOwn(options, 'fallback')
    ? options.fallback
    : globalThis.document?.scrollingElement;

  for (let element = start; element; element = element.parentElement) {
    const overflowY = getStyle(element)?.overflowY || '';
    const scrollableOverflow = /^(auto|scroll|overlay)$/.test(overflowY);
    if (scrollableOverflow && element.scrollHeight > element.clientHeight) return element;
  }

  if (fallback && fallback.scrollHeight > fallback.clientHeight) return fallback;
  return start || fallback || null;
}
