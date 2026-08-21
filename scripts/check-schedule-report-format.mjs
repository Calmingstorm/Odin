import fs from 'node:fs';
import process from 'node:process';

const source = fs.readFileSync(new URL('../ui/js/pages/schedules.js', import.meta.url), 'utf8');
const assertions = [
  ['format selector exists', source.includes('v-model="form.report_format"')],
  ['generic v1 option exists', source.includes('value="paginated_embed_v1"')],
  ['form state owns field', source.includes("report_format: ''")],
  ['create payload submits field', source.includes('payload.report_format = f.report_format')],
  ['list readback renders field', source.includes("s.report_format || ''")],
  ['update surface submits field', source.includes('report_format: reportFormat')],
  ['update surface refreshes authoritative state', source.includes('await fetchSchedules()')],
];
const failures = assertions.filter(([, passed]) => !passed);
for (const [name, passed] of assertions) {
  console.log(`${passed ? 'ok' : 'not ok'} - ${name}`);
}
if (failures.length) process.exit(1);
console.log(`schedule-report-format: ${assertions.length} assertions passed`);
