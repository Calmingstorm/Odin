/**
 * Odin Configuration Center — page shell and information architecture.
 *
 * U1 owns navigation, search, health filtering, section-scoped drafts, review,
 * and responsive behaviour. Apply behavior comes from the authoritative
 * /api/config/meta registry; the page never reconstructs it from local rules.
 */
import { api } from '../api.js';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { collectApplyDetails } from '../config-apply-details.js';
import { HEALTH_FILTERS } from '../config-health.js';

const CATEGORY_GROUPS = [
  { key: 'core', label: 'Core', icon: 'sliders', sections: ['timezone', 'logging', 'permissions', 'graceful_degradation'] },
  { key: 'models', label: 'Models & AI', icon: 'brain', sections: ['image', 'llm_recovery'] },
  { key: 'runtime', label: 'Runtime', icon: 'activity', sections: ['context', 'sessions', 'agents', 'turn_state'] },
  { key: 'data', label: 'Data & Storage', icon: 'database', sections: ['learning', 'search', 'usage', 'audit', 'attachments'] },
  { key: 'services', label: 'Services', icon: 'link', sections: ['webhook', 'observability', 'email', 'browser', 'comfyui', 'slack', 'mcp'] },
  { key: 'automation', label: 'Automation', icon: 'workflow', sections: ['message_triggers', 'reaction_triggers', 'grafana_alerts', 'outbound_webhooks', 'issue_tracker'] },
  { key: 'infrastructure', label: 'Infrastructure', icon: 'server', sections: ['tools', 'web'] },
];

const APPLY_MODE_LABELS = {
  live_read: 'Applies immediately',
  live_apply: 'Reloads live',
  live_for_new_work: 'Applies to new work',
  restart: 'Restart required',
  activation_required: 'Saved only — see activation note',
  legacy_control: 'Controlled elsewhere',
  dormant: 'Saved for future support',
};

const CONFIG_EXCLUDED_SECTIONS = new Set([
  'llm_provider', 'openai_codex', 'ollama', 'kimi', 'personality', 'discord',
]);

const CONFIG_EXCLUDED_PATH_PREFIXES = Object.freeze([
  'web.api_tokens',
  'outbound_webhooks.targets',
]);

function isExcludedConfigPath(path) {
  return CONFIG_EXCLUDED_PATH_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}.`));
}

const STRUCTURED_CONTAINER_PATHS = new Set([
  'sessions.context_budget_overrides', 'tools.governor.host_overrides', 'tools.hosts',
  'tools.tool_timeouts', 'permissions.tiers', 'mcp.servers', 'slack.webhook_urls',
  'grafana_alerts.rules', 'outbound_webhooks.targets',
]);

const EXPANDED_STORAGE_KEY = 'odin_config_center_expanded_v1';
const CATEGORY_STORAGE_KEY = 'odin_config_center_category_v1';
const MAX_UNDO = 50;
const UNDO_COALESCE_MS = 650;

const loadConfigMeta = () => api.get('/api/config/meta');

function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function titleCase(value) {
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function compactValue(value) {
  if (value === undefined) return 'unset';
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  if (Array.isArray(value)) return value.length ? `${value.length} item${value.length === 1 ? '' : 's'}` : 'Empty list';
  if (typeof value === 'object') return Object.keys(value).length ? `${Object.keys(value).length} field${Object.keys(value).length === 1 ? '' : 's'}` : 'Empty object';
  if (value === '') return 'Empty';
  return String(value);
}

function formatValue(value) {
  if (value === undefined) return 'unset';
  if (value === null) return 'null';
  if (typeof value === 'object') {
    try { return JSON.stringify(value, null, 2); }
    catch { return String(value); }
  }
  return String(value);
}

function buildLeafPatch(original, edited) {
  if (deepEqual(original, edited)) return undefined;
  const bothObjects = original && edited
    && typeof original === 'object' && typeof edited === 'object'
    && !Array.isArray(original) && !Array.isArray(edited);
  if (!bothObjects) return deepClone(edited);

  const patch = {};
  for (const [key, value] of Object.entries(edited)) {
    const childPatch = buildLeafPatch(original[key], value);
    if (childPatch !== undefined) patch[key] = childPatch;
  }
  return Object.keys(patch).length ? patch : undefined;
}

function buildSectionPatch(original, drafts) {
  const patch = {};
  for (const [section, value] of Object.entries(drafts || {})) {
    const sectionPatch = buildLeafPatch(original?.[section], value);
    if (sectionPatch !== undefined) patch[section] = sectionPatch;
  }
  return patch;
}

function walkDiff(original, edited, path, out) {
  if (deepEqual(original, edited)) return;
  const bothObjects = original && edited
    && typeof original === 'object' && typeof edited === 'object'
    && !Array.isArray(original) && !Array.isArray(edited);
  if (bothObjects) {
    const keys = new Set([...Object.keys(original), ...Object.keys(edited)]);
    for (const key of keys) {
      walkDiff(original[key], edited[key], path ? `${path}.${key}` : key, out);
    }
    return;
  }
  out.push({ path, oldVal: original, newVal: edited });
}

function loadExpandedState() {
  try {
    const stored = JSON.parse(localStorage.getItem(EXPANDED_STORAGE_KEY) || '{}');
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

function loadCategoryState() {
  try {
    const stored = localStorage.getItem(CATEGORY_STORAGE_KEY);
    return CATEGORY_GROUPS.some(group => group.key === stored) ? stored : CATEGORY_GROUPS[0].key;
  } catch {
    return CATEGORY_GROUPS[0].key;
  }
}

export default {
  template: `
    <div class="config-center-page p-6 page-fade-in">
      <header class="cfgc-page-header">
        <div>
          <div class="cfgc-eyebrow">System settings</div>
          <h1 class="text-xl font-semibold">Configuration center</h1>
          <p class="cfgc-page-summary" v-if="config">
            {{ sectionCount }} sections · {{ fieldCount }} settings · revision {{ meta?.revision || 'unavailable' }}
          </p>
        </div>
        <div class="cfgc-header-actions">
          <button type="button" class="btn btn-ghost text-xs cfgc-desktop-history" @click="undo" :disabled="!canUndo" title="Undo (Ctrl+Z)">
            <odin-icon name="undo" :size="14" /> Undo
          </button>
          <button type="button" class="btn btn-ghost text-xs cfgc-desktop-history" @click="redo" :disabled="!canRedo" title="Redo (Ctrl+Y)">
            <odin-icon name="redo" :size="14" /> Redo
          </button>
          <button type="button" class="btn btn-ghost text-xs" @click="fetchConfig" :disabled="loading || hasChanges">
            <odin-icon name="refresh" :size="14" /> {{ loading ? 'Refreshing' : 'Refresh' }}
          </button>
          <button type="button" class="btn btn-primary text-xs" @click="openReview" :disabled="!hasChanges || hasDraftErrors">
            Review {{ changeCount ? changeCount : '' }}
          </button>
        </div>
      </header>

      <div v-if="toast" :class="['toast', toast.type === 'success' ? 'toast-success' : 'toast-error']" role="status" aria-live="polite">
        {{ toast.message }}
      </div>

      <div v-if="loading && !config" class="cfgc-loading" aria-label="Loading configuration">
        <div class="skeleton skeleton-row"></div>
        <div class="cfgc-loading-grid">
          <div class="skeleton skeleton-row"></div>
          <div class="skeleton skeleton-row"></div>
          <div class="skeleton skeleton-row"></div>
        </div>
      </div>

      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <div class="flex-1">
          <p class="text-red-400">Configuration could not be loaded</p>
          <p class="text-xs text-gray-500 mt-1">{{ error }}</p>
        </div>
        <button type="button" @click="fetchConfig" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <template v-else-if="config && meta">
        <section class="cfgc-health" aria-labelledby="cfgc-health-title">
          <div class="cfgc-health-heading">
            <div>
              <div class="cfgc-eyebrow">Configuration health</div>
              <h2 id="cfgc-health-title">Desired and effective state</h2>
            </div>
            <span v-if="hasChanges" class="cfgc-unsaved-pill">
              {{ changeCount }} unsaved change{{ changeCount === 1 ? '' : 's' }}
            </span>
            <span v-else class="cfgc-health-ok"><odin-icon name="success" :size="13" /> No unsaved changes</span>
          </div>

          <div class="cfgc-health-filters" role="group" aria-label="Filter configuration health">
            <button v-for="filter in healthFilters" :key="filter.key" type="button"
                    :class="['cfgc-health-filter', { active: healthFilter === filter.key }]"
                    :aria-pressed="healthFilter === filter.key" @click="selectHealthFilter(filter.key)">
              <span :class="['cfgc-health-icon', 'state-' + filter.key]"><odin-icon :name="filter.icon" :size="14" /></span>
              <span class="cfgc-health-copy">
                <span>{{ filter.label }}</span>
                <small>{{ healthCount(filter.key) }} setting{{ healthCount(filter.key) === 1 ? '' : 's' }}</small>
              </span>
            </button>
          </div>

          <div v-if="metaRefreshError" class="cfgc-health-alert warning" role="alert">
            <odin-icon name="warning" :size="16" />
            <div><strong>Apply status is stale</strong><span>{{ metaRefreshError }} Refresh to retrieve current registry state.</span></div>
          </div>
          <div v-if="meta.status?.persistence_error" class="cfgc-health-alert danger" role="alert">
            <odin-icon name="error" :size="16" />
            <div><strong>Persistence error</strong><span>{{ meta.status.persistence_error }}</span></div>
          </div>
          <div v-if="meta.status?.unsafe_overrides?.length" class="cfgc-health-alert warning" role="status">
            <odin-icon name="warning" :size="16" />
            <div><strong>Unsafe overrides effective</strong><span>{{ meta.status.unsafe_overrides.length }} item{{ meta.status.unsafe_overrides.length === 1 ? '' : 's' }} require review.</span></div>
          </div>
        </section>

        <section v-if="pendingRestartCount" class="cfgc-restart-banner" role="status">
          <odin-icon name="refresh" :size="18" />
          <div>
            <strong v-if="restartScheduled">Restart scheduled; waiting for Odin to return</strong>
            <strong v-else>Restart needed</strong>
            <span>Odin is still using startup values for {{ pendingRestartCount }} saved setting{{ pendingRestartCount === 1 ? '' : 's' }}.</span>
            <span v-if="restartError" class="text-red-400">{{ restartError }}</span>
          </div>
          <div class="cfgc-restart-actions">
            <button type="button" class="btn btn-ghost text-xs" @click="reviewPendingRestart">Review settings</button>
            <button type="button" class="btn btn-primary text-xs" @click="restartOdin" :disabled="restartScheduled">{{ restartScheduled ? 'Restarting…' : 'Restart Odin now' }}</button>
          </div>
        </section>

        <div class="cfgc-workspace">
          <aside class="cfgc-category-rail" aria-label="Configuration categories">
            <div class="cfgc-rail-label">Categories</div>
            <div class="cfgc-category-scroll">
              <button v-for="category in visibleCategories" :key="category.key" type="button"
                      :class="['cfgc-category', { active: activeCategory === category.key && !globalFilterActive }]"
                      :aria-current="activeCategory === category.key && !globalFilterActive ? 'page' : undefined"
                      @click="selectCategory(category.key)">
                <span class="cfgc-category-icon"><odin-icon :name="category.icon" :size="16" /></span>
                <span class="cfgc-category-copy">
                  <span>{{ category.label }}</span>
                  <small>{{ categoryStats(category).fields }} settings</small>
                </span>
                <span class="cfgc-category-counts" aria-hidden="true">
                  <span v-if="categoryStats(category).modified" class="modified">{{ categoryStats(category).modified }}M</span>
                  <span v-if="categoryStats(category).pending_restart" class="restart">{{ categoryStats(category).pending_restart }}R</span>
                  <span v-if="categoryStats(category).invalid" class="invalid">{{ categoryStats(category).invalid }}I</span>
                  <span v-if="categoryStats(category).dormant" class="dormant">{{ categoryStats(category).dormant }}D</span>
                </span>
              </button>
            </div>
            <div class="cfgc-rail-key">
              <span><b class="modified">M</b> Modified</span>
              <span><b class="restart">R</b> Restart</span>
              <span><b class="invalid">I</b> Invalid</span>
              <span><b class="dormant">D</b> Saved only</span>
            </div>
          </aside>

          <main class="cfgc-main">
            <div class="cfgc-toolbar">
              <label class="cfgc-search">
                <span class="sr-only">Search configuration</span>
                <odin-icon name="search" :size="16" />
                <input v-model.trim="searchQuery" type="search"
                       placeholder="Search labels, paths, descriptions, or aliases"
                       autocomplete="off" />
                <button v-if="searchQuery" type="button" class="icon-btn" @click="searchQuery = ''" aria-label="Clear search">
                  <odin-icon name="close" :size="14" />
                </button>
              </label>
              <button v-if="globalFilterActive" type="button" class="btn btn-ghost text-xs" @click="clearFilters">
                Clear filters
              </button>
            </div>

            <div v-if="displayGroups.length === 0" class="cfgc-empty hm-card">
              <odin-icon name="search" :size="24" />
              <h2>No configuration matches</h2>
              <p>Try a label such as “timeout”, a raw path such as <code>tools.streaming</code>, or clear the health filter.</p>
              <button type="button" class="btn btn-ghost text-xs" @click="clearFilters">Clear filters</button>
            </div>

            <section v-for="group in displayGroups" :key="group.key" class="cfgc-category-panel" :aria-labelledby="'cfgc-group-' + group.key">
              <div class="cfgc-category-panel-heading">
                <div>
                  <div class="cfgc-eyebrow">{{ globalFilterActive ? 'Matching category' : 'Category' }}</div>
                  <h2 :id="'cfgc-group-' + group.key">{{ group.label }}</h2>
                </div>
                <span>{{ group.sections.length }} section{{ group.sections.length === 1 ? '' : 's' }}</span>
              </div>

              <article v-for="section in group.sections" :key="section"
                       :class="['cfgc-section', { modified: sectionChanged(section) }]">
                <button type="button" class="cfgc-section-header" @click="toggleSection(section)"
                        :aria-expanded="isSectionExpanded(section)" :aria-controls="'cfgc-section-' + section">
                  <span class="cfgc-section-chevron"><odin-icon :name="isSectionExpanded(section) ? 'chevronDown' : 'chevronRight'" :size="15" /></span>
                  <span class="cfgc-section-title">
                    <span>{{ sectionLabel(section) }}</span>
                    <small>{{ section }}</small>
                  </span>
                  <span class="cfgc-section-summary">{{ sectionDescription(section) }}</span>
                  <span class="cfgc-section-badges">
                    <span v-if="sectionChanged(section)" class="badge badge-warning">modified</span>
                    <span v-if="sectionHealthCount(section, 'pending_restart')" class="badge cfgc-badge-restart">restart</span>
                    <span v-if="sectionHealthCount(section, 'invalid')" class="badge badge-danger">invalid</span>
                    <span v-if="sectionHealthCount(section, 'dormant')" class="badge cfgc-badge-dormant">saved only</span>
                    <span class="cfgc-field-count">{{ sectionFieldCount(section) }}</span>
                  </span>
                </button>

                <div v-if="isSectionExpanded(section)" :id="'cfgc-section-' + section" class="cfgc-section-body">
                  <div v-if="searchQuery && sectionSearchHits(section).length" class="cfgc-search-hits">
                    <span>Matched</span>
                    <button v-for="hit in sectionSearchHits(section).slice(0, 5)" :key="hit.path" type="button" @click="focusField(hit.path)">
                      {{ hit.label }} <code>{{ hit.path }}</code>
                    </button>
                    <span v-if="sectionSearchHits(section).length > 5">+{{ sectionSearchHits(section).length - 5 }} more</span>
                  </div>




                  <div class="cfgc-field-groups">
                    <section v-for="fieldGroup in fieldGroups(section)" :key="fieldGroup.key" :class="['cfgc-field-group', { nested: fieldGroup.path }]">
                      <header v-if="fieldGroup.path" class="cfgc-field-group-header">
                        <div>
                          <strong>{{ fieldGroup.label }}</strong>
                          <code>{{ fieldGroup.path }}</code>
                          <p v-if="fieldGroup.description">{{ fieldGroup.description }}</p>
                        </div>
                        <span>{{ fieldGroup.entries.length }} setting{{ fieldGroup.entries.length === 1 ? '' : 's' }}</span>
                      </header>

                      <div class="cfgc-fields">
                        <div v-for="field in fieldGroup.entries" :key="field.path" :id="fieldId(field.path)"
                             :class="['cfgc-field', { changed: fieldChanged(field.path), invalid: fieldError(field) }]">
                          <div class="cfgc-field-copy">
                            <label :for="fieldInputId(field.path)">{{ field.label }}</label>
                            <code>{{ field.path }}</code>
                            <p>{{ field.description }}</p>
                            <div class="cfgc-field-meta">
                              <span :class="['cfgc-apply-pill', applyClass(field.apply_mode)]">{{ applyModeLabel(field.apply_mode) }}</span>
                              <span v-if="field.unit">{{ field.unit }}</span>
                              <span v-if="field.sensitivity !== 'public'" class="cfgc-sensitive"><odin-icon name="shield" :size="12" /> write-only</span>
                            </div>
                          </div>

                          <div class="cfgc-field-control">
                            <template v-if="field.sensitivity !== 'public'">
                              <div class="cfgc-write-only">
                                <span><odin-icon name="shield" :size="15" /> {{ field.configured ? 'Configured' : 'Not configured' }}</span>
                                <small>{{ field.provenance === 'unset' ? 'No credential source' : 'Source: ' + field.provenance.replace('_', ' ') }}</small>
                                <button v-if="hasHonestAction(field)" type="button" class="btn btn-ghost text-xs" @click="runFieldAction(field)">{{ field.action_label }}</button>
                              </div>
                            </template>

                            <template v-else>
                              <select v-if="field.enum?.length" :id="fieldInputId(field.path)" class="hm-select"
                                      :value="field.value" @change="setFieldValue(field, $event.target.value)">
                                <option v-for="option in field.enum" :key="String(option)" :value="option">{{ option }}</option>
                              </select>

                              <label v-else-if="typeof field.value === 'boolean'" class="cfgc-boolean-control" :for="fieldInputId(field.path)">
                                <span>{{ field.value ? 'Enabled' : 'Disabled' }}</span>
                                <span class="toggle-switch">
                                  <input :id="fieldInputId(field.path)" type="checkbox" :checked="field.value"
                                         @change="setFieldValue(field, $event.target.checked)" />
                                  <span class="toggle-slider"></span>
                                </span>
                              </label>

                              <div v-else-if="field.editor === 'warning-chips'" class="cfgc-chip-editor">
                                <div class="cfgc-chip-list" aria-label="Warning thresholds">
                                  <span v-for="item in field.value" :key="item" class="cfgc-chip">
                                    {{ item }}
                                    <button type="button" @click="removeWarningThreshold(field, item)" :aria-label="'Remove warning at ' + item + ' iterations'">×</button>
                                  </span>
                                </div>
                                <div class="cfgc-chip-add">
                                  <label :for="fieldInputId(field.path)">Warn when</label>
                                  <input :id="fieldInputId(field.path)" class="hm-input font-mono" type="number" min="1"
                                         v-model="warningThresholdInput" @keydown.enter.prevent="addWarningThreshold(field)" />
                                  <span>iterations remain</span>
                                  <button type="button" class="btn btn-ghost text-xs" @click="addWarningThreshold(field)">Add</button>
                                </div>
                              </div>

                              <div v-else-if="isScalarArray(field)" class="cfgc-chip-editor">
                                <div class="cfgc-chip-list">
                                  <span v-for="item in field.value" :key="String(item)" class="cfgc-chip">
                                    {{ item }}
                                    <button type="button" @click="removeScalarArrayItem(field, item)" :aria-label="'Remove ' + item">×</button>
                                  </span>
                                  <span v-if="!field.value.length" class="cfgc-chip-empty">No entries</span>
                                </div>
                                <div class="cfgc-chip-add">
                                  <input :id="fieldInputId(field.path)" class="hm-input font-mono" type="text"
                                         v-model="arrayInputs[field.path]" @keydown.enter.prevent="addScalarArrayItem(field)" placeholder="Add an entry" />
                                  <button type="button" class="btn btn-ghost text-xs" @click="addScalarArrayItem(field)">Add</button>
                                </div>
                              </div>

                              <input v-else-if="field.type === 'integer' || field.type === 'number'" :id="fieldInputId(field.path)" class="hm-input font-mono"
                                     type="number" :min="field.constraints?.minimum" :max="field.constraints?.maximum"
                                     :step="field.type === 'integer' ? 1 : 'any'" :value="numberInputValue(field)"
                                     @focus="beginInputEdit(field.path)" @input="setNumberFieldValue(field, $event.target.value)" @blur="endInputEdit(field)" />

                              <div v-else-if="field.type === 'object' || field.type === 'array'" class="cfgc-structured-summary">
                                <span>{{ compactValue(field.value) }}</span>
                                <small>A purpose-built table is required before release.</small>
                              </div>

                              <input v-else :id="fieldInputId(field.path)" class="hm-input font-mono" type="text"
                                     :value="field.value ?? ''" @focus="beginInputEdit(field.path)"
                                     @input="setFieldValue(field, $event.target.value, { coalesce: true })" @blur="endTextInputEdit(field.path)" />
                            </template>
                            <p v-if="fieldError(field)" class="cfgc-field-error" role="alert">{{ fieldError(field) }}</p>
                          </div>

                          <div v-if="fieldSpecificRuntimeNote(field)" class="cfgc-field-runtime-note">
                            <strong>{{ field.apply_mode === 'activation_required' ? 'Activation note' : 'Runtime note' }}</strong>
                            <p>{{ fieldSpecificRuntimeNote(field) }}</p>
                            <button v-if="hasHonestAction(field)" type="button" class="btn btn-ghost text-xs" @click="runFieldAction(field)">{{ field.action_label }}</button>
                          </div>
                        </div>
                      </div>

                      <div v-if="fieldGroup.runtime_summaries.length || fieldGroup.apply_details.length" class="cfgc-group-apply-details">
                        <details>
                          <summary>{{ fieldGroup.runtime_summaries.length ? 'What saving changes' : fieldGroup.apply_details.length + ' runtime detail' + (fieldGroup.apply_details.length === 1 ? '' : 's') }}</summary>
                          <div v-if="fieldGroup.runtime_summaries.length" class="cfgc-runtime-summary-list">
                            <div v-for="summary in fieldGroup.runtime_summaries" :key="summary.key" class="cfgc-runtime-summary">
                              <strong>{{ summary.label }}</strong>
                              <p>{{ summary.save }}</p>
                              <p>{{ summary.runtime }}</p>
                            </div>
                          </div>
                          <div v-if="fieldGroup.apply_details.length" class="cfgc-apply-detail-list">
                            <div v-for="detail in fieldGroup.apply_details" :key="detail.key" :class="['cfgc-apply-detail', 'detail-' + detail.kind]">
                              <div class="cfgc-apply-detail-heading">
                                <strong>{{ detail.label }}</strong>
                                <span v-if="detail.apply_mode" :class="['cfgc-apply-pill', applyClass(detail.apply_mode)]">{{ applyModeLabel(detail.apply_mode) }}</span>
                              </div>
                              <code v-if="detail.code">{{ detail.code }}</code>
                              <p v-if="detail.text">{{ detail.text }}</p>
                            </div>
                          </div>
                        </details>
                      </div>
                    </section>
                  </div>
                </div>
              </article>
            </section>
          </main>
        </div>

        <div v-if="hasChanges" class="cfgc-mobile-action-bar" aria-label="Draft actions">
          <button type="button" class="btn btn-ghost" @click="mobileCancel">Cancel</button>
          <button type="button" class="btn btn-primary" @click="openReview" :disabled="!hasChanges || hasDraftErrors">Review</button>
          <div class="cfgc-mobile-overflow">
            <button type="button" class="icon-btn" @click="mobileOverflowOpen = !mobileOverflowOpen" :aria-expanded="mobileOverflowOpen" aria-label="More draft actions">
              <odin-icon name="more" :size="18" />
            </button>
            <div v-if="mobileOverflowOpen" class="cfgc-mobile-overflow-menu">
              <button type="button" @click="undo(); mobileOverflowOpen = false" :disabled="!canUndo"><odin-icon name="undo" :size="14" /> Undo</button>
              <button type="button" @click="redo(); mobileOverflowOpen = false" :disabled="!canRedo"><odin-icon name="redo" :size="14" /> Redo</button>
              <button type="button" @click="discardAllDrafts(); mobileOverflowOpen = false" :disabled="!hasChanges"><odin-icon name="trash" :size="14" /> Discard all</button>
            </div>
          </div>
        </div>

        <div v-if="restartPromptOpen" class="cfgc-review-overlay" @click.self="restartLater" @keyup.escape="restartLater" tabindex="-1">
          <aside class="cfgc-restart-dialog" v-modal-focus role="dialog" aria-modal="true" aria-labelledby="cfgc-restart-title">
            <div class="cfgc-eyebrow">Configuration saved</div>
            <h2 id="cfgc-restart-title">{{ pendingRestartCount }} setting{{ pendingRestartCount === 1 ? '' : 's' }} still use startup values</h2>
            <p>A clean restart applies them. Deferring is safe; the reminder stays visible until a fresh Odin process confirms the settings are active.</p>
            <p v-if="restartError" class="cfgc-field-error" role="alert">{{ restartError }}</p>
            <div class="cfgc-restart-dialog-actions">
              <button type="button" class="btn btn-ghost" @click="reviewPendingRestart">Review pending settings</button>
              <button type="button" class="btn btn-ghost" @click="restartLater">Restart later</button>
              <button type="button" class="btn btn-primary" @click="restartOdin" :disabled="restartScheduled">Restart Odin now</button>
            </div>
          </aside>
        </div>

        <div v-if="reviewOpen" class="cfgc-review-overlay" @click.self="closeReview" @keyup.escape="closeReview" tabindex="-1">
          <aside class="cfgc-review-tray" v-modal-focus role="dialog" aria-modal="true" aria-labelledby="cfgc-review-title">
            <header class="cfgc-review-header">
              <div>
                <div class="cfgc-eyebrow">Commit gate</div>
                <h2 id="cfgc-review-title">Review configuration changes</h2>
                <p>{{ changeCount }} change{{ changeCount === 1 ? '' : 's' }} across {{ changedSectionCount }} section{{ changedSectionCount === 1 ? '' : 's' }}</p>
              </div>
              <button type="button" class="icon-btn" @click="closeReview" aria-label="Close review tray"><odin-icon name="close" :size="17" /></button>
            </header>

            <div class="cfgc-review-body">
              <div v-if="hasDraftErrors" class="cfgc-health-alert danger" role="alert">
                <odin-icon name="error" :size="16" />
                <div><strong>Draft contains errors</strong><span>Resolve every field error before saving.</span></div>
              </div>

              <section v-for="group in reviewGroups" :key="group.key" class="cfgc-review-group">
                <header>
                  <span :class="['cfgc-apply-pill', applyClass(group.key)]">{{ group.label }}</span>
                  <span>{{ group.entries.length }}</span>
                </header>
                <div v-for="entry in group.entries" :key="entry.path" class="cfgc-review-entry">
                  <div>
                    <strong>{{ entry.label }}</strong>
                    <code>{{ entry.path }}</code>
                  </div>
                  <div class="cfgc-review-values">
                    <span>{{ compactValue(entry.oldVal) }}</span>
                    <odin-icon name="chevronRight" :size="13" />
                    <span>{{ compactValue(entry.newVal) }}</span>
                  </div>
                </div>
              </section>
            </div>

            <footer class="cfgc-review-footer">
              <div>
                <strong>Nothing changes until you save this review.</strong>
                <span v-if="reviewRestartCount">{{ reviewRestartCount }} change{{ reviewRestartCount === 1 ? '' : 's' }} will remain pending until restart.</span>
                <span v-else>Apply behaviour follows the class shown above.</span>
              </div>
              <button type="button" class="btn btn-ghost" @click="closeReview">Back to draft</button>
              <button type="button" class="btn btn-primary" @click="saveConfig" :disabled="saving || hasDraftErrors || !hasChanges">
                {{ saving ? 'Saving…' : 'Save reviewed changes' }}
              </button>
            </footer>
          </aside>
        </div>
      </template>
    </div>
  `,

  setup() {
    const config = ref(null);
    const meta = ref(null);
    const loading = ref(true);
    const saving = ref(false);
    const error = ref(null);
    const toast = ref(null);
    const metaRefreshError = ref(null);
    const restartPromptOpen = ref(false);
    const restartScheduled = ref(false);
    const restartError = ref(null);
    const searchQuery = ref('');
    const healthFilter = ref('all');
    const activeCategory = ref(loadCategoryState());
    const expandedSections = ref(loadExpandedState());
    const drafts = ref({});
    const inputDrafts = ref({});
    const warningThresholdInput = ref('');
    const arrayInputs = ref({});
    const jsonErrors = ref({});
    const undoStack = ref([]);
    const redoStack = ref([]);
    const reviewOpen = ref(false);
    const mobileOverflowOpen = ref(false);
    const isMobile = ref(false);
    let mobileMedia = null;
    let restartPollTimer = null;
    let lastUndoEdit = { path: null, at: 0 };
    let restartPollAttempts = 0;

    const fields = computed(() => (meta.value?.fields || []).filter(field =>
      !CONFIG_EXCLUDED_SECTIONS.has(field.path.split('.')[0]) && !isExcludedConfigPath(field.path)
    ));
    const fieldsByPath = computed(() => new Map(fields.value.map(field => [field.path, field])));
    const sectionCount = computed(() => visibleCategories.value.reduce((total, group) => total + group.sections.length, 0));
    const fieldCount = computed(() => fields.value.length);
    const healthFilters = computed(() => HEALTH_FILTERS);
    const canUndo = computed(() => undoStack.value.length > 0);
    const canRedo = computed(() => redoStack.value.length > 0);

    const visibleCategories = computed(() => {
      if (!config.value) return [];
      const grouped = new Set(CATEGORY_GROUPS.flatMap(group => group.sections));
      const result = CATEGORY_GROUPS.map(group => ({
        ...group,
        sections: group.sections.filter(section => Object.hasOwn(config.value, section) && !CONFIG_EXCLUDED_SECTIONS.has(section)),
      })).filter(group => group.sections.length);
      const ungrouped = Object.keys(config.value).filter(section => !grouped.has(section) && !CONFIG_EXCLUDED_SECTIONS.has(section));
      if (ungrouped.length) result.push({ key: 'other', label: 'Other', icon: 'folder', sections: ungrouped });
      return result;
    });

    const pendingConfig = computed(() => {
      if (!config.value) return null;
      return { ...config.value, ...drafts.value };
    });

    const diffEntries = computed(() => {
      if (!config.value) return [];
      const entries = [];
      for (const [section, value] of Object.entries(drafts.value)) {
        walkDiff(config.value[section], value, section, entries);
      }
      return entries.filter(entry => !deepEqual(entry.oldVal, entry.newVal)).map(entry => {
        const field = metadataForPath(entry.path);
        return {
          ...entry,
          label: field?.label || titleCase(entry.path.split('.').at(-1)),
          apply_mode: field?.apply_mode || sectionApplyMode(entry.path.split('.')[0]),
        };
      });
    });

    const hasChanges = computed(() => diffEntries.value.length > 0);
    const changeCount = computed(() => diffEntries.value.length);
    const changedSectionCount = computed(() => new Set(diffEntries.value.map(entry => entry.path.split('.')[0])).size);
    const globalFilterActive = computed(() => Boolean(searchQuery.value) || healthFilter.value !== 'all');

    const draftErrors = computed(() => {
      const errors = { ...jsonErrors.value };
      for (const entry of diffEntries.value) {
        const field = metadataForPath(entry.path);
        const message = validateValue(field, entry.newVal);
        if (message) errors[entry.path] = message;
      }
      return errors;
    });
    const hasDraftErrors = computed(() => Object.keys(draftErrors.value).length > 0);

    const displayGroups = computed(() => {
      if (!config.value) return [];
      const source = globalFilterActive.value
        ? visibleCategories.value
        : visibleCategories.value.filter(group => group.key === activeCategory.value);
      return source.map(group => ({
        ...group,
        sections: group.sections.filter(section => sectionMatches(section)),
      })).filter(group => group.sections.length);
    });

    const reviewGroups = computed(() => {
      const modes = ['live_read', 'live_apply', 'live_for_new_work', 'restart', 'activation_required', 'legacy_control', 'dormant'];
      const grouped = new Map(modes.map(mode => [mode, []]));
      for (const entry of diffEntries.value) {
        const mode = grouped.has(entry.apply_mode) ? entry.apply_mode : 'restart';
        grouped.get(mode).push(entry);
      }
      return modes.filter(mode => grouped.get(mode).length).map(mode => ({
        key: mode,
        label: applyModeLabel(mode),
        entries: grouped.get(mode),
      }));
    });

    const reviewRestartCount = computed(() => diffEntries.value.filter(entry => entry.apply_mode === 'restart').length);
    const pendingRestartFields = computed(() => fields.value.filter(field => field.pending_restart));
    const pendingRestartCount = computed(() => pendingRestartFields.value.length);


    function metadataForPath(path) {
      const field = fieldsByPath.value.get(path);
      return field ? { ...field, apply_details: collectApplyDetails([field]) } : null;
    }

    function sectionFields(section) {
      const prefix = `${section}.`;
      return fields.value.filter(field => field.path === section || field.path.startsWith(prefix));
    }

    function sectionFieldCount(section) {
      return sectionFields(section).length;
    }

    function sectionLabel(section) {
      return titleCase(section);
    }

    function sectionDescription(section) {
      const records = sectionFields(section);
      if (!records.length) return `${titleCase(section)} configuration.`;
      const representative = records.find(field => field.sensitivity === 'public' && field.description)
        || records.find(field => field.description);
      const description = representative?.description || '';
      const generic = description.match(/setting for (.+)\.$/i);
      if (generic) return `${titleCase(section)} settings and runtime behaviour.`;
      return description;
    }

    function sectionApplyMode(section) {
      const modes = [...new Set(sectionFields(section).map(field => field.apply_mode))];
      if (modes.length === 1) return modes[0];
      if (modes.includes('restart')) return 'restart';
      if (modes.includes('activation_required')) return 'activation_required';
      return modes[0] || 'restart';
    }

    function sectionApplySummary(section) {
      const modes = [...new Set(sectionFields(section).map(field => applyModeLabel(field.apply_mode)))];
      if (!modes.length) return '';
      return modes.length === 1 ? modes[0] : `Mixed apply behaviour: ${modes.join(' · ')}`;
    }

    function sectionApplyDetails(section) {
      return collectApplyDetails(sectionFields(section));
    }



    function sectionValue(section) {
      return Object.hasOwn(drafts.value, section) ? drafts.value[section] : config.value?.[section];
    }

    function valueAtPath(root, path) {
      return path.split('.').reduce((value, segment) => value?.[segment], root);
    }

    function sectionEntries(section) {
      const root = pendingConfig.value;
      return sectionFields(section).filter(field => {
        if (isExcludedConfigPath(field.path)) return false;
        const segments = field.path.split('.');
        if (segments.length <= 2) return true;
        // Flatten schema-known nested model leaves. Wildcard/container records
        // remain one structured row until their purpose-built table lands.
        return !field.path.includes('.*');
      }).map(field => ({
        ...field,
        key: field.path.split('.').at(-1),
        value: valueAtPath(root, field.path),
        apply_details: collectApplyDetails([field]),
        editor: field.path === 'agents.final_warning_iterations' ? 'warning-chips' : null,
      }));
    }

    function fieldGroupPath(field) {
      const parts = field.path.split('.');
      return parts.length > 2 ? parts.slice(0, 2).join('.') : null;
    }

    function fieldGroups(section) {
      const groups = new Map();
      for (const field of sectionEntries(section)) {
        const path = fieldGroupPath(field);
        const key = path || `${section}.__root`;
        if (!groups.has(key)) groups.set(key, { key, path, entries: [] });
        groups.get(key).entries.push(field);
      }
      return [...groups.values()].map(group => {
        const descriptionRecord = group.entries.find(field => field.group_description);
        return {
          ...group,
          label: group.path ? titleCase(group.path.split('.').at(-1)) : null,
          description: descriptionRecord?.group_description || null,
          apply_details: collectApplyDetails(group.entries),
          runtime_summaries: groupRuntimeSummaries(group.entries),
        };
      });
    }

    function fieldRuntimeCopy(field) {
      return {
        save: field.save_effect || (field.apply_mode === 'dormant'
          ? 'Saving records this value in config.yml.'
          : 'Saving records this value and validates the section.'),
        runtime: field.runtime_effect || ({
          live_read: 'Odin reads the saved value during current work.',
          live_apply: 'Odin reloads this setting without a restart.',
          live_for_new_work: 'New work uses the saved value; existing work keeps its snapshot.',
          restart: 'Odin keeps using its startup value until a clean restart.',
          activation_required: 'Odin keeps the current behavior until you enable this feature separately.',
          legacy_control: 'Odin keeps the existing compatibility behavior until you apply this choice.',
          dormant: 'This version of Odin does not use the saved value. Restarting will not activate it.',
        }[field.apply_mode] || 'Effective runtime state is not currently observable.'),
      };
    }

    function groupRuntimeSummaries(entries) {
      const summaries = new Map();
      for (const field of entries) {
        const copy = fieldRuntimeCopy(field);
        const key = `${field.apply_mode}|${copy.save}|${copy.runtime}`;
        if (!summaries.has(key)) {
          summaries.set(key, {
            key,
            label: applyModeLabel(field.apply_mode),
            save: copy.save,
            runtime: copy.runtime,
          });
        }
      }
      return [...summaries.values()];
    }

    function fieldSpecificRuntimeNote(field) {
      if (hasHonestAction(field)) return field.runtime_effect || field.activation_policy || '';
      if (field.apply_mode === 'activation_required') {
        const policy = field.activation_policy || field.runtime_effect;
        return policy ? `Not active after saving. No activation control exists in this release. ${policy}` : 'Not active after saving; no activation control exists in this release.';
      }
      return '';
    }

    function hasHonestAction(field) {
      return field.action_available === true && Boolean(field.action_label && field.action_endpoint);
    }

    async function runFieldAction(field) {
      if (!hasHonestAction(field)) return;
      try {
        if (fieldChanged(field.path)) throw new Error('Save this setting before applying its action.');
        const method = String(field.action_method || 'POST').toLowerCase();
        const action = { post: api.post.bind(api), put: api.put.bind(api), delete: api.del.bind(api) }[method];
        if (!action) throw new Error('Unsupported configuration action');
        await action(field.action_endpoint, field.action_body || undefined);
        await fetchConfig();
        showToast('success', `${field.action_label} completed.`);
      } catch (actionError) {
        showToast('error', actionError.message || `${field.action_label} failed`);
      }
    }

    function fieldMatchesSearch(field, query) {
      const haystack = [field.label, field.path, field.description, ...(field.aliases || [])]
        .filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    }

    function sectionSearchHits(section) {
      const query = searchQuery.value.trim().toLowerCase();
      if (!query) return [];
      return sectionFields(section).filter(field => fieldMatchesSearch(field, query));
    }

    function sectionMatches(section) {
      const records = sectionFields(section);
      if (healthFilter.value !== 'all' && !records.some(field => field.apply_state === healthFilter.value)) return false;
      const query = searchQuery.value.trim().toLowerCase();
      if (!query) return true;
      if (`${sectionLabel(section)} ${section}`.toLowerCase().includes(query)) return true;
      return records.some(field => fieldMatchesSearch(field, query));
    }

    function sectionHealthCount(section, state) {
      return sectionFields(section).filter(field => field.apply_state === state).length;
    }

    function healthCount(key) {
      if (key === 'all') return fieldCount.value;
      return fields.value.filter(field => field.apply_state === key).length;
    }

    function categoryStats(category) {
      const categoryFields = category.sections.flatMap(section => sectionFields(section));
      return {
        fields: categoryFields.length,
        modified: diffEntries.value.filter(entry => category.sections.includes(entry.path.split('.')[0])).length,
        pending_restart: categoryFields.filter(field => field.apply_state === 'pending_restart').length,
        invalid: categoryFields.filter(field => field.apply_state === 'invalid').length,
        dormant: categoryFields.filter(field => field.apply_state === 'dormant').length,
      };
    }

    function sectionChanged(section) {
      return Object.hasOwn(drafts.value, section) && !deepEqual(config.value?.[section], drafts.value[section]);
    }

    function fieldChanged(path) {
      return diffEntries.value.some(entry => entry.path === path || entry.path.startsWith(`${path}.`));
    }

    function selectCategory(key) {
      activeCategory.value = key;
      searchQuery.value = '';
      healthFilter.value = 'all';
      try { localStorage.setItem(CATEGORY_STORAGE_KEY, key); } catch { /* storage unavailable */ }
    }

    function selectHealthFilter(key) {
      healthFilter.value = key;
    }

    function clearFilters() {
      searchQuery.value = '';
      healthFilter.value = 'all';
    }

    function categorySectionsFor(section) {
      return visibleCategories.value.find(group => group.sections.includes(section))?.sections || [];
    }

    function mobileDefaultSection(section) {
      const sections = categorySectionsFor(section);
      const explicitOpen = sections.find(candidate => expandedSections.value[candidate] === true);
      if (explicitOpen) return explicitOpen;
      return sections.find(candidate => expandedSections.value[candidate] !== false) || null;
    }

    function isSectionExpanded(section) {
      if (searchQuery.value && !isMobile.value && sectionMatches(section)) return true;
      if (isMobile.value) return mobileDefaultSection(section) === section;
      if (Object.hasOwn(expandedSections.value, section)) return expandedSections.value[section] === true;
      return true;
    }

    function toggleSection(section) {
      const nextOpen = !isSectionExpanded(section);
      if (isMobile.value) {
        const next = { ...expandedSections.value };
        for (const candidate of categorySectionsFor(section)) {
          if (next[candidate] === true) next[candidate] = false;
        }
        next[section] = nextOpen;
        expandedSections.value = next;
        return;
      }
      expandedSections.value = { ...expandedSections.value, [section]: nextOpen };
    }

    function recordUndo() {
      undoStack.value.push(deepClone(drafts.value));
      if (undoStack.value.length > MAX_UNDO) undoStack.value.shift();
      redoStack.value = [];
    }


    function discardAllDrafts() {
      if (!hasChanges.value) return;
      recordUndo();
      drafts.value = {};
      jsonErrors.value = {};
      reviewOpen.value = false;
    }

    function recordUndoForField(path, coalesce = false) {
      const now = Date.now();
      if (coalesce && lastUndoEdit.path === path && now - lastUndoEdit.at < UNDO_COALESCE_MS) {
        lastUndoEdit.at = now;
        return;
      }
      recordUndo();
      lastUndoEdit = { path, at: now };
    }

    function setNestedValue(root, segments, value) {
      if (!segments.length) return value;
      const copy = deepClone(root ?? {});
      let cursor = copy;
      for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        cursor[segment] = deepClone(cursor[segment] ?? {});
        cursor = cursor[segment];
      }
      cursor[segments.at(-1)] = value;
      return copy;
    }

    function ensureSectionDraft(section) {
      if (Object.hasOwn(drafts.value, section)) return drafts.value[section];
      return deepClone(config.value?.[section]);
    }

    function setFieldValue(field, value, options = {}) {
      const [section, ...segments] = field.path.split('.');
      recordUndoForField(field.path, Boolean(options.coalesce));
      const current = ensureSectionDraft(section);
      const nextValue = segments.length ? setNestedValue(current, segments, value) : value;
      const nextDrafts = { ...drafts.value };
      if (deepEqual(nextValue, config.value?.[section])) delete nextDrafts[section];
      else nextDrafts[section] = nextValue;
      drafts.value = nextDrafts;
      if (jsonErrors.value[field.path]) {
        const next = { ...jsonErrors.value };
        delete next[field.path];
        jsonErrors.value = next;
      }
    }

    function beginInputEdit(path) {
      lastUndoEdit = { path: null, at: 0 };
      inputDrafts.value = { ...inputDrafts.value, [path]: String(valueAtPath(pendingConfig.value, path) ?? '') };
    }

    function endTextInputEdit(path) {
      lastUndoEdit = { path: null, at: 0 };
      if (!Object.hasOwn(inputDrafts.value, path)) return;
      const next = { ...inputDrafts.value };
      delete next[path];
      inputDrafts.value = next;
    }

    function endInputEdit(field) {
      const raw = inputDrafts.value[field.path];
      lastUndoEdit = { path: null, at: 0 };
      if (raw === '') {
        jsonErrors.value = { ...jsonErrors.value, [field.path]: 'Enter a number.' };
        return;
      }
      const parsed = Number(raw);
      if (Number.isNaN(parsed) || (field.type === 'integer' && !Number.isInteger(parsed))) {
        jsonErrors.value = { ...jsonErrors.value, [field.path]: field.type === 'integer' ? 'Enter a whole number.' : 'Enter a number.' };
        return;
      }
      const next = { ...inputDrafts.value };
      delete next[field.path];
      inputDrafts.value = next;
      setFieldValue(field, parsed, { coalesce: true });
    }

    function numberInputValue(field) {
      return Object.hasOwn(inputDrafts.value, field.path) ? inputDrafts.value[field.path] : (field.value ?? '');
    }

    function setNumberFieldValue(field, raw) {
      inputDrafts.value = { ...inputDrafts.value, [field.path]: raw };
      if (raw === '') {
        jsonErrors.value = { ...jsonErrors.value, [field.path]: 'Enter a number.' };
        return;
      }
      const value = Number(raw);
      if (!Number.isFinite(value) || (field.type === 'integer' && !Number.isInteger(value))) {
        jsonErrors.value = { ...jsonErrors.value, [field.path]: field.type === 'integer' ? 'Enter a whole number.' : 'Enter a valid number.' };
        return;
      }
      if (jsonErrors.value[field.path]) {
        const next = { ...jsonErrors.value };
        delete next[field.path];
        jsonErrors.value = next;
      }
      setFieldValue(field, value, { coalesce: true });
    }

    function addWarningThreshold(field) {
      const value = Number.parseInt(warningThresholdInput.value, 10);
      if (!Number.isInteger(value) || value < 1) {
        jsonErrors.value = { ...jsonErrors.value, [field.path]: 'Warning thresholds must be positive whole numbers.' };
        return;
      }
      const values = [...new Set([...(field.value || []), value])].sort((a, b) => b - a);
      warningThresholdInput.value = '';
      setFieldValue(field, values);
    }

    function removeWarningThreshold(field, value) {
      setFieldValue(field, (field.value || []).filter(item => item !== value));
    }

    function isScalarArray(field) {
      return field.type === 'array' && Array.isArray(field.value)
        && !STRUCTURED_CONTAINER_PATHS.has(field.path)
        && field.sensitivity === 'public'
        && field.value.every(item => ['string', 'number', 'boolean'].includes(typeof item));
    }

    function addScalarArrayItem(field) {
      const raw = String(arrayInputs.value[field.path] ?? '').trim();
      if (!raw) return;
      const values = [...new Set([...(field.value || []), raw])];
      arrayInputs.value = { ...arrayInputs.value, [field.path]: '' };
      setFieldValue(field, values);
    }

    function removeScalarArrayItem(field, value) {
      setFieldValue(field, (field.value || []).filter(item => item !== value));
    }



    function validateValue(field, value) {
      if (!field) return null;
      if (field.enum?.length && !field.enum.includes(value)) return `Choose one of: ${field.enum.join(', ')}`;
      if (field.path === 'agents.final_warning_iterations' && (!Array.isArray(value) || !value.length)) return 'Add at least one warning threshold.';
      const constraints = field.constraints || {};
      if ((field.type === 'integer' || field.type === 'number') && typeof value === 'number') {
        if (constraints.minimum !== undefined && value < constraints.minimum) return `Must be at least ${constraints.minimum}${field.unit ? ` ${field.unit}` : ''}`;
        if (constraints.maximum !== undefined && value > constraints.maximum) return `Must be at most ${constraints.maximum}${field.unit ? ` ${field.unit}` : ''}`;
      }
      return null;
    }

    function fieldError(field) {
      return draftErrors.value[field.path] || null;
    }

    function sectionHasErrors(section) {
      const prefix = `${section}.`;
      return Object.keys(draftErrors.value).some(path => path === section || path.startsWith(prefix));
    }

    function undo() {
      if (!undoStack.value.length) return;
      redoStack.value.push(deepClone(drafts.value));
      drafts.value = undoStack.value.pop();
      jsonErrors.value = {};
      inputDrafts.value = {};
      lastUndoEdit = { path: null, at: 0 };
    }

    function redo() {
      if (!redoStack.value.length) return;
      undoStack.value.push(deepClone(drafts.value));
      drafts.value = redoStack.value.pop();
      jsonErrors.value = {};
      inputDrafts.value = {};
      lastUndoEdit = { path: null, at: 0 };
    }

    function openReview() {
      if (!hasChanges.value || hasDraftErrors.value) return;
      reviewOpen.value = true;
      mobileOverflowOpen.value = false;
    }

    function closeReview() {
      reviewOpen.value = false;
    }

    function mobileCancel() { discardAllDrafts(); }

    function applyModeLabel(mode) {
      return APPLY_MODE_LABELS[mode] || titleCase(mode || 'unknown');
    }

    function applyClass(mode) {
      return `apply-${String(mode || 'unknown').replaceAll('_', '-')}`;
    }

    function fieldId(path) {
      return `cfgc-field-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    }

    function fieldInputId(path) {
      return `${fieldId(path)}-input`;
    }

    function focusField(path) {
      const element = document.getElementById(fieldId(path))
        || document.getElementById(fieldId(path.split('.').slice(0, 2).join('.')));
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function showToast(type, message) {
      toast.value = { type, message };
      window.setTimeout(() => {
        if (toast.value?.message === message) toast.value = null;
      }, 3500);
    }

    function reviewPendingRestart() {
      restartPromptOpen.value = false;
      healthFilter.value = 'pending_restart';
      searchQuery.value = '';
      window.scrollTo?.({ top: 0, behavior: 'smooth' });
    }

    function restartLater() {
      restartPromptOpen.value = false;
    }

    function scheduleRestartPoll(delay = 1800) {
      if (restartPollTimer) window.clearTimeout(restartPollTimer);
      restartPollTimer = window.setTimeout(pollRestartStatus, delay);
    }

    async function pollRestartStatus() {
      if (!restartScheduled.value) return;
      restartPollAttempts += 1;
      if (restartPollAttempts > 45) {
        restartScheduled.value = false;
        restartError.value = 'Odin did not return with the new startup settings within 90 seconds.';
        return;
      }
      try {
        meta.value = await loadConfigMeta();
        if (pendingRestartCount.value === 0) {
          restartScheduled.value = false;
          restartError.value = null;
          showToast('success', 'Odin restarted and the saved startup settings are active.');
          return;
        }
      } catch { /* expected while Odin is restarting */ }
      scheduleRestartPoll(2000);
    }

    async function restartOdin() {
      if (restartScheduled.value) return;
      restartError.value = null;
      try {
        await api.post('/api/restart', {});
        restartScheduled.value = true;
        restartPollAttempts = 0;
        restartPromptOpen.value = false;
        scheduleRestartPoll();
      } catch (restartFailure) {
        restartError.value = restartFailure.message || 'Odin could not schedule a restart.';
      }
    }

    async function saveConfig() {
      if (!hasChanges.value || hasDraftErrors.value || saving.value) return;
      saving.value = true;
      try {
        const patch = buildSectionPatch(config.value, drafts.value);
        const result = await api.put('/api/config', patch);

        // Persistence has committed at this point. Clear the draft before the
        // independent metadata refresh so a transient GET failure cannot make
        // the operator retry an already-successful write.
        config.value = result;
        drafts.value = {};
              undoStack.value = [];
        redoStack.value = [];
        jsonErrors.value = {};
        reviewOpen.value = false;

        try {
          meta.value = await loadConfigMeta();
          metaRefreshError.value = null;
          restartPromptOpen.value = pendingRestartCount.value > 0;
          showToast('success', pendingRestartCount.value
            ? `Configuration saved. ${pendingRestartCount.value} setting${pendingRestartCount.value === 1 ? '' : 's'} still use startup values.`
            : 'Configuration saved. Apply status has been refreshed.');
        } catch (metaError) {
          metaRefreshError.value = metaError.message || 'Unknown metadata error.';
          showToast('error', `Configuration saved, but apply status could not be refreshed: ${metaRefreshError.value}`);
        }
      } catch (saveError) {
        showToast('error', saveError.message || 'Configuration could not be saved');
      } finally {
        saving.value = false;
      }
    }

    async function fetchConfig() {
      if (hasChanges.value) return;
      loading.value = true;
      error.value = null;
      try {
        const nextConfig = await api.get('/api/config');
        const nextMeta = await loadConfigMeta();
        config.value = nextConfig;
        meta.value = nextMeta;
        metaRefreshError.value = null;
        const available = visibleCategories.value;
        if (!available.some(group => group.key === activeCategory.value)) {
          activeCategory.value = available[0]?.key || CATEGORY_GROUPS[0].key;
        }
        if (isMobile.value) {
          const sections = available.find(group => group.key === activeCategory.value)?.sections || [];
          const remembered = sections.find(section => expandedSections.value[section] === true);
          expandedSections.value = remembered ? { ...expandedSections.value, [remembered]: true } : {};
        }
      } catch (fetchError) {
        error.value = fetchError.message || 'Unknown configuration error';
      } finally {
        loading.value = false;
      }
    }

    function handleKeydown(event) {
      if (reviewOpen.value) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return;
      if (!event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      } else if (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z')) {
        event.preventDefault();
        redo();
      }
    }

    function updateMobileState(event) {
      isMobile.value = event.matches;
    }

    watch(expandedSections, value => {
      try { localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
    }, { deep: true });

    onMounted(() => {
      fetchConfig();
      document.addEventListener('keydown', handleKeydown);
      mobileMedia = window.matchMedia('(max-width: 760px)');
      updateMobileState(mobileMedia);
      mobileMedia.addEventListener?.('change', updateMobileState);
    });

    onUnmounted(() => {
      document.removeEventListener('keydown', handleKeydown);
      mobileMedia?.removeEventListener?.('change', updateMobileState);
      if (restartPollTimer) window.clearTimeout(restartPollTimer);
    });

    return {
      config, meta, loading, saving, error, toast, metaRefreshError, restartPromptOpen, restartScheduled, restartError,
      searchQuery, healthFilter, activeCategory, reviewOpen, mobileOverflowOpen, warningThresholdInput, arrayInputs,
      healthFilters, visibleCategories, displayGroups, reviewGroups,
      sectionCount, fieldCount, hasChanges, changeCount, changedSectionCount,
      hasDraftErrors, canUndo, canRedo, globalFilterActive, reviewRestartCount, pendingRestartCount, pendingRestartFields,
      healthCount, categoryStats, selectCategory, selectHealthFilter, clearFilters,
      sectionLabel, sectionDescription, sectionFieldCount, sectionHealthCount,
      sectionApplySummary, sectionApplyDetails, sectionEntries, fieldGroups, sectionSearchHits,
      fieldRuntimeCopy, fieldSpecificRuntimeNote, hasHonestAction, runFieldAction,
      sectionChanged, fieldChanged, isSectionExpanded, toggleSection,
      discardAllDrafts,
      setFieldValue, setNumberFieldValue, numberInputValue, beginInputEdit, endTextInputEdit, endInputEdit,
      addWarningThreshold, removeWarningThreshold, isScalarArray, addScalarArrayItem, removeScalarArrayItem, fieldError, sectionHasErrors,
      undo, redo, openReview, closeReview, mobileCancel,
      applyModeLabel, applyClass, compactValue, formatValue, fieldId, fieldInputId, focusField,
      fetchConfig, saveConfig, restartOdin, restartLater, reviewPendingRestart,
    };
  },
};
