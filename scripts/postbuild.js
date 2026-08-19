#!/usr/bin/env node
/**
 * Back-fills GizmoSQL ADBC driver files that Next's standalone file
 * tracer cannot see.
 *
 * @gizmodata/gizmosql-client reads driver-manifest.json and the
 * downloaded native driver library (drivers/<version>/libadbc_driver_*)
 * via fs.readFileSync/existsSync at runtime, not require()/import — so
 * Next's static tracer never discovers them and `.next/standalone`
 * ships without them. Without this, `pnpm start` fails to connect to
 * any GizmoSQL server (ENOENT on driver-manifest.json). This only
 * matters for the plain build+start flow; `pnpm package` replaces
 * these files anyway via its own runtime-libs.tgz mechanism
 * (scripts/prepare-standalone.js).
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const standaloneDir = path.join(rootDir, '.next', 'standalone');

if (!fs.existsSync(standaloneDir)) {
  process.exit(0); // no standalone output for this build config — nothing to do
}

let sourceDir;
try {
  sourceDir = path.dirname(
    require.resolve('@gizmodata/gizmosql-client/package.json', { paths: [rootDir] })
  );
} catch {
  console.warn('postbuild: @gizmodata/gizmosql-client not found, skipping driver backfill.');
  process.exit(0);
}

let destDir;
try {
  destDir = path.dirname(
    require.resolve('@gizmodata/gizmosql-client/package.json', {
      paths: [path.join(standaloneDir, 'node_modules')],
    })
  );
} catch {
  console.warn(
    'postbuild: @gizmodata/gizmosql-client missing from .next/standalone, skipping driver backfill.'
  );
  process.exit(0);
}

for (const name of ['driver-manifest.json', 'drivers']) {
  const src = path.join(sourceDir, name);
  const dest = path.join(destDir, name);
  if (!fs.existsSync(src)) continue;
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

console.log('postbuild: backfilled GizmoSQL ADBC driver files into .next/standalone.');
