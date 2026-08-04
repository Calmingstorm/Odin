import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { collectApplyDetails } from '../ui/js/config-apply-details.js';
import {
  HEALTH_FILTERS,
  HEALTH_STATES,
  countHealthStates,
} from '../ui/js/config-health.js';

const filterStates = HEALTH_FILTERS.filter(filter => filter.key !== 'all').map(filter => filter.key);
assert.deepEqual(filterStates, HEALTH_STATES, 'every server health state must have a page filter');

const fields = HEALTH_STATES.map(apply_state => ({ apply_state }));
const counts = countHealthStates(fields);
assert.deepEqual(Object.keys(counts), HEALTH_STATES, 'payload and page count vocabularies drifted');
assert.equal(counts.unknown, 1, 'unknown effective state disappeared from the health total');
assert.equal(Object.values(counts).reduce((total, count) => total + count, 0), fields.length);

// Production must consume the registry endpoint rather than quietly reviving
// the development fixture and its duplicated classifications.
const UI_ROOT = fileURLToPath(new URL('../ui/js/', import.meta.url));
function* jsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* jsFiles(path);
    else if (name.endsWith('.js')) yield path;
  }
}
for (const path of jsFiles(UI_ROOT)) {
  if (path.endsWith('config-meta-fixture.js')) continue;
  const source = readFileSync(path, 'utf8');
  assert.equal(
    source.includes('config-meta-fixture'),
    false,
    `${relative(process.cwd(), path)} reintroduced the local metadata fixture into production`,
  );
}
const configPage = readFileSync(join(UI_ROOT, 'pages/config.js'), 'utf8');
const fixtureSource = readFileSync(join(UI_ROOT, 'config-meta-fixture.js'), 'utf8');
for (const staleClaim of ['Until S2', 'Once S2 lands', 'U1 deliberately owns no backend', 'does not exist yet']) {
  assert.equal(
    configPage.includes(staleClaim) || fixtureSource.includes(staleClaim),
    false,
    `stale metadata-route claim remains: ${staleClaim}`,
  );
}
assert.equal(
  configPage.includes("const loadConfigMeta = () => api.get('/api/config/meta');"),
  true,
  'Config Center metadata must come directly from the authoritative endpoint',
);
assert.equal(
  (configPage.match(/await loadConfigMeta\(\)/g) || []).length,
  3,
  'initial load, post-save refresh, and restart recovery must read the registry endpoint',
);

const applyDetails = collectApplyDetails([{
  consumers: [{ name: 'Prompt builder', apply_mode: 'live_read', detail: 'Reads before each prompt.' }],
  apply_handler: 'POST /api/config/apply',
  restart_reason: 'Parser captured the value at boot.',
  activation_policy: 'Operator acknowledgement required.',
}]);
assert.deepEqual(
  applyDetails.map(detail => detail.kind),
  ['consumer', 'handler', 'restart', 'activation'],
  'the page must surface every apply-evidence class, not only the badge',
);
for (const key of ['fieldGroup.apply_details', 'fieldRuntimeCopy(field)']) {
  assert.equal(configPage.includes(key), true, `config page does not render ${key}`);
}

const configCss = readFileSync(fileURLToPath(new URL('../ui/css/style.css', import.meta.url)), 'utf8');
const healthLabelRule = /\.cfgc-health-copy\s*>\s*span\s*\{([^}]*)\}/.exec(configCss)?.[1] || '';
assert.match(healthLabelRule, /white-space:\s*normal/, 'health labels must wrap instead of truncating truth');
assert.doesNotMatch(healthLabelRule, /text-overflow:\s*ellipsis/, 'health labels must not hide their meaning');

console.log(`config-health: ${HEALTH_STATES.length} states, ${HEALTH_FILTERS.length} filters, live registry enforced`);
