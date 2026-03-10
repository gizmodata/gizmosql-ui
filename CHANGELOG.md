# Changelog

All notable changes to GizmoSQL UI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
