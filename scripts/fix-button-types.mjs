import fs from 'fs';
import path from 'path';

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(fullPath, files);
    else if (/\.(jsx?|tsx?)$/.test(ent.name)) files.push(fullPath);
  }
  return files;
}

function fix(content) {
  return content.replace(/<button(?![^>]*\btype=)/gi, '<button type="button"');
}

const roots = [
  path.resolve('apps/web/src'),
  path.resolve('src'),
];

let changedFiles = 0;
let buttonsFixed = 0;

for (const root of roots) {
  for (const file of walk(root)) {
    const before = fs.readFileSync(file, 'utf8');
    const matches = before.match(/<button(?![^>]*\btype=)/gi) || [];
    if (matches.length === 0) continue;
    const after = fix(before);
    fs.writeFileSync(file, after);
    changedFiles += 1;
    buttonsFixed += matches.length;
  }
}

console.log(`Files changed: ${changedFiles}, buttons fixed: ${buttonsFixed}`);
