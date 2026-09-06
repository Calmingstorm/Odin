import { parseOutput, foldText } from './output-format.js';

export const COMPACT_LIMITS = Object.freeze({ inlineChars: 240, previewLines: 4, previewChars: 600 });
const object = value => value !== null && typeof value === 'object';
const integrityKeys = new Set(['_hmac', '_prev_hmac']);
const normalize = text => text.replace(/\r\n?/g, '\n');

/** Presentation projection only. Raw received data, filtering and export stay intact.
 * Deliberately name the integrity fields; do not hide arbitrary operator JSON keys. */
export function displayText(value) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  try {
    let changed = false;
    const parsed = JSON.parse(raw, (key, value) => {
      if (integrityKeys.has(key)) { changed = true; return undefined; }
      return value;
    });
    return normalize(changed ? JSON.stringify(parsed) : raw);
  } catch { return normalize(raw); }
}

function warnings(model) {
  const meta = model.metadata;
  if (!meta) return [];
  const notes = [];
  const source = model.kind === 'audit_preview' && object(meta.source) ? meta.source : meta;
  if (model.kind === 'audit_preview') notes.push('audit clipped');
  if (source.truncated === true) notes.push('source truncated');
  if (source.retention === 'failed') notes.push('retention unavailable');
  if (source.capture_error) notes.push(`capture unavailable: ${source.capture_error}`);
  if (source.capture_limit_loss_bytes > 0) notes.push(`capture loss ${source.capture_limit_loss_bytes} B`);
  if (source.not_retained_bytes > 0) notes.push(`not retained ${source.not_retained_bytes} B`);
  if (source.capture_lost_bytes > 0) notes.push(`capture lost ${source.capture_lost_bytes} B`);
  if (source.dropped_bytes > 0) notes.push(`dropped ${source.dropped_bytes} B`);
  if (source.capture_loss === true || source.output_lost === true || source.capture_truncated === true) notes.push('capture loss');
  if (Number.isInteger(source.exit_code) && source.exit_code !== 0) notes.push(`process exit ${source.exit_code}`);
  if (['failed', 'error', 'cancelled', 'timed_out'].includes(source.status)) notes.push(`source ${source.status}`);
  if (model.kind === 'audit_preview' && !meta.preview) notes.push('audit body unavailable');
  return notes;
}

/** Decide on the extracted body BEFORE pretty-printing. Labels, attribution and
 * envelope metadata never contribute to the promotion thresholds. */
export function compactOutput(value) {
  const model = parseOutput(typeof value === 'string' ? normalize(value) : value, { prettyPrint: false });
  const sections = model.sections.map(section => ({ ...section, text: displayText(section.text) }));
  const body = sections.map(section => section.text).filter(Boolean).join('\n');
  const measured = body.replace(/\n$/, '');
  const chars = [...body].length;
  const lines = measured ? measured.split('\n').length : 0;
  const envelope = !['text', 'json'].includes(model.kind);
  const promoted = lines >= 2 || chars > COMPACT_LIMITS.inlineChars || (envelope && measured.length > 0);
  // JSON formatting is done only after the decision (or by explicit inspection).
  const formatted = sections.filter(section => section.text).map(section => {
    let text = section.text;
    try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* readable plain fallback */ }
    return section.label ? `${section.label}\n${text}` : text;
  }).join('\n\n').replace(/\n$/, '');
  const preview = foldText(formatted, COMPACT_LIMITS.previewLines, COMPACT_LIMITS.previewChars);
  const source = model.kind === 'audit_preview' ? model.metadata?.source : model.metadata;
  const outcome = source && (model.kind === 'process_output' || source.kind === 'process_output')
    ? `PID ${source.pid ?? '?'} ${source.status ?? ''}${Number.isInteger(source.exit_code) ? ` exit ${source.exit_code}` : ''}`.trim()
    : model.kind === 'agent_result' && source?.status ? `agent ${source.status}` : '';
  return { promoted, chars, lines, envelope, kind: model.kind, formatted, preview, outcome, header: model.header,
    summary: measured.replace(/\n/g, ' '), warnings: warnings(model) };
}
