#!/usr/bin/env node

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
`);

require('./server');