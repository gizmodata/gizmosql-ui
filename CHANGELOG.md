# Changelog

All notable changes to GizmoSQL UI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.6.1] - 2026-07-29

### Fixed
- **v2.6.0 packaged binaries could not perform any database operation**
  (`ReferenceError: module is not defined in ES module scope`): pkg's
  snapshot transforms the ESM-only ADBC driver manager into broken
  hybrid sources, and native libraries cannot load from a snapshot. The
  ADBC stack now ships as an opaque `runtime-libs.tgz` asset that the
  launcher extracts to a version-keyed cache dir on first run,
  redirecting `require()` to the real-disk copies. Verified end-to-end:
  driver health, live connect/query, and OAuth discovery against a TLS
  server all pass through the packaged binary.
- OAuth initiate proxy now tries HTTPS first when falling back to
  manual host/port (an `ECONNRESET` resulted from probing HTTP against
  TLS-only OAuth endpoints when discovery had failed).

### Added
- `/api/health/driver` endpoint proving the ADBC client stack loads and
  the native driver is present — and **CI now runs the packed binary**
  on every platform, gating releases on that health check (plus a full
  live connect/query smoke on Linux). The v2.6.0 regression class can
  no longer ship.

## [2.6.0] - 2026-07-29

### Removed
- **Windows-on-ARM builds are temporarily unavailable**: the upstream
  ADBC Node.js driver manager ships no `win32-arm64` native addon yet,
  so the 2.0 client cannot run there. Windows-on-ARM users can run the
  x64 build under Windows' built-in emulation; native arm64 builds
  return when upstream publishes the addon (requested upstream).

### Changed
- **Upgraded to `@gizmodata/gizmosql-client` 2.0** — the client is now
  powered by the [native Go GizmoSQL ADBC driver](https://github.com/gizmodata/gizmosql-adbc)
  (auto-downloaded and SHA-256-verified at install time) via the ADBC
  driver manager, replacing the pure-TypeScript Flight SQL transport.
  Same client API (zero application changes); the UI gains the shared
  driver's DDL/DML immediate execution, `RETURNING` support,
  `gizmosql://` TLS-by-default transport, and geometry-preserving
  ingest. Note: requires Node.js >= 22 at runtime.

## [2.5.8] - 2026-07-22

### Fixed
- MSI installer now upgrades (removes) previously installed versions instead of installing side-by-side. The MSI ProductVersion was bound to the packaged exe's file version — which is the embedded Node runtime version (24.18.0), identical across releases — so Windows Installer never treated a new MSI as an upgrade and never replaced the exe. The release version is now passed into WiX explicitly, and `AllowSameVersionUpgrades` is enabled.

## [2.5.7] - 2026-07-22

### Fixed
- MSI installer artwork: logo no longer stretched to 4:1 (aspect ratio preserved), moved out of the banner's title-text area, and kept within the dialog's left strip so it doesn't underlap the wizard text

## [2.5.6] - 2026-07-22

### Added
- Windows arm64 builds: signed `gizmosql-ui-win-arm64.exe` and `GizmoSQL-UI-arm64.msi` release artifacts

### Fixed
- Update `@gizmodata/gizmosql-client` to 1.4.4 — fixes a bug with prepared statements
- Packaged binaries no longer crash on startup with `ERR_INSPECTOR_NOT_AVAILABLE` — the inspector shim now intercepts `require("node:inspector")` (used by Next.js 16.2), which bypassed the previous `_resolveFilename` hook

### Changed
- Bump dependencies: Next.js 16.2.10, React 19.2.7, apache-arrow 21.2.0, parquet-wasm 0.7.2, react-icons 5.7.0, @next/eslint-plugin-next 16.2.10, @yao-pkg/pkg 6.21.0, eslint-plugin-react-hooks 7.1.1
- CI: Windows builds use pnpm's hoisted node_modules layout — pnpm 11 junctions break pkg's file walker on Windows (EPERM stat)
- Build with Node.js 24: CI and packaged binaries now use Node 24 (previously Node 22)
- README: Homebrew install instructions now include `brew trust gizmodata/tap` (required as of Homebrew 6.0)
- CI: bump GitHub Actions to current majors (checkout v7, setup-node v7, cache v6, upload-artifact v7, download-artifact v8, attest-build-provenance v4, gh-release v3, pnpm/action-setup v6, azure/login v3)
- CI: GitHub Release notes are now extracted from the tag's CHANGELOG section instead of auto-generated
- CI: pnpm 11 (matching local); build-script approvals for esbuild/protobufjs/sharp recorded in `pnpm-workspace.yaml`

## [2.5.5] - 2026-05-18

### Added
- TPC-H demo mode: launch with `--enable-tpch` (or set `GIZMOSQL_UI_ENABLE_TPCH=1`) to show a per-cell dropdown that loads any of the 22 standard TPC-H benchmark queries into the SQL editor. Assumes the TPC-H tables already exist on the connected server.

## [2.5.4] - 2026-03-11

### Fixed
- Connection error messages now show the server's actual error detail (e.g., "Invalid credentials") instead of generic "Failed to get catalogs: ConnectionError: Failed to connect to..."
- Return 401 status for authentication errors instead of 500
- Update `@gizmodata/gizmosql-client` to 1.4.3

## [2.5.3] - 2026-03-10

### Fixed
- Update `@gizmodata/gizmosql-client` to 1.4.2 — fixes CloseSession being sent to wrong session in pkg builds

### Added
- About modal with version and copyright info
- Auto-resizing SQL editor cells — editors grow with content up to 600px

### Changed
- Removed version number from header title (now shown in About modal)

## [2.5.2] - 2026-03-10

### Fixed
- Fix production session leak: connections Map was not shared across Next.js route handler webpack bundles — `globalThis` bridge was only set in development, causing disconnect route to never find connections created by connect route
- Add graceful shutdown (SIGTERM/SIGINT) — all active connections now receive `CloseSession` RPC before process exit
- Add browser close handling — `beforeunload` sends disconnect beacons for all connected servers

## [2.5.1] - 2026-03-10

### Fixed
- Updated `@gizmodata/gizmosql-client` to 1.4.1 to fix session leak — client now sends `CloseSession` RPC on disconnect

## [2.5.0] - 2026-03-04

### Added

- **Windows MSI installer** with Desktop shortcut, Start Menu entry, and PATH integration
- **macOS code signing and notarization** for release builds (Apple Developer ID)
- **Windows code signing** for release builds (Azure Key Vault + AzureSignTool)
- WiX v4 installer definition (`installer/GizmoSQLUI.wxs`)

### Changed

- Upgraded **Next.js** from 14.2 to 16.1 (Turbopack for dev, webpack for production builds)
- Upgraded **React** from 18.3 to 19.2
- Upgraded all dependencies to latest compatible versions
- Migrated ESLint to flat config (`eslint.config.mjs`) — `next lint` removed in Next.js 16
- Migrated `serverComponentsExternalPackages` to top-level `serverExternalPackages`
- Cross-platform standalone build preparation (`scripts/prepare-standalone.js`) replacing Unix shell commands
- Production builds use `next build --webpack` for pkg compatibility with externalized gRPC packages
- CI release workflow now includes signing and MSI jobs between build and release

## [2.4.0] - 2026-02-11

### Added

- **Admin screen** for monitoring active sessions, SQL statements, and server instrumentation data
- **Kill Session** modal for administrators to terminate active sessions
- **OAuth/SSO login** support in the Add Server dialog (`authType: oauth`)
- OAuth discovery, initiation, and polling API routes (`/api/oauth/discover`, `/api/oauth/initiate`, `/api/oauth/poll`)
- Server info API route (`/api/server-info`)
- SQL functions for instrumentation metadata discovery (`GIZMOSQL_INSTRUMENTATION_ENABLED()`, `GIZMOSQL_INSTRUMENTATION_CATALOG()`, `GIZMOSQL_INSTRUMENTATION_SCHEMA()`)
- Table details modal with column metadata viewer
- Text viewer modal for inspecting long SQL statements and values

### Changed

- Instrumentation discovery now uses standard SQL queries instead of `GetSqlInfo` for broader client compatibility
