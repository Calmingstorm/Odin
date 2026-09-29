import { onActivated, onDeactivated, onUnmounted } from 'vue';

// A request owns publication only until a newer request or page activation.
// This fences errors and loading as well as data; abort alone is not a fence.
export function useRequestOwner(onInvalidate = () => {}) {
  let generation = 0;
  let active = true;
  const invalidate = () => { active = false; ++generation; onInvalidate(); };
  onActivated(() => { if (!active) ++generation; active = true; });
  onDeactivated(invalidate);
  onUnmounted(invalidate);
  return () => {
    const ticket = ++generation;
    const issuedActive = active;
    return () => issuedActive && active && ticket === generation;
  };
}
