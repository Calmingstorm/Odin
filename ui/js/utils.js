/**
 * Odin Management UI — Shared Formatting Utilities
 *
 * Single source of truth for timestamp, duration, and text formatting.
 * Previously each page carried its own copy of these helpers with subtly
 * different output formats; import from here instead.
 */

/** Coerce a timestamp (unix seconds, unix ms, or ISO string) to a Date. */
export function toDate(ts) {
  if (ts instanceof Date) return ts;
  if (typeof ts === 'string') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof ts === 'number' && isFinite(ts)) {
    // Unix seconds are ~1.7e9 in 2026; ms are ~1.7e12. Anything below
    // 1e12 is treated as seconds.
    return new Date(ts < 1e12 ? ts * 1000 : ts);
  }
  return null;
}

/** Full timestamp: "Jun 9, 02:14:55 PM" (locale-dependent, with seconds). */
export function formatTs(ts) {
  const d = toDate(ts);
  if (!d) return '—';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/** Time of day only: "02:14:55 PM" (locale-dependent). */
export function formatTime(ts) {
  const d = toDate(ts);
  if (!d) return '—';
  return d.toLocaleTimeString();
}

/** Relative age: "12s ago", "5m ago", "3h ago", "2d ago". */
export function formatAge(ts) {
  const d = toDate(ts);
  if (!d) return '—';
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

/** Duration in seconds: "45s", "2m 30s", "1h 12m". */
export function formatDuration(seconds) {
  if (seconds == null || !isFinite(seconds)) return '—';
  const sec = Math.max(0, Math.round(seconds));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Truncate with ellipsis. */
export function truncate(str, n = 200) {
  const s = String(str ?? '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/** Truncate a multi-line block with an explicit marker (for <pre> output). */
export function truncateBlock(str, n = 5000) {
  const s = String(str ?? '');
  return s.length > n ? s.slice(0, n) + '\n... (truncated)' : s;
}

/** Escape HTML entities for safe interpolation into v-html content. */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Locale-grouped number: 1234567 → "1,234,567". */
export function fmtNum(n) {
  if (n == null || !isFinite(n)) return '—';
  return Number(n).toLocaleString();
}

/** Compact token count: 1500 → "1.5k", 950 → "950". */
export function formatTokens(n) {
  if (n == null || !isFinite(n)) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
