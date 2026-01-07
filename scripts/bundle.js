import * as esbuild from 'esbuild';

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
    'import.meta.url': '__import_meta_url'
  }
});

console.log('Bundle created: dist/bundle.cjs');
