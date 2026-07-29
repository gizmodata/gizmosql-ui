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
// where the inspector module is not available. Must hook Module._load (not
// _resolveFilename): "node:"-prefixed builtin requests bypass resolution.
const _Module = require('module');
const _inspectorShim = {
  url: () => undefined,
  open: () => {},
  close: () => {},
  console,
  Session: class Session {
    connect() {}
    disconnect() {}
    post(_method, _params, cb) { if (typeof cb === 'function') cb(null, {}); }
    on() {}
  },
};
const _origLoad = _Module._load;
_Module._load = function(request, parent, isMain) {
  if (
    request === 'inspector' || request === 'node:inspector' ||
    request === 'inspector/promises' || request === 'node:inspector/promises'
  ) {
    return _inspectorShim;
  }
  return _origLoad.call(this, request, parent, isMain);
};
// --- end shim ---

`;

content = shim + content;
fs.writeFileSync(serverJs, content);

console.log('Standalone preparation complete.');

// Step 6: Assemble runtime-libs.tgz — the ADBC stack shipped as an
// OPAQUE tarball asset. pkg transforms any .js it can see in the
// snapshot (breaking the ESM driver manager) and native libraries
// cannot dlopen from a snapshot, so the launcher extracts this tarball
// to real disk at first run and redirects require() to it.
const { execSync } = require('child_process');
console.log('Assembling runtime-libs.tgz (clean npm closure of the ADBC client)...');
const stagingDir = path.join(standaloneDir, 'runtime-staging');
fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });
const clientVersion = require('@gizmodata/gizmosql-client/package.json').version;
execSync(
  `npm install --prefix "${stagingDir}" --omit=dev --no-audit --no-fund ` +
    `--no-package-lock @gizmodata/gizmosql-client@${clientVersion}`,
  { stdio: 'inherit' }
);
// Sanity: the postinstall must have downloaded the platform driver.
const clientDir = path.join(stagingDir, 'node_modules', '@gizmodata', 'gizmosql-client');
const driversDir = path.join(clientDir, 'drivers');
if (!fs.existsSync(driversDir) || fs.readdirSync(driversDir).length === 0) {
  throw new Error('runtime-libs: driver library was not downloaded during staging install');
}
// Pure-Node tar writer (platform tar is unreliable on Windows runners:
// -z cannot spawn gzip, and long node_modules paths break -cf). Mirrors
// the minimal reader in launcher.js: ustar headers, GNU 'L' entries for
// long names, dirs + files only.
const zlib = require('zlib');
function tarHeader(name, size, type) {
  const header = Buffer.alloc(512);
  header.write(name.slice(0, 100), 0);
  header.write('0000755\0', 100); // mode
  header.write('0000000\0', 108); // uid
  header.write('0000000\0', 116); // gid
  header.write(size.toString(8).padStart(11, '0') + '\0', 124);
  header.write('00000000000\0', 136); // mtime (zero: reproducible)
  header.write('        ', 148); // checksum placeholder
  header.write(type, 156);
  header.write('ustar\0', 257);
  header.write('00', 263);
  let sum = 0;
  for (const b of header) sum += b;
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return header;
}
function tarEntry(chunks, name, data, type) {
  if (name.length > 100) {
    const nameBuf = Buffer.from(name + '\0');
    chunks.push(tarHeader('././@LongLink', nameBuf.length, 'L'), nameBuf,
      Buffer.alloc((512 - (nameBuf.length % 512)) % 512));
  }
  chunks.push(tarHeader(name, type === '5' ? 0 : data.length, type));
  if (type !== '5' && data.length > 0) {
    chunks.push(data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
}
function tarTree(chunks, dir, rel) {
  tarEntry(chunks, rel + '/', Buffer.alloc(0), '5');
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, entry.name);
    const childRel = rel + '/' + entry.name;
    if (entry.isDirectory()) tarTree(chunks, abs, childRel);
    else if (entry.isFile()) tarEntry(chunks, childRel, fs.readFileSync(abs), '0');
  }
}
const chunks = [];
tarTree(chunks, path.join(stagingDir, 'node_modules'), 'node_modules');
chunks.push(Buffer.alloc(1024));
fs.writeFileSync(
  path.join(standaloneDir, 'runtime-libs.tgz'),
  zlib.gzipSync(Buffer.concat(chunks), { level: 6 })
);
fs.rmSync(stagingDir, { recursive: true, force: true });
console.log('runtime-libs.tgz ready');
