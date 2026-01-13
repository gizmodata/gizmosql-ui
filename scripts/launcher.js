#!/usr/bin/env node

const { exec } = require('child_process');

process.env.NODE_ENV ??= 'production';
process.env.NEXT_TELEMETRY_DISABLED ??= '1';

// Read version from package.json
let VERSION = '2.0.0';
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

// Open browser after a short delay to allow server to start
setTimeout(() => {
  openBrowser(url).catch(() => {
    console.log('  Could not open browser automatically.');
    console.log(`  Please open ${url} in your browser.`);
  });
}, 1000);

require('./server');