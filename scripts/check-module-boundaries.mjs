import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const roots = ['modules'];
const forbidden = /from\s+['"][^'"]*modules\/(core|tasks|scheduling|event|forms|flux)\/.*(?:repository|schema|table)/i;
let failed = false;
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(ts|tsx)$/.test(entry.name)) {
      const text = await readFile(path, 'utf8');
      if (forbidden.test(text)) { console.error(`Forbidden cross-module private import: ${path}`); failed = true; }
    }
  }
}
for (const root of roots) await walk(root);
if (failed) process.exit(1);
console.log('Module boundary check passed');
