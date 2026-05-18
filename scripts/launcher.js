#!/usr/bin/env node

const { exec } = require('child_process');

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
let VERSION = '2.5.5';
try {
  const pkg = require('package.json');
  VERSION = pkg.version;
} catch {
  // Ignore if package.json not found
}

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