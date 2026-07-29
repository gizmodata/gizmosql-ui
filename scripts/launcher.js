#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const Module = require('node:module');

// ---------------------------------------------------------------------------
// Runtime ADBC stack (packaged builds only).
//
// The GizmoSQL client depends on the ESM-only ADBC driver manager, a
// native Node addon, and the native GizmoSQL driver library — none of
// which can live inside pkg's snapshot (pkg transforms ESM sources and
// the OS cannot dlopen from a virtual filesystem). They ship as an
// opaque runtime-libs.tgz asset, extracted here to real disk on first
// run, with require() redirected to the extracted copies.
// ---------------------------------------------------------------------------

function untarTo(buf, destRoot) {
  let off = 0;
  let pendingLongName = null;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    off += 512;
    if (header.every((b) => b === 0)) break;
    const nameField = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const size = parseInt(header.subarray(124, 136).toString('utf8').trim(), 8) || 0;
    const type = String.fromCharCode(header[156]);
    const data = buf.subarray(off, off + size);
    off += Math.ceil(size / 512) * 512;
    let name = pendingLongName ?? (prefix ? `${prefix}/${nameField}` : nameField);
    pendingLongName = null;
    if (type === 'L') { pendingLongName = data.toString('utf8').replace(/\0.*$/, ''); continue; }
    if (type === 'x' || type === 'g') continue; // pax extension headers
    const dest = path.join(destRoot, name);
    if (type === '5') fs.mkdirSync(dest, { recursive: true });
    else if (type === '0' || type === '\0') {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, data, { mode: 0o755 });
    }
  }
}

function setupRuntimeLibs(version) {
  if (!process.pkg) return; // dev mode resolves normally
  const cacheRoot =
    process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'gizmosql-ui')
      : path.join(os.homedir(), '.cache', 'gizmosql-ui');
  const runtimeDir = path.join(cacheRoot, `runtime-v${version}`);
  const marker = path.join(runtimeDir, '.complete');
  if (!fs.existsSync(marker)) {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
    const tgz = fs.readFileSync(path.join(__dirname, 'runtime-libs.tgz'));
    untarTo(zlib.gunzipSync(tgz), runtimeDir);
    fs.writeFileSync(marker, 'ok');
  }
  const redirected = ['@gizmodata/', '@apache-arrow/', 'apache-arrow'];
  const realResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (redirected.some((p) => request === p.replace(/\/$/, '') || request.startsWith(p))) {
      try {
        return realResolve.call(this, path.join(runtimeDir, 'node_modules', request), ...rest);
      } catch {
        // fall through to normal resolution
      }
    }
    return realResolve.apply(this, [request, ...rest]);
  };
}

process.env.NODE_ENV ??= 'production';
process.env.NEXT_TELEMETRY_DISABLED ??= '1';

// --enable-tpch: show a TPC-H query (1-22) selector in the SQL editor.
// Also honored via the GIZMOSQL_UI_ENABLE_TPCH environment variable.
if (process.argv.slice(2).includes('--enable-tpch')) {
  process.env.GIZMOSQL_UI_ENABLE_TPCH = '1';
}
const TPCH_ENABLED = ['1', 'true', 'yes'].includes(
  (process.env.GIZMOSQL_UI_ENABLE_TPCH || '').toLowerCase()
);

// Read version from package.json
let VERSION = '0.0.0';
try {
  VERSION = require(path.join(__dirname, 'package.json')).version;
} catch {
  try {
    VERSION = require('package.json').version;
  } catch {
    // keep fallback — cache dir still works, just not version-keyed
  }
}

setupRuntimeLibs(VERSION);

/**
 * Open browser using native system commands (pkg-compatible)
 */
function openBrowser(url) {
  return new Promise((resolve, reject) => {
    let command;
    switch (process.platform) {
      case 'darwin':
        command = `open "${url}"`;
        break;
      case 'win32':
        command = `start "" "${url}"`;
        break;
      default:
        command = `xdg-open "${url}"`;
        break;
    }
    exec(command, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

const PORT = process.env.PORT || 3000;
const url = `http://localhost:${PORT}`;

const versionText = `GizmoSQL UI v${VERSION}`;
const versionLine = versionText.padStart(37 + Math.floor(versionText.length / 2)).padEnd(74);

console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║    ██████╗ ██╗███████╗███╗   ███╗ ██████╗ ███████╗ ██████╗ ██╗           ║
║   ██╔════╝ ██║╚══███╔╝████╗ ████║██╔═══██╗██╔════╝██╔═══██╗██║           ║
║   ██║  ███╗██║  ███╔╝ ██╔████╔██║██║   ██║███████╗██║   ██║██║           ║
║   ██║   ██║██║ ███╔╝  ██║╚██╔╝██║██║   ██║╚════██║██║▄▄ ██║██║           ║
║   ╚██████╔╝██║███████╗██║ ╚═╝ ██║╚██████╔╝███████║╚██████╔╝███████╗      ║
║    ╚═════╝ ╚═╝╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚══════╝ ╚══▀▀═╝ ╚══════╝      ║
║                                                                          ║
║${versionLine}║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝

  Server running at: ${url}

  Opening browser...
`);

if (TPCH_ENABLED) {
  console.log('  TPC-H demo mode enabled: query selector (1-22) shown in the editor.\n');
}

// Open browser after a short delay to allow server to start
setTimeout(() => {
  openBrowser(url).catch(() => {
    console.log('  Could not open browser automatically.');
    console.log(`  Please open ${url} in your browser.`);
  });
}, 1000);

require('./server');