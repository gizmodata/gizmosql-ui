# Changelog

All notable changes to GizmoSQL UI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
