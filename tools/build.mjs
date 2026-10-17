import fs from 'node:fs/promises';
import path from 'node:path';
// Explicit allowlist: backend source, tests and audit artifacts are never published.
const output = 'dist';
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
for (const entry of ['index.html', 'diagnostic.html', 'icon.svg', 'manifest.webmanifest', 'sw.js', 'js', 'css', 'filters']) {
  await fs.cp(entry, path.join(output, entry), { recursive: true });
}
console.log('Site statique préparé dans dist ; backend et tests exclus.');
