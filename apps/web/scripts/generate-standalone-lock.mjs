/**
 * Builds a temp copy of the web app with file:./packages/* and runs npm install
 * so package-lock.standalone.json matches the SiteWeaveWeb mirror layout (npm ci safe).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '..', '..');
const tmp = fs.mkdtempSync(path.join(repoRoot, '.tmp-standalone-lock-'));

try {
  const dest = path.join(tmp, 'web');
  fs.mkdirSync(dest, { recursive: true });

  const exclude = new Set([
    'node_modules',
    'dist',
    'packages',
    'temp-web-cleanup',
    '.git',
    'package-lock.json',
    'package-lock.standalone.json',
  ]);

  function copyDir(src, dst) {
    for (const name of fs.readdirSync(src, { withFileTypes: true })) {
      if (exclude.has(name.name)) continue;
      const from = path.join(src, name.name);
      const to = path.join(dst, name.name);
      if (name.isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        copyDir(from, to);
      } else {
        fs.copyFileSync(from, to);
      }
    }
  }

  copyDir(webRoot, dest);

  function copyPackage(name) {
    const src = path.join(repoRoot, 'packages', name);
    const dst = path.join(dest, 'packages', name);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(src, dst, {
      recursive: true,
      filter: (srcPath) => !srcPath.split(path.sep).includes('node_modules'),
    });
  }

  copyPackage('core-logic');
  copyPackage('i18n');
  copyPackage('onboarding-ui');
  copyPackage('design-tokens');

  const pkgPath = path.join(dest, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.dependencies['@siteweave/core-logic'] = 'file:./packages/core-logic';
  pkg.dependencies['@siteweave/i18n'] = 'file:./packages/i18n';
  pkg.dependencies['@siteweave/onboarding-ui'] = 'file:./packages/onboarding-ui';
  pkg.dependencies['@siteweave/design-tokens'] = 'file:./packages/design-tokens';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  const vitePath = path.join(dest, 'vite.config.ts');
  let vite = fs.readFileSync(vitePath, 'utf8');
  vite = vite.replaceAll(
    "path.resolve(__dirname, '../../packages/core-logic/src/index.js')",
    "path.resolve(__dirname, 'packages/core-logic/src/index.js')",
  );
  vite = vite.replaceAll(
    "path.resolve(__dirname, '../../packages/i18n/index.js')",
    "path.resolve(__dirname, 'packages/i18n/index.js')",
  );
  vite = vite.replaceAll(
    "path.resolve(__dirname, '../../packages/onboarding-ui/src/index.js')",
    "path.resolve(__dirname, 'packages/onboarding-ui/src/index.js')",
  );
  vite = vite.replaceAll(
    "path.resolve(__dirname, '../../packages/design-tokens/src/index.js')",
    "path.resolve(__dirname, 'packages/design-tokens/src/index.js')",
  );
  vite = vite.replaceAll(
    "path.resolve(__dirname, '../../packages/design-tokens/src/mobile.js')",
    "path.resolve(__dirname, 'packages/design-tokens/src/mobile.js')",
  );
  fs.writeFileSync(vitePath, vite);

  execSync('npm install --no-audit --no-fund', { cwd: dest, stdio: 'inherit' });

  const out = path.join(webRoot, 'package-lock.standalone.json');
  fs.copyFileSync(path.join(dest, 'package-lock.json'), out);
  console.log('Wrote', out);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
