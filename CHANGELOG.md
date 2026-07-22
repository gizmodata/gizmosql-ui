# Changelog

All notable changes to GizmoSQL UI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.5.6] - 2026-07-22

### Fixed
- Update `@gizmodata/gizmosql-client` to 1.4.4 — fixes a bug with prepared statements
- Packaged binaries no longer crash on startup with `ERR_INSPECTOR_NOT_AVAILABLE` — the inspector shim now intercepts `require("node:inspector")` (used by Next.js 16.2), which bypassed the previous `_resolveFilename` hook

### Changed
- Bump dependencies: Next.js 16.2.10, React 19.2.7, apache-arrow 21.2.0, parquet-wasm 0.7.2, react-icons 5.7.0, @next/eslint-plugin-next 16.2.10, @yao-pkg/pkg 6.21.0, eslint-plugin-react-hooks 7.1.1
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
