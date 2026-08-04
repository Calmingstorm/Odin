/**
 * Turn registry evidence into compact, deduplicated UI disclosures.
 *
 * The Config Center edits top-level objects while /api/config/meta describes
 * their leaves. Accepting a record list lets an object editor surface every
 * distinct consumer, handler, restart reason, and activation policy without
 * repeating identical section defaults dozens of times.
 */
export function collectApplyDetails(records = []) {
  const details = [];
  const seen = new Set();

  function add(detail) {
    const signature = [
      detail.kind,
      detail.label,
      detail.apply_mode || '',
      detail.code || '',
      detail.text || '',
    ].join('\u0000');
    if (seen.has(signature)) return;
    seen.add(signature);
    details.push({ ...detail, key: signature });
  }

  for (const record of records) {
    for (const consumer of record?.consumers || []) {
      add({
        kind: 'consumer',
        label: consumer.name,
        apply_mode: consumer.apply_mode,
        text: consumer.detail,
      });
    }
  }
  for (const record of records) {
    if (record?.apply_handler) {
      add({ kind: 'handler', label: 'Apply handler', code: record.apply_handler });
    }
  }
  for (const record of records) {
    if (record?.restart_reason) {
      add({ kind: 'restart', label: 'Why a restart is required', text: record.restart_reason });
    }
  }
  for (const record of records) {
    if (record?.activation_policy) {
      add({ kind: 'activation', label: 'Activation policy', text: record.activation_policy });
    }
  }

  return details;
}
