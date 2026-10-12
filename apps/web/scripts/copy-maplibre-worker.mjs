import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('maplibre-gl/package.json'));
const sourceDirectory = join(packageRoot, 'dist');
const publicDirectory = join(process.cwd(), 'public', 'maplibre');

mkdirSync(publicDirectory, { recursive: true });
for (const filename of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(join(sourceDirectory, filename), join(publicDirectory, filename));
}
