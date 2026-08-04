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
  { key: 'core', label: 'Core', icon: 'sliders', sections: ['timezone', 'discord', 'logging', 'permissions', 'graceful_degradation'] },
  { key: 'models', label: 'Models & AI', icon: 'brain', sections: ['llm_provider', 'openai_codex', 'ollama', 'kimi', 'image', 'llm_recovery'] },
  { key: 'runtime', label: 'Runtime', icon: 'activity', sections: ['personality', 'context', 'sessions', 'agents', 'turn_state'] },
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
  activation_required: 'Activation required',
  legacy_control: 'Legacy control',
  dormant: 'Not wired',
};

const OWNER_LINKS = {
  llm: {
    label: 'LLM Config',
    href: '#/system?tab=llm',
    description: 'This section has one canonical editor so provider changes use the safe switch and reload paths.',
  },
  personality: {
    label: 'Personality',
    href: '#/personality',
    description: 'Personality presets and the active profile are managed on the dedicated Personality page.',
  },
  discord: {
    label: 'Discord overrides',
    href: '#/system?tab=discord',
    description: 'Guild and channel overrides take precedence over these global defaults.',
  },
  secrets: {
    label: 'Secret controls',
    href: '#/system?tab=config',
    description: 'Secret values are write-only and use dedicated set and clear flows.',
  },
};

const EXPANDED_STORAGE_KEY = 'odin_config_center_expanded_v1';
const CATEGORY_STORAGE_KEY = 'odin_config_center_category_v1';
const MAX_UNDO = 50;

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
            <span v-else class="cfgc-health-ok"><odin-icon name="success" :size="13" /> Drafts clear</span>
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
              <span><b class="dormant">D</b> Activation</span>
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
                       :class="['cfgc-section', { modified: sectionChanged(section), editing: editingSection === section }]">
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
                    <span v-if="sectionHealthCount(section, 'dormant')" class="badge cfgc-badge-dormant">activation</span>
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

                  <div v-if="sectionOwner(section)" class="cfgc-owner-card">
                    <span class="cfgc-owner-icon"><odin-icon :name="sectionOwner(section) === 'personality' ? 'personality' : 'external'" :size="18" /></span>
                    <div>
                      <strong>Managed in {{ ownerInfo(sectionOwner(section)).label }}</strong>
                      <p>{{ ownerInfo(sectionOwner(section)).description }}</p>
                    </div>
                    <a :href="ownerInfo(sectionOwner(section)).href" class="btn btn-ghost text-xs">
                      Open {{ ownerInfo(sectionOwner(section)).label }} <odin-icon name="external" :size="13" />
                    </a>
                  </div>

                  <div v-if="sectionOwner(section) && sectionApplyDetails(section).length" class="cfgc-section-apply-details" aria-label="Section apply behavior details">
                    <div v-for="detail in sectionApplyDetails(section)" :key="detail.key" :class="['cfgc-apply-detail', 'detail-' + detail.kind]">
                      <div class="cfgc-apply-detail-heading">
                        <strong>{{ detail.label }}</strong>
                        <span v-if="detail.apply_mode" :class="['cfgc-apply-pill', applyClass(detail.apply_mode)]">{{ applyModeLabel(detail.apply_mode) }}</span>
                      </div>
                      <code v-if="detail.code">{{ detail.code }}</code>
                      <p v-if="detail.text">{{ detail.text }}</p>
                    </div>
                  </div>

                  <div v-if="section === 'discord'" class="cfgc-owner-card compact">
                    <span class="cfgc-owner-icon"><odin-icon name="message" :size="18" /></span>
                    <div>
                      <strong>Global Discord defaults</strong>
                      <p>Guild and channel overrides take precedence. These values apply only where no narrower override exists.</p>
                    </div>
                    <a href="#/system?tab=discord" class="btn btn-ghost text-xs">Open overrides <odin-icon name="external" :size="13" /></a>
                  </div>

                  <div class="cfgc-section-actions" v-if="!sectionOwner(section)">
                    <div>
                      <strong>{{ editingSection === section ? 'Section draft open' : (sectionChanged(section) ? 'Draft ready for review' : 'No local draft') }}</strong>
                      <span v-if="sectionApplySummary(section)">{{ sectionApplySummary(section) }}</span>
                    </div>
                    <div class="flex gap-2">
                      <template v-if="editingSection === section">
                        <button type="button" class="btn btn-ghost text-xs" @click="cancelSectionDraft(section)">Cancel</button>
                        <button type="button" class="btn btn-primary text-xs" @click="finishSectionDraft(section)" :disabled="sectionHasErrors(section)">Done</button>
                      </template>
                      <button v-else type="button" class="btn btn-ghost text-xs" @click="startSectionDraft(section)">
                        <odin-icon name="edit" :size="13" /> {{ sectionChanged(section) ? 'Continue editing' : 'Edit section' }}
                      </button>
                    </div>
                  </div>

                  <div v-if="!sectionOwner(section)" class="cfgc-fields">
                    <div v-for="field in sectionEntries(section)" :key="field.path" :id="fieldId(field.path)"
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
                        <div v-if="field.apply_details?.length" class="cfgc-apply-details" aria-label="Apply behavior details">
                          <div v-for="detail in field.apply_details" :key="detail.key" :class="['cfgc-apply-detail', 'detail-' + detail.kind]">
                            <div class="cfgc-apply-detail-heading">
                              <strong>{{ detail.label }}</strong>
                              <span v-if="detail.apply_mode" :class="['cfgc-apply-pill', applyClass(detail.apply_mode)]">{{ applyModeLabel(detail.apply_mode) }}</span>
                            </div>
                            <code v-if="detail.code">{{ detail.code }}</code>
                            <p v-if="detail.text">{{ detail.text }}</p>
                          </div>
                        </div>
                      </div>

                      <div class="cfgc-field-control">
                        <template v-if="field.sensitivity !== 'public'">
                          <div class="cfgc-write-only">
                            <span><odin-icon name="shield" :size="15" /> {{ field.configured ? 'Configured' : 'Not configured' }}</span>
                            <small>{{ field.provenance === 'unset' ? 'No credential source' : 'Source: ' + field.provenance.replace('_', ' ') }}</small>
                            <button type="button" class="btn btn-ghost text-xs" disabled title="Dedicated secret flows arrive in lane X1">Manage secret</button>
                          </div>
                        </template>

                        <template v-else-if="editingSection === section">
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

                          <input v-else-if="typeof field.value === 'number'" :id="fieldInputId(field.path)" class="hm-input font-mono"
                                 type="number" :min="field.constraints?.minimum" :max="field.constraints?.maximum"
                                 :value="field.value" @input="setFieldValue(field, Number($event.target.value))" />

                          <textarea v-else-if="typeof field.value === 'object' && field.value !== null"
                                    :id="fieldInputId(field.path)" class="hm-input cfgc-json-input font-mono" rows="6"
                                    :value="formatValue(field.value)" @change="setJsonFieldValue(field, $event.target.value)"></textarea>

                          <input v-else :id="fieldInputId(field.path)" class="hm-input font-mono" type="text"
                                 :value="field.value ?? ''" @input="setFieldValue(field, $event.target.value)" />
                          <p v-if="fieldError(field)" class="cfgc-field-error" role="alert">{{ fieldError(field) }}</p>
                          <p v-else-if="typeof field.value === 'object' && field.value !== null" class="cfgc-expert-note">Temporary expert JSON editor; typed controls replace this in U2.</p>
                        </template>

                        <template v-else>
                          <pre v-if="typeof field.value === 'object' && field.value !== null" class="cfgc-value-block">{{ formatValue(field.value) }}</pre>
                          <span v-else class="cfgc-value">{{ compactValue(field.value) }}</span>
                        </template>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            </section>
          </main>
        </div>

        <div v-if="hasChanges || editingSection" class="cfgc-mobile-action-bar" aria-label="Draft actions">
          <button type="button" class="btn btn-ghost" @click="mobileCancel">Cancel</button>
          <button type="button" class="btn btn-ghost" @click="openReview" :disabled="!hasChanges || hasDraftErrors">Review</button>
          <button type="button" class="btn btn-primary" @click="openReview" :disabled="!hasChanges || hasDraftErrors">Save</button>
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
                <strong>No runtime mutation occurs until this commit.</strong>
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
    const searchQuery = ref('');
    const healthFilter = ref('all');
    const activeCategory = ref(loadCategoryState());
    const expandedSections = ref(loadExpandedState());
    const drafts = ref({});
    const editingSection = ref(null);
    const editingBaseline = ref(undefined);
    const editingHadDraft = ref(false);
    const jsonErrors = ref({});
    const undoStack = ref([]);
    const redoStack = ref([]);
    const reviewOpen = ref(false);
    const mobileOverflowOpen = ref(false);
    const isMobile = ref(false);
    let mobileMedia = null;

    const fields = computed(() => meta.value?.fields || []);
    const fieldsByPath = computed(() => new Map(fields.value.map(field => [field.path, field])));
    const sectionCount = computed(() => config.value ? Object.keys(config.value).length : 0);
    const fieldCount = computed(() => fields.value.length);
    const healthFilters = computed(() => HEALTH_FILTERS);
    const canUndo = computed(() => undoStack.value.length > 0);
    const canRedo = computed(() => redoStack.value.length > 0);

    const visibleCategories = computed(() => {
      if (!config.value) return [];
      const grouped = new Set(CATEGORY_GROUPS.flatMap(group => group.sections));
      const result = CATEGORY_GROUPS.map(group => ({
        ...group,
        sections: group.sections.filter(section => Object.hasOwn(config.value, section)),
      })).filter(group => group.sections.length);
      const ungrouped = Object.keys(config.value).filter(section => !grouped.has(section));
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

    function metadataForPath(path) {
      if (fieldsByPath.value.has(path)) {
        const field = fieldsByPath.value.get(path);
        return { ...field, apply_details: collectApplyDetails([field]) };
      }
      const prefix = `${path}.`;
      const descendants = fields.value.filter(field => field.path.startsWith(prefix));
      if (!descendants.length) return null;
      const sensitivity = descendants.some(field => field.sensitivity !== 'public') ? 'secret_container' : 'public';
      const modes = [...new Set(descendants.map(field => field.apply_mode))];
      return {
        path,
        label: titleCase(path.split('.').at(-1)),
        description: descendants[0].description,
        type: 'object',
        sensitivity,
        configured: descendants.some(field => field.configured),
        provenance: descendants.find(field => field.provenance !== 'unset')?.provenance || 'unset',
        apply_mode: modes.length === 1 ? modes[0] : sectionApplyMode(path.split('.')[0]),
        apply_details: collectApplyDetails(descendants),
        constraints: {},
        enum: null,
      };
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

    function sectionOwner(section) {
      const records = sectionFields(section);
      const owners = records.map(field => field.owner).filter(owner => owner && owner !== 'config' && owner !== 'secrets');
      if (!owners.length) return null;
      const counts = owners.reduce((acc, owner) => ({ ...acc, [owner]: (acc[owner] || 0) + 1 }), {});
      const [owner, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      return count >= Math.max(1, records.length - 1) && OWNER_LINKS[owner] ? owner : null;
    }

    function ownerInfo(owner) {
      return OWNER_LINKS[owner] || {
        label: titleCase(owner),
        href: '#/system?tab=config',
        description: 'This feature uses a dedicated configuration and activation panel.',
      };
    }

    function sectionValue(section) {
      return Object.hasOwn(drafts.value, section) ? drafts.value[section] : config.value?.[section];
    }

    function sectionEntries(section) {
      const value = sectionValue(section);
      const entries = value && typeof value === 'object' && !Array.isArray(value)
        ? Object.entries(value).map(([key, fieldValue]) => ({ key, path: `${section}.${key}`, value: fieldValue }))
        : [{ key: null, path: section, value }];
      return entries.map(entry => {
        const field = metadataForPath(entry.path) || {};
        return {
          ...field,
          ...entry,
          label: field.label || (entry.key === null ? sectionLabel(section) : titleCase(entry.key)),
          description: field.description || `${titleCase(entry.key || section)} setting for ${titleCase(section)}.`,
          apply_mode: field.apply_mode || sectionApplyMode(section),
          sensitivity: field.sensitivity || 'public',
          constraints: field.constraints || {},
          configured: field.configured ?? true,
          provenance: field.provenance || 'config_file',
        };
      });
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
      return meta.value?.status?.counts?.[key]
        ?? fields.value.filter(field => field.apply_state === key).length;
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

    function isSectionExpanded(section) {
      if (expandedSections.value[section]) return true;
      return Boolean(searchQuery.value && !isMobile.value && sectionMatches(section));
    }

    function toggleSection(section) {
      const nextOpen = !isSectionExpanded(section);
      if (isMobile.value && nextOpen) {
        expandedSections.value = { [section]: true };
      } else {
        expandedSections.value = { ...expandedSections.value, [section]: nextOpen };
      }
    }

    function recordUndo() {
      undoStack.value.push(deepClone(drafts.value));
      if (undoStack.value.length > MAX_UNDO) undoStack.value.shift();
      redoStack.value = [];
    }

    function startSectionDraft(section) {
      if (editingSection.value === section) return;
      editingSection.value = section;
      editingHadDraft.value = Object.hasOwn(drafts.value, section);
      editingBaseline.value = editingHadDraft.value
        ? deepClone(drafts.value[section])
        : undefined;
      if (!editingHadDraft.value) {
        drafts.value = { ...drafts.value, [section]: deepClone(config.value[section]) };
      }
      expandedSections.value = isMobile.value ? { [section]: true } : { ...expandedSections.value, [section]: true };
    }

    function finishSectionDraft(section) {
      if (sectionHasErrors(section)) return;
      if (deepEqual(drafts.value[section], config.value[section])) {
        const next = { ...drafts.value };
        delete next[section];
        drafts.value = next;
      }
      editingSection.value = null;
      editingBaseline.value = undefined;
      editingHadDraft.value = false;
    }

    function cancelSectionDraft(section) {
      const next = { ...drafts.value };
      if (!editingHadDraft.value) delete next[section];
      else next[section] = deepClone(editingBaseline.value);
      drafts.value = next;
      editingSection.value = null;
      editingBaseline.value = undefined;
      editingHadDraft.value = false;
      const prefix = `${section}.`;
      jsonErrors.value = Object.fromEntries(Object.entries(jsonErrors.value).filter(([path]) => path !== section && !path.startsWith(prefix)));
    }

    function discardAllDrafts() {
      if (!hasChanges.value && !editingSection.value) return;
      recordUndo();
      drafts.value = {};
      editingSection.value = null;
      editingBaseline.value = undefined;
      editingHadDraft.value = false;
      jsonErrors.value = {};
      reviewOpen.value = false;
    }

    function setFieldValue(field, value) {
      const section = field.path.split('.')[0];
      if (editingSection.value !== section) return;
      recordUndo();
      const sectionDraft = deepClone(drafts.value[section]);
      if (field.key === null) {
        drafts.value = { ...drafts.value, [section]: value };
      } else {
        sectionDraft[field.key] = value;
        drafts.value = { ...drafts.value, [section]: sectionDraft };
      }
      if (jsonErrors.value[field.path]) {
        const next = { ...jsonErrors.value };
        delete next[field.path];
        jsonErrors.value = next;
      }
    }

    function setJsonFieldValue(field, raw) {
      try {
        const parsed = JSON.parse(raw);
        const next = { ...jsonErrors.value };
        delete next[field.path];
        jsonErrors.value = next;
        setFieldValue(field, parsed);
      } catch (parseError) {
        jsonErrors.value = { ...jsonErrors.value, [field.path]: `Invalid JSON: ${parseError.message}` };
      }
    }

    function validateValue(field, value) {
      if (!field) return null;
      if (field.enum?.length && !field.enum.includes(value)) return `Choose one of: ${field.enum.join(', ')}`;
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
    }

    function redo() {
      if (!redoStack.value.length) return;
      undoStack.value.push(deepClone(drafts.value));
      drafts.value = redoStack.value.pop();
      jsonErrors.value = {};
    }

    function openReview() {
      if (!hasChanges.value || hasDraftErrors.value) return;
      if (editingSection.value) finishSectionDraft(editingSection.value);
      reviewOpen.value = true;
      mobileOverflowOpen.value = false;
    }

    function closeReview() {
      reviewOpen.value = false;
    }

    function mobileCancel() {
      if (editingSection.value) cancelSectionDraft(editingSection.value);
      else discardAllDrafts();
    }

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
        editingSection.value = null;
        editingBaseline.value = undefined;
        editingHadDraft.value = false;
        undoStack.value = [];
        redoStack.value = [];
        jsonErrors.value = {};
        reviewOpen.value = false;

        try {
          meta.value = await loadConfigMeta();
          metaRefreshError.value = null;
          showToast('success', 'Configuration saved. Apply status has been refreshed.');
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
      if (event.matches) {
        const open = Object.keys(expandedSections.value).find(section => expandedSections.value[section]);
        expandedSections.value = open ? { [open]: true } : {};
      }
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
    });

    return {
      config, meta, loading, saving, error, toast, metaRefreshError,
      searchQuery, healthFilter, activeCategory, editingSection, reviewOpen, mobileOverflowOpen,
      healthFilters, visibleCategories, displayGroups, reviewGroups,
      sectionCount, fieldCount, hasChanges, changeCount, changedSectionCount,
      hasDraftErrors, canUndo, canRedo, globalFilterActive, reviewRestartCount,
      healthCount, categoryStats, selectCategory, selectHealthFilter, clearFilters,
      sectionLabel, sectionDescription, sectionFieldCount, sectionHealthCount,
      sectionApplySummary, sectionApplyDetails, sectionOwner, ownerInfo, sectionEntries, sectionSearchHits,
      sectionChanged, fieldChanged, isSectionExpanded, toggleSection,
      startSectionDraft, finishSectionDraft, cancelSectionDraft, discardAllDrafts,
      setFieldValue, setJsonFieldValue, fieldError, sectionHasErrors,
      undo, redo, openReview, closeReview, mobileCancel,
      applyModeLabel, applyClass, compactValue, formatValue, fieldId, fieldInputId, focusField,
      fetchConfig, saveConfig,
    };
  },
};
