import { build } from 'esbuild';
import { mkdirSync } from 'fs';

mkdirSync('build', { recursive: true });

await build({
  entryPoints: ['server.js'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'build/server.cjs',
  external: ['vite', 'bufferutil', 'utf-8-validate'],
  define: {
    'import.meta.url': 'importMetaUrl',
  },
  banner: {
    js: "const importMetaUrl = require('url').pathToFileURL(__filename).href;",
  },
  logLevel: 'info',
});

console.log('Server bundle created: build/server.cjs');
