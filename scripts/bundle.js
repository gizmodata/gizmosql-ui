import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

// Read version from package.json
const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
const version = packageJson.version;

await esbuild.build({
  entryPoints: ['dist/backend/src/index.js'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/bundle.cjs',
  format: 'cjs',
  banner: {
    js: 'var __import_meta_url = "file://" + __filename;'
  },
  define: {
    'import.meta.url': '__import_meta_url',
    '__APP_VERSION__': JSON.stringify(version)
  }
});

console.log('Bundle created: dist/bundle.cjs');
