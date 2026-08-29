export const MCP_EDITOR_GROUPS = Object.freeze([
  { id: 'identity', label: 'Identity' },
  { id: 'transport', label: 'Transport' },
  { id: 'authentication', label: 'Authentication' },
  { id: 'limits', label: 'Limits' },
]);

/** Move within the modal without handing the hash router a fragment route. */
export function scrollMCPFormSection(groupId, {
  root = document,
  reducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
} = {}) {
  const scroller = root.querySelector('.mcp-editor-groups');
  const target = scroller?.querySelector(`#mcp-form-${groupId}`);
  if (!target) return false;

  target.scrollIntoView({
    behavior: reducedMotion ? 'auto' : 'smooth',
    block: 'start',
    inline: 'nearest',
  });
  target.querySelector('[data-mcp-form-heading]')?.focus({ preventScroll: true });
  return true;
}
