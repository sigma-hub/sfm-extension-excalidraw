import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.dirname(projectRoot);
const distDir = path.join(extensionRoot, 'dist');
const generatedDir = path.join(extensionRoot, 'src', 'generated');
const generatedCssPath = path.join(generatedDir, 'excalidraw-css.js');
const excalidrawCssPath = path.join(
  extensionRoot,
  'node_modules',
  '@excalidraw',
  'excalidraw',
  'dist',
  'prod',
  'index.css',
);

const mimeTypes = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function quoteForCssUrl(value) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

async function inlineCssAssets(cssFilePath) {
  const cssDir = path.dirname(cssFilePath);
  let cssContent = await readFile(cssFilePath, 'utf8');

  const assetMatches = [...cssContent.matchAll(/url\(([^)]+)\)/g)];
  for (const assetMatch of assetMatches) {
    const rawReference = assetMatch[1].trim().replace(/^['"]|['"]$/g, '');
    if (
      rawReference.length === 0
      || rawReference.startsWith('data:')
      || rawReference.startsWith('http://')
      || rawReference.startsWith('https://')
      || rawReference.startsWith('#')
    ) {
      continue;
    }

    const assetPath = path.resolve(cssDir, rawReference);
    const assetBuffer = await readFile(assetPath);
    const assetExtension = path.extname(assetPath).toLowerCase();
    const mimeType = mimeTypes[assetExtension] ?? 'application/octet-stream';
    const dataUrl = `data:${mimeType};base64,${assetBuffer.toString('base64')}`;
    cssContent = cssContent.replace(assetMatch[0], `url(${quoteForCssUrl(dataUrl)})`);
  }

  return cssContent;
}

async function runBuild() {
  const excalidrawCss = await inlineCssAssets(excalidrawCssPath);

  await mkdir(generatedDir, { recursive: true });
  await writeFile(generatedCssPath, `export default ${JSON.stringify(excalidrawCss)};\n`);

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
}

await runBuild();
