# Claude Code Guidelines for GizmoSQL UI

## Project Overview

GizmoSQL UI is a web-based SQL interface for GizmoSQL servers, built with Next.js 14 (App Router) and React 18. It connects to GizmoSQL servers via the Arrow Flight SQL protocol.

## Tech Stack

- **Framework**: Next.js 14.2.x (App Router, TypeScript, standalone output)
- **Package Manager**: pnpm
- **Styling**: CSS Modules (per-component `.module.css` files) + global theme variables in `globals.css`
- **State Management**: React Context + useReducer (`context/AppContext.tsx`), persisted to localStorage
- **SQL Editor**: Monaco Editor (`@monaco-editor/react`)
- **Flight SQL Client**: `@gizmodata/gizmosql-client` (wraps Arrow Flight SQL protocol)
- **Icons**: lucide-react, react-icons
- **Packaging**: @yao-pkg/pkg for cross-platform standalone binaries

## Key Directories

- `app/` — Next.js App Router pages and API routes
- `app/api/` — Server-side API routes (connect, disconnect, query, schema discovery, OAuth)
- `components/` — React components (each with paired `.module.css`)
- `context/` — AppContext with useReducer for global state
- `lib/` — Shared code: types, API client, connection manager, GizmoSQL service
- `lib/services/gizmosql.ts` — GizmoSQLService wrapping FlightSQLClient (query queueing, type conversion)
- `scripts/` — Build/packaging scripts

## Build Commands

```bash
pnpm dev          # Development server
pnpm build        # Production build
pnpm start        # Run standalone server
pnpm lint         # ESLint/TypeScript checks
pnpm package      # Create cross-platform binaries
pnpm clean        # Remove .next, node_modules, dist
```

## Architecture Patterns

### Component Pattern
```tsx
'use client';
import { useApp } from '@/context/AppContext';
import styles from './Component.module.css';

export function Component({ prop }: Props) {
  const { state, dispatch } = useApp();
  // useState for local UI state, useCallback for handlers
  return <div className={styles.container}>...</div>;
}
```

### API Route Pattern
```tsx
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Validate, get connection from Map, execute, return JSON
  } catch (error) {
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

### Connection Lifecycle
1. Client calls `/api/connect` → creates `GizmoSQLService`, stores in server-side `Map<sessionId, service>`
2. All subsequent requests include `sessionId` to look up the connection
3. `/api/disconnect` removes from Map and closes connection
4. Auto-reconnect on app startup if password/OAuth token is saved

### Query Execution
- `GizmoSQLService` queues queries sequentially per connection (prevents Flight SQL concurrency issues)
- Pagination: SELECT queries wrapped with LIMIT/OFFSET; requests N+1 rows to detect `hasMore`
- Arrow-to-JSON conversion handles BigInt, Decimal128/256, Date, Timestamp, Binary

### Theming
- Light/dark themes via CSS custom properties in `globals.css`
- Applied via `data-theme` attribute on `<html>`
- Theme state managed in AppContext

## Important Conventions

- All components are client components (`'use client'`)
- CSS Modules for all component styling — no Tailwind
- Types are centralized in `lib/types.ts`
- API client (`lib/api.ts`) is a singleton class with session-based routing
- Connection state persisted to localStorage key `gizmosql-ui-state`
- OAuth flow uses popup window + polling (`/api/oauth/initiate` → `/api/oauth/poll`)

## Enterprise Features

- **Admin Screen** (`AdminScreen.tsx`): Session monitoring, SQL statement viewer — requires server instrumentation
- **Kill Session** (`KillSessionModal.tsx`): Terminate active sessions (admin role required)
- **Instrumentation Discovery**: Uses `GIZMOSQL_INSTRUMENTATION_ENABLED()`, `GIZMOSQL_INSTRUMENTATION_CATALOG()`, `GIZMOSQL_INSTRUMENTATION_SCHEMA()` SQL functions
- **OAuth/SSO**: Server-side OAuth code exchange flow via GizmoSQL server

## Version Bumping

When releasing a new version, **all** of the following must be updated to match:
- `package.json` — `version` field
- `app/page.tsx` — version displayed in the header/banner (must match `package.json`)
- `scripts/launcher.js` — fallback `VERSION` constant

## Pre-Commit Checklist

- [ ] `pnpm lint` passes
- [ ] `pnpm build` succeeds
- [ ] Update `CHANGELOG.md` for user-facing changes
- [ ] Update version in `package.json` if releasing
- [ ] Ensure banner version in `app/page.tsx` matches `package.json` version
- [ ] Ensure `scripts/launcher.js` VERSION matches `package.json` version
