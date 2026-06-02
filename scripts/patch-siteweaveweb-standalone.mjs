import fs from 'fs';
import path from 'path';

const root = process.argv[2] || '_sw_web';
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (pkg.dependencies?.['@siteweave/core-logic']) {
  pkg.dependencies['@siteweave/core-logic'] = 'file:./packages/core-logic';
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}
const vitePath = path.join(root, 'vite.config.ts');
if (fs.existsSync(vitePath)) {
  let v = fs.readFileSync(vitePath, 'utf8');
  v = v.replaceAll(
    "path.resolve(__dirname, '../../packages/core-logic/src/index.js')",
    "path.resolve(__dirname, 'packages/core-logic/src/index.js')"
  );
  fs.writeFileSync(vitePath, v);
}
