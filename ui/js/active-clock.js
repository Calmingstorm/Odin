import { onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';

export function useActiveClock() {
  const now = ref(Date.now());
  let timer = null;
  function arm() {
    now.value = Date.now();
    if (timer === null) timer = setInterval(() => { now.value = Date.now(); }, 1000);
  }
  function disarm() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }
  onMounted(arm);
  onActivated(arm);
  onDeactivated(disarm);
  onUnmounted(disarm);
  return now;
}
