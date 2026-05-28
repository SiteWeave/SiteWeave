#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const enPath = path.join(root, 'packages/i18n/locales/en.json');
const esPath = path.join(root, 'packages/i18n/locales/es.json');

function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj || {})) {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, pathKey));
    } else {
      keys.push(pathKey);
    }
  }
  return keys;
}

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const es = JSON.parse(fs.readFileSync(esPath, 'utf8'));
const enKeys = new Set(flattenKeys(en));
const esKeys = new Set(flattenKeys(es));

const missingInEs = [...enKeys].filter((k) => !esKeys.has(k)).sort();
const missingInEn = [...esKeys].filter((k) => !enKeys.has(k)).sort();

if (missingInEs.length || missingInEn.length) {
  console.error('i18n key mismatch between en.json and es.json');
  if (missingInEs.length) {
    console.error(`\nMissing in es (${missingInEs.length}):`);
    missingInEs.forEach((k) => console.error(`  - ${k}`));
  }
  if (missingInEn.length) {
    console.error(`\nMissing in en (${missingInEn.length}):`);
    missingInEn.forEach((k) => console.error(`  - ${k}`));
  }
  process.exit(1);
}

console.log(`i18n OK: ${enKeys.size} keys in en and es`);
