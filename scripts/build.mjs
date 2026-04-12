import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.dirname(projectRoot);
const distDir = path.join(extensionRoot, 'dist');

await mkdir(distDir, { recursive: true });

await build({
  entryPoints: [path.join(extensionRoot, 'src', 'embed-runtime.tsx')],
  outfile: path.join(distDir, 'embed.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  loader: {
    '.svg': 'dataurl',
    '.png': 'dataurl',
    '.jpg': 'dataurl',
    '.jpeg': 'dataurl',
    '.webp': 'dataurl',
    '.gif': 'dataurl',
    '.woff2': 'dataurl',
    '.woff': 'dataurl',
    '.ttf': 'dataurl',
    '.json': 'json',
  },
});
