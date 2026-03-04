#!/usr/bin/env node
/**
 * Cross-platform script to prepare the Next.js standalone output for packaging.
 *
 * Replaces the shell commands in package:prepare with Node.js equivalents
 * so this works on macOS, Linux, and Windows CI runners.
 *
 * Steps:
 * 1. Copy public/ into .next/standalone/
 * 2. Copy scripts/launcher.js into .next/standalone/
 * 3. Copy .next/static/ into .next/standalone/.next/static/
 * 4. Remove process.chdir(__dirname) from server.js
 * 5. Patch server.js with inspector shim for pkg compatibility
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const standaloneDir = path.join(rootDir, '.next', 'standalone');
const serverJs = path.join(standaloneDir, 'server.js');

// --- Helper: recursive copy ---
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Step 1: Copy public/ -> .next/standalone/public/
console.log('Copying public/ to standalone...');
copyDirSync(path.join(rootDir, 'public'), path.join(standaloneDir, 'public'));

// Step 2: Copy launcher.js -> .next/standalone/
console.log('Copying launcher.js...');
fs.copyFileSync(
  path.join(rootDir, 'scripts', 'launcher.js'),
  path.join(standaloneDir, 'launcher.js')
);

// Step 3: Copy .next/static/ -> .next/standalone/.next/static/
console.log('Copying .next/static/ to standalone...');
copyDirSync(
  path.join(rootDir, '.next', 'static'),
  path.join(standaloneDir, '.next', 'static')
);

// Step 4: Remove process.chdir(__dirname) from server.js
console.log('Patching server.js (removing process.chdir)...');
let content = fs.readFileSync(serverJs, 'utf8');
content = content.replace('process.chdir(__dirname)', '');

// Step 5: Prepend inspector shim for pkg compatibility
// pkg does not support node:inspector (ERR_INSPECTOR_NOT_AVAILABLE).
// Next.js 16 unconditionally requires it in app-info-log.js.
console.log('Patching server.js (inspector shim for pkg)...');
const shim = `\
// --- pkg compatibility shim ---
// Intercept require("inspector") / require("node:inspector") for pkg builds
// where the inspector module is not available.
const _originalRequire = require;
const _Module = _originalRequire('module');
const _origResolve = _Module._resolveFilename;
_Module._resolveFilename = function(request, ...args) {
  if (request === 'inspector' || request === 'node:inspector') {
    return '__pkg_inspector_shim__';
  }
  return _origResolve.call(this, request, ...args);
};
const _shimModule = new _Module('__pkg_inspector_shim__');
_shimModule.loaded = true;
_shimModule.exports = { url: () => undefined, open: () => {}, close: () => {}, Session: class {} };
_Module._cache['__pkg_inspector_shim__'] = _shimModule;
// --- end shim ---

`;

content = shim + content;
fs.writeFileSync(serverJs, content);

console.log('Standalone preparation complete.');
