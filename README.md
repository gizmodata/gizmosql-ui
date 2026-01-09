# GizmoSQL UI

A web-based SQL interface for [GizmoSQL](https://github.com/gizmodata/gizmosql) servers. GizmoSQL UI provides a modern, responsive interface for connecting to and querying GizmoSQL databases using Apache Arrow Flight SQL.

![GizmoSQL UI Screenshot](assets/screenshot.png)

## Features

- **Connection Management**: Connect to GizmoSQL servers with support for TLS and authentication
- **SQL Editor**: Monaco-based SQL editor with syntax highlighting and autocomplete
- **Results Grid**: View query results in a responsive table with type-aware formatting
- **Schema Browser**: Browse catalogs, schemas, tables, and columns
- **Export Options**: Export results to CSV, TSV, JSON, or Parquet formats

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+

### Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev
```

The development server runs at http://localhost:3000

### Production Build

```bash
# Build for production
pnpm build

# Start the production server
pnpm start
```

### Creating Standalone Executables

You can package the app into standalone executables for Linux, macOS, and Windows:

```bash
# Build executables for all platforms
pnpm package

# Build for specific platforms
pnpm package:linux      # Linux x64
pnpm package:macos      # macOS ARM64 (Apple Silicon)
pnpm package:macos-x64  # macOS x64 (Intel)
pnpm package:win        # Windows x64
```

The executables will be created in `dist/bin/`. Run them directly:

```bash
./dist/bin/gizmosql-ui-macos-arm64   # macOS
./dist/bin/gizmosql-ui-linux-x64     # Linux
dist\bin\gizmosql-ui-win-x64.exe     # Windows
```

The executable will start the server and automatically open your browser to `http://localhost:4821`.

### Starting a GizmoSQL Server (Optional)

If you don't have a GizmoSQL server running, you can start one using Docker:

```bash
docker run --name gizmosql \
           --detach \
           --rm \
           --tty \
           --init \
           --publish 31337:31337 \
           --env TLS_ENABLED="1" \
           --env GIZMOSQL_USERNAME=gizmosql \
           --env GIZMOSQL_PASSWORD="gizmosql_password" \
           --env PRINT_QUERIES="1" \
           --pull always \
           gizmodata/gizmosql:latest
```

Then connect GizmoSQL UI using:
- Host: `localhost`
- Port: `31337`
- Username: `gizmosql`
- Password: `gizmosql_password`
- Use TLS: enabled
- Skip TLS Verify: enabled (for self-signed certificate)

## Configuration

### Connection Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| Host | GizmoSQL server hostname or IP | localhost |
| Port | GizmoSQL server port | 31337 |
| Username | Authentication username | (required) |
| Password | Authentication password | (required) |
| Use TLS | Enable TLS encryption | true |
| Skip TLS Verify | Skip TLS certificate verification | false |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | HTTP server port | 3000 |

## Architecture

```
┌──────────────────────────────────────────────────┐
│  GizmoSQL UI (Next.js)                           │
├──────────────────────────────────────────────────┤
│  React Frontend (App Router)                     │
│  ├── Monaco SQL Editor                           │
│  ├── Results Grid                                │
│  └── Schema Browser                              │
├──────────────────────────────────────────────────┤
│  Next.js API Routes                              │
│  ├── /api/* endpoints                            │
│  └── @gizmodata/gizmosql-client                  │
└──────────────────────────────────────────────────┘
                        │
                        │ gRPC (Arrow Flight SQL)
                        ▼
┌──────────────────────────────────────────────────┐
│  GizmoSQL Server                                 │
└──────────────────────────────────────────────────┘
```

## Project Structure

```
gizmosql-ui/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── catalogs/
│   │   ├── columns/
│   │   ├── connect/
│   │   ├── disconnect/
│   │   ├── health/
│   │   ├── query/
│   │   ├── schemas/
│   │   └── tables/
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page
├── components/            # React components
├── context/              # React context providers
├── lib/                  # Utilities and services
│   ├── api.ts           # Frontend API client
│   ├── connections.ts   # Server connection manager
│   ├── services/        # Backend services
│   └── types.ts         # TypeScript types
└── public/              # Static assets
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/health | GET | Health check |
| /api/connect | POST | Connect to GizmoSQL server |
| /api/disconnect | POST | Disconnect from server |
| /api/query | POST | Execute SQL query |
| /api/catalogs | GET | List catalogs |
| /api/schemas | GET | List schemas |
| /api/tables | GET | List tables |
| /api/columns | GET | List columns |

## License

Apache License 2.0

## Credits

Developed by [GizmoData LLC](https://gizmodata.com)

Powered by:
- [Next.js](https://nextjs.org/) - React framework
- [@gizmodata/gizmosql-client](https://www.npmjs.com/package/@gizmodata/gizmosql-client) - GizmoSQL client library
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [Apache Arrow](https://arrow.apache.org/) - Columnar data format
