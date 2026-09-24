// Pure view-model math for Codex quota windows. Kept separate so tests exercise
// the same calculations consumed by the rendered account table.
export function quotaBlocks(account, formatDate = () => 'unknown') {
  const quota = account?.quota;
  if (!quota || typeof quota !== 'object') return [];
  return ['primary', 'secondary'].flatMap(key => {
    const window = quota[key];
    const used = Number(window?.used_percent);
    if (!window || !Number.isFinite(used) || used < 0) return [];
    const minutes = Number(window.window_minutes);
    let label;
    if (minutes === 300) label = '5-hour usage limit';
    else if (minutes === 10080) label = 'Weekly usage limit';
    else if (Number.isFinite(minutes) && minutes > 0) {
      label = minutes < 60 ? `${minutes}-minute usage limit`
        : minutes < 1440 ? `${Math.round(minutes / 60)}-hour usage limit`
          : `${Math.round(minutes / 1440)}-day usage limit`;
    } else label = key === 'primary' ? 'Primary usage limit' : 'Secondary usage limit';
    return [{
      key,
      label,
      remaining: Math.round(Math.max(0, Math.min(100, 100 - used))),
      limitReached: used >= 100,
      statusLabel: used >= 100 ? 'Limit reached' : '',
      resetLabel: window.resets_at == null ? 'unknown' : formatDate(window.resets_at),
    }];
  });
}

export function quotaFailureVisible(account) {
  return Boolean(account?.quota_check_failed);
}
