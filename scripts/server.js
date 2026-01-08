#!/usr/bin/env node
/**
 * Custom server wrapper for the Next.js standalone build.
 * This script:
 * 1. Starts the Next.js server
 * 2. Opens the default browser
 * 3. Displays a nice banner
 */

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

// Try to import 'open' for browser opening, fallback to platform-specific commands
let openBrowser;
try {
  openBrowser = require('open');
} catch {
  // Fallback implementation
  openBrowser = async (url) => {
    const { exec } = require('child_process');
    const platform = process.platform;
    let command;
    
    if (platform === 'darwin') {
      command = `open "${url}"`;
    } else if (platform === 'win32') {
      command = `start "" "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }
    
    return new Promise((resolve, reject) => {
      exec(command, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  };
}

const PORT = process.env.PORT || 4821;
const HOST = process.env.HOST || '0.0.0.0';

// Read version from package.json
let VERSION = '2.0.0';
try {
  const pkg = require('../package.json');
  VERSION = pkg.version;
} catch {
  // Ignore if package.json not found
}

function printBanner(url) {
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
}

// Wait for server to be ready
function waitForServer(url, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    const check = () => {
      attempts++;
      
      http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          resolve();
        } else if (attempts < maxAttempts) {
          setTimeout(check, 500);
        } else {
          reject(new Error('Server did not become ready'));
        }
      }).on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(check, 500);
        } else {
          reject(new Error('Server did not become ready'));
        }
      });
    };
    
    check();
  });
}

async function main() {
  const url = `http://localhost:${PORT}`;
  
  // Determine the path to the standalone server
  let serverPath;
  
  // Check if we're running from pkg bundle
  if (process.pkg) {
    // Running as packaged executable
    serverPath = path.join(__dirname, 'server.js');
  } else {
    // Running from source - use the Next.js standalone server
    serverPath = path.join(__dirname, '..', '.next', 'standalone', 'server.js');
  }
  
  // Set environment variables
  process.env.PORT = PORT.toString();
  process.env.HOSTNAME = HOST;
  
  // For standalone build, we need to require the server directly
  // The standalone server.js is designed to be required
  try {
    // Change to the standalone directory
    const standaloneDir = path.join(__dirname, '..', '.next', 'standalone');
    process.chdir(standaloneDir);
    
    // Start the server in the background
    const server = spawn(process.execPath, ['server.js'], {
      cwd: standaloneDir,
      env: {
        ...process.env,
        PORT: PORT.toString(),
        HOSTNAME: HOST,
      },
      stdio: 'inherit',
    });
    
    server.on('error', (err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
    
    // Wait for server to be ready
    await waitForServer(url);
    
    // Print banner and open browser
    printBanner(url);
    
    try {
      await openBrowser(url);
    } catch {
      console.log('  Could not open browser automatically.');
      console.log(`  Please open ${url} in your browser.\n`);
    }
    
    // Handle shutdown
    process.on('SIGINT', () => {
      server.kill('SIGINT');
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      server.kill('SIGTERM');
      process.exit(0);
    });
    
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

main();
