import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// Declare global constant that esbuild will define at bundle time
declare const __APP_VERSION__: string | undefined;

function getVersion(): string {
  // If bundled, esbuild will have defined __APP_VERSION__
  if (typeof __APP_VERSION__ !== 'undefined') {
    return __APP_VERSION__;
  }

  // Fallback for development: read from package.json
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    // Navigate from src/backend/src to the root package.json
    const packageJsonPath = path.resolve(__dirname, '../../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const VERSION = getVersion();
