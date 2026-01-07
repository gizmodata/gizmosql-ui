#!/usr/bin/env node
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';
import { apiRouter } from './routes/api.js';
import { getStaticPath } from './utils/paths.js';

// Handle both ESM and CJS contexts
// Note: In CJS bundle, esbuild's banner provides __import_meta_url
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 4821;

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api', apiRouter);

// Serve static frontend files
const staticPath = getStaticPath(__dirname);
app.use(express.static(staticPath));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(staticPath, 'index.html'));
  }
});

// Start server
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`
╔═════════════════════════════════════════════════════════════════════╗
║                                                                     ║
║   ██████╗ ██╗███████╗███╗   ███╗ ██████╗ ███████╗ ██████╗ ██╗      ║
║  ██╔════╝ ██║╚══███╔╝████╗ ████║██╔═══██╗██╔════╝██╔═══██╗██║      ║
║  ██║  ███╗██║  ███╔╝ ██╔████╔██║██║   ██║███████╗██║   ██║██║      ║
║  ██║   ██║██║ ███╔╝  ██║╚██╔╝██║██║   ██║╚════██║██║▄▄ ██║██║      ║
║  ╚██████╔╝██║███████╗██║ ╚═╝ ██║╚██████╔╝███████║╚██████╔╝███████╗ ║
║   ╚═════╝ ╚═╝╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚══════╝ ╚══▀▀═╝ ╚══════╝ ║
║                                                                     ║
║                         GizmoSQL UI v1.0.0                          ║
║                                                                     ║
╚═════════════════════════════════════════════════════════════════════╝

  Server running at: ${url}

  Opening browser...
`);

  // Open browser automatically
  open(url).catch(() => {
    console.log('  Could not open browser automatically.');
    console.log(`  Please open ${url} in your browser.`);
  });
});
