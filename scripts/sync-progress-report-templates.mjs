import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/utils/progressReportEmailTemplates.js'), 'utf8');

let s = src.replace(/import i18n from '\.\.\/i18n\/config';\s*/s, '');
s = s.replace(/i18n\.language \|\| 'en'/g, "'en-US'");
s = s.replace(/^export function generate/gm, 'function generate');
// Remove the backward-compat alias line (not needed in edge functions)
s = s.replace(/^export const generateClientReportEmail.*$/m, '');

const head = `// AUTO-GENERATED from src/utils/progressReportEmailTemplates.js — run: node scripts/sync-progress-report-templates.mjs
// deno-lint-ignore-file no-explicit-any

`;

const tail = `
export function buildProgressReportEmail(reportData, filteredData, schedule, branding) {
  const audience = schedule.report_audience_type || 'standard';
  if (audience === 'executive') return generateExecutiveReportEmail(filteredData, schedule, branding);
  // standard / client / internal all use the unified standard template
  return generateStandardReportEmail(filteredData, schedule, branding);
}
`;

const outDirs = [
  path.join(root, 'supabase/functions/_shared'),
  path.join(root, 'apps/web/supabase/functions/_shared'),
];
const contents = head + s + tail;
for (const outDir of outDirs) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'progressReportEmailTemplates.ts'), contents);
  console.log(`Wrote ${path.relative(root, path.join(outDir, 'progressReportEmailTemplates.ts'))}`);
}
