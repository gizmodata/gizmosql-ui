import path from 'path';
import fs from 'fs';

// Detect if running inside pkg
const isPkg = !!(process as NodeJS.Process & { pkg?: unknown }).pkg;

/**
 * Get the path to static frontend files.
 * Handles both development and packaged (pkg) environments.
 */
export function getStaticPath(dirname: string): string {
  // When running from pkg, assets are in the snapshot filesystem
  if (isPkg) {
    const snapshotPath = '/snapshot/gizmosql-ui/dist/frontend';
    if (fs.existsSync(snapshotPath)) {
      return snapshotPath;
    }
    // Try alternate snapshot path
    const altSnapshotPath = path.join(path.dirname(process.execPath), 'dist/frontend');
    if (fs.existsSync(altSnapshotPath)) {
      return altSnapshotPath;
    }
  }

  // Development path (relative to dist/backend/src)
  const devPath = path.join(dirname, '../../frontend');
  if (fs.existsSync(devPath)) {
    return devPath;
  }

  // Fallback for development from source
  const srcDevPath = path.join(dirname, '../../../src/frontend/dist');
  if (fs.existsSync(srcDevPath)) {
    return srcDevPath;
  }

  return devPath;
}
