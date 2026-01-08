#!/usr/bin/env node
/**
 * Bundle script for creating a distributable package.
 * This script prepares the Next.js standalone build for packaging with pkg.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const STANDALONE_DIR = path.join(ROOT_DIR, '.next', 'standalone');
const STATIC_DIR = path.join(ROOT_DIR, '.next', 'static');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

console.log('📦 Preparing bundle...\n');

// Ensure standalone build exists
if (!fs.existsSync(STANDALONE_DIR)) {
  console.error('❌ Standalone build not found. Run "pnpm build" first.');
  process.exit(1);
}

// Create dist directory
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Copy standalone build to dist
console.log('📁 Copying standalone build...');
const distStandalone = path.join(DIST_DIR, 'standalone');
if (fs.existsSync(distStandalone)) {
  fs.rmSync(distStandalone, { recursive: true });
}
fs.cpSync(STANDALONE_DIR, distStandalone, { recursive: true });

// Copy static files to standalone/.next/static
console.log('📁 Copying static files...');
const distStatic = path.join(distStandalone, '.next', 'static');
if (fs.existsSync(STATIC_DIR)) {
  fs.cpSync(STATIC_DIR, distStatic, { recursive: true });
}

// Copy public files to standalone/public
console.log('📁 Copying public files...');
const distPublic = path.join(distStandalone, 'public');
if (fs.existsSync(PUBLIC_DIR)) {
  fs.cpSync(PUBLIC_DIR, distPublic, { recursive: true });
}

// Create a launcher script that can be bundled with pkg
console.log('📝 Creating launcher script...');
const launcherScript = `#!/usr/bin/env node
const path = require('path');
const http = require('http');
const { spawn, exec } = require('child_process');

const PORT = process.env.PORT || 4821;
const VERSION = '${require(path.join(ROOT_DIR, 'package.json')).version}';

// Platform-specific browser opening
function openBrowser(url) {
  return new Promise((resolve) => {
    const platform = process.platform;
    let command;
    
    if (platform === 'darwin') {
      command = \`open "\${url}"\`;
    } else if (platform === 'win32') {
      command = \`start "" "\${url}"\`;
    } else {
      command = \`xdg-open "\${url}"\`;
    }
    
    exec(command, () => resolve());
  });
}

function printBanner(url) {
  const versionText = \`GizmoSQL UI v\${VERSION}\`;
  const versionLine = versionText.padStart(37 + Math.floor(versionText.length / 2)).padEnd(74);
  
  console.log(\`
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║    ██████╗ ██╗███████╗███╗   ███╗ ██████╗ ███████╗ ██████╗ ██╗           ║
║   ██╔════╝ ██║╚══███╔╝████╗ ████║██╔═══██╗██╔════╝██╔═══██╗██║           ║
║   ██║  ███╗██║  ███╔╝ ██╔████╔██║██║   ██║███████╗██║   ██║██║           ║
║   ██║   ██║██║ ███╔╝  ██║╚██╔╝██║██║   ██║╚════██║██║▄▄ ██║██║           ║
║   ╚██████╔╝██║███████╗██║ ╚═╝ ██║╚██████╔╝███████║╚██████╔╝███████╗      ║
║    ╚═════╝ ╚═╝╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚══════╝ ╚══▀▀═╝ ╚══════╝      ║
║                                                                          ║
║\${versionLine}║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝

  Server running at: \${url}

  Opening browser...
\`);
}

function waitForServer(url, maxAttempts = 60) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      http.get(url, (res) => {
        if (res.statusCode < 500) resolve();
        else if (attempts < maxAttempts) setTimeout(check, 500);
        else reject(new Error('Server timeout'));
      }).on('error', () => {
        if (attempts < maxAttempts) setTimeout(check, 500);
        else reject(new Error('Server timeout'));
      });
    };
    setTimeout(check, 1000);
  });
}

async function main() {
  const url = \`http://localhost:\${PORT}\`;
  
  // Set up environment
  process.env.PORT = PORT.toString();
  process.env.HOSTNAME = '0.0.0.0';
  process.env.NODE_ENV = 'production';
  
  // Find the standalone server
  let standaloneDir;
  if (process.pkg) {
    // Running as packaged executable - assets are in snapshot
    standaloneDir = path.join(path.dirname(process.execPath), 'standalone');
    if (!require('fs').existsSync(standaloneDir)) {
      // Try snapshot filesystem
      standaloneDir = path.join(__dirname, 'standalone');
    }
  } else {
    standaloneDir = path.join(__dirname, 'standalone');
  }
  
  // Start the Next.js server
  const serverScript = path.join(standaloneDir, 'server.js');
  
  const server = spawn(process.execPath, [serverScript], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      PORT: PORT.toString(),
      HOSTNAME: '0.0.0.0',
    },
    stdio: 'inherit',
  });
  
  server.on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
  
  // Wait and open browser
  try {
    await waitForServer(url);
    printBanner(url);
    await openBrowser(url);
  } catch {
    console.log('\\n  Server started. Open ' + url + ' in your browser.\\n');
  }
  
  // Handle shutdown
  ['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
      server.kill(signal);
      process.exit(0);
    });
  });
}

main();
`;

fs.writeFileSync(path.join(DIST_DIR, 'launcher.js'), launcherScript);

// Create package.json for pkg
console.log('📝 Creating pkg configuration...');
const pkgConfig = {
  name: 'gizmosql-ui',
  version: require(path.join(ROOT_DIR, 'package.json')).version,
  bin: 'launcher.js',
  pkg: {
    assets: [
      'standalone/**/*'
    ],
    outputPath: 'bin'
  }
};

fs.writeFileSync(
  path.join(DIST_DIR, 'package.json'),
  JSON.stringify(pkgConfig, null, 2)
);

console.log('✅ Bundle prepared successfully!');
console.log('📍 Output directory: dist/');
console.log('To create executables, run:');
console.log('  cd dist && npx @yao-pkg/pkg . --targets node20-linux-x64,node20-macos-arm64,node20-win-x64');
console.log('Or use the package scripts:');
console.log('  pnpm package        # All platforms');
console.log('  pnpm package:macos  # macOS ARM64 only');
console.log('  pnpm package:linux  # Linux x64 only');
console.log('  pnpm package:win    # Windows x64 only');
