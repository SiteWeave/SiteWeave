/**
 * Robust CSV parse + flat vs sectioned contact-list detection.
 * Neutral output only — no SiteWeave contact semantics.
 */

/**
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsvText(text) {
  const raw = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\r') {
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/**
 * @param {string} value
 */
function normalizeHeaderKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * @param {string[]} cells
 */
function nonEmptyCells(cells) {
  return (cells || []).map((c) => String(c ?? '').trim()).filter(Boolean);
}

/**
 * @param {string[]} cells
 */
function looksLikeHeaderRow(cells) {
  const keys = nonEmptyCells(cells).map(normalizeHeaderKey);
  if (keys.length < 2) return false;
  const set = new Set(keys);
  const hasName = set.has('name') || set.has('contact') || set.has('full_name') || set.has('contact_name');
  const hasCompanyish = set.has('company') || set.has('trade') || set.has('vendor') || set.has('business');
  const hasContactInfo = set.has('email') || set.has('phone') || set.has('phone_number') || set.has('mobile');
  return (hasName && (hasCompanyish || hasContactInfo)) || (hasCompanyish && hasContactInfo && keys.includes('trade') && keys.includes('contact'));
}

/**
 * @param {string[]} cells
 */
function looksLikeSectionTitle(cells) {
  const filled = nonEmptyCells(cells);
  if (filled.length !== 1) return false;
  const value = filled[0];
  if (looksLikeHeaderRow(cells)) return false;
  const lower = value.toLowerCase();
  if (lower.includes('contact list') || lower === 'contacts' || lower.startsWith('subcontractor')) {
    return false;
  }
  return true;
}

/**
 * @param {string[][]} matrix
 */
function detectLayout(matrix) {
  let headerLikeCount = 0;
  let sectionBeforeHeader = false;

  for (let i = 0; i < matrix.length; i += 1) {
    const cells = matrix[i];
    if (looksLikeHeaderRow(cells)) {
      headerLikeCount += 1;
      if (i > 0 && looksLikeSectionTitle(matrix[i - 1])) {
        sectionBeforeHeader = true;
      }
    }
  }

  if (headerLikeCount >= 2 || (headerLikeCount >= 1 && sectionBeforeHeader)) {
    return 'sectioned';
  }
  return 'flat';
}

/**
 * @param {string[]} headerCells
 * @returns {{ keys: string[], labels: string[], columnIndexes: number[] }}
 */
function buildHeaderMeta(headerCells) {
  const used = new Map();
  const keys = [];
  const labels = [];
  const columnIndexes = [];

  (headerCells || []).forEach((raw, index) => {
    const label = String(raw ?? '').trim();
    if (!label) return;
    let key = normalizeHeaderKey(label) || `col_${index + 1}`;
    const count = (used.get(key) || 0) + 1;
    used.set(key, count);
    if (count > 1) key = `${key}_${count}`;
    keys.push(key);
    labels.push(label);
    columnIndexes.push(index);
  });

  return { keys, labels, columnIndexes };
}

/**
 * @param {Record<string, string>} fields
 * @param {string[]} keys
 * @param {Map<string, string[]>} samplesByKey
 */
function collectSamples(fields, keys, samplesByKey) {
  for (const key of keys) {
    const value = fields[key];
    if (!value) continue;
    const list = samplesByKey.get(key) || [];
    if (list.length >= 3) continue;
    if (!list.includes(value)) {
      list.push(value);
      samplesByKey.set(key, list);
    }
  }
}

/**
 * Parse a contacts CSV into neutral rows + discovered source fields.
 * @param {string} text
 * @param {{ forceLayout?: 'flat'|'sectioned'|null }} [options]
 * @returns {{
 *   error?: string,
 *   layout?: 'flat'|'sectioned',
 *   headers?: string[],
 *   rows?: Array<{ fields: Record<string, string>, sectionTrade?: string|null, sourceRowIndex: number }>,
 *   discoveredFields?: Array<{ key: string, label: string, samples: string[] }>,
 * }}
 */
export function parseContactsCsv(text, options = {}) {
  try {
    const matrix = parseCsvText(text);
    if (!matrix.length) {
      return { error: 'contacts_import.empty_file' };
    }

    const layout = options.forceLayout === 'flat' || options.forceLayout === 'sectioned'
      ? options.forceLayout
      : detectLayout(matrix);
    /** @type {Array<{ fields: Record<string, string>, sectionTrade?: string|null, sourceRowIndex: number }>} */
    const rows = [];
    const samplesByKey = new Map();
    /** @type {Map<string, string>} */
    const labelByKey = new Map();

    if (layout === 'flat') {
      let headerIndex = matrix.findIndex((cells) => nonEmptyCells(cells).length > 0);
      if (headerIndex < 0) return { error: 'contacts_import.empty_file' };

      // Prefer an explicit header-like row when present
      const headerLikeIndex = matrix.findIndex((cells) => looksLikeHeaderRow(cells));
      if (headerLikeIndex >= 0) headerIndex = headerLikeIndex;

      const { keys, labels, columnIndexes } = buildHeaderMeta(matrix[headerIndex]);
      keys.forEach((key, i) => labelByKey.set(key, labels[i] || key));

      for (let i = headerIndex + 1; i < matrix.length; i += 1) {
        const cells = matrix[i];
        if (nonEmptyCells(cells).length === 0) continue;
        if (looksLikeHeaderRow(cells) || looksLikeSectionTitle(cells)) continue;

        /** @type {Record<string, string>} */
        const fields = {};
        keys.forEach((key, idx) => {
          const col = columnIndexes[idx];
          const value = String(cells[col] ?? '').trim();
          if (value) fields[key] = value;
        });
        if (Object.keys(fields).length === 0) continue;
        collectSamples(fields, keys, samplesByKey);
        rows.push({ fields, sectionTrade: null, sourceRowIndex: i });
      }

      const discoveredFields = keys.map((key) => ({
        key,
        label: labelByKey.get(key) || key,
        samples: samplesByKey.get(key) || [],
      }));

      return {
        layout,
        headers: keys,
        rows,
        discoveredFields,
      };
    }

    // Sectioned: category title rows + repeating Trade/Contact/Phone/Email headers
    let currentSection = null;
    let currentKeys = [];
    let currentLabels = [];
    let currentColumnIndexes = [];

    for (let i = 0; i < matrix.length; i += 1) {
      const cells = matrix[i];
      const filled = nonEmptyCells(cells);
      if (filled.length === 0) continue;

      if (looksLikeHeaderRow(cells)) {
        const meta = buildHeaderMeta(cells);
        currentKeys = meta.keys;
        currentLabels = meta.labels;
        currentColumnIndexes = meta.columnIndexes;
        currentKeys.forEach((key, idx) => {
          if (!labelByKey.has(key)) labelByKey.set(key, currentLabels[idx] || key);
        });
        continue;
      }

      if (looksLikeSectionTitle(cells)) {
        currentSection = filled[0];
        continue;
      }

      // Title / banner rows with no active header yet
      if (!currentKeys.length) continue;

      /** @type {Record<string, string>} */
      const fields = {};
      const usedCols = new Set();
      currentKeys.forEach((key, idx) => {
        const col = currentColumnIndexes[idx];
        usedCols.add(col);
        const value = String(cells[col] ?? '').trim();
        if (value) fields[key] = value;
      });

      // Capture unlabeled trailing columns as role/notes
      const extraParts = [];
      for (let col = 0; col < cells.length; col += 1) {
        if (usedCols.has(col)) continue;
        const value = String(cells[col] ?? '').trim();
        if (value) extraParts.push(value);
      }
      if (extraParts.length && !fields.role) {
        fields.role = extraParts.join(' · ');
        if (!labelByKey.has('role')) labelByKey.set('role', 'Role');
      }

      if (currentSection) {
        fields['meta:section'] = currentSection;
        if (!labelByKey.has('meta:section')) labelByKey.set('meta:section', 'Section / Trade');
      }

      if (Object.keys(fields).length === 0) continue;
      collectSamples(fields, Object.keys(fields), samplesByKey);
      rows.push({
        fields,
        sectionTrade: currentSection,
        sourceRowIndex: i,
      });
    }

    const discoveredKeys = [...labelByKey.keys()];
    // Prefer stable order: section, then common columns
    const preferred = ['meta:section', 'trade', 'contact', 'company', 'name', 'phone', 'email', 'role'];
    discoveredKeys.sort((a, b) => {
      const ia = preferred.indexOf(a);
      const ib = preferred.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    const discoveredFields = discoveredKeys.map((key) => ({
      key,
      label: labelByKey.get(key) || key,
      samples: samplesByKey.get(key) || [],
    }));

    return {
      layout,
      headers: discoveredKeys,
      rows,
      discoveredFields,
    };
  } catch (err) {
    return { error: err?.message || 'contacts_import.parse_error' };
  }
}
