# GizmoSQL UI

A web-based SQL interface for [GizmoSQL](https://github.com/gizmodata/gizmosql) servers. GizmoSQL UI provides a modern, responsive interface for connecting to and querying GizmoSQL databases using Apache Arrow Flight SQL.

![GizmoSQL UI Screenshot](assets/screenshot.png)

## Features

- **Connection Management**: Connect to GizmoSQL servers with support for TLS and authentication
- **SQL Editor**: Monaco-based SQL editor with syntax highlighting and autocomplete
- **Results Grid**: View query results in a responsive table with type-aware formatting
- **Schema Browser**: Browse catalogs, schemas, tables, and columns

## Quick Start

### macOS (Homebrew)

```bash
brew install gizmodata/tap/gizmosql-ui
gizmosql-ui
```

### Using Pre-built Executable

Download the appropriate executable for your platform from the [releases page](https://github.com/gizmodata/gizmosql-ui/releases), then run:

```bash
./gizmosql-ui
```

The UI will automatically open in your default browser at `http://localhost:4821`.

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

### Building from Source

#### Prerequisites

- Node.js 20+
- npm 9+

#### Development

```bash
# Install root dependencies
npm install

# Install frontend dependencies
cd src/frontend && npm install && cd ../..

# Install backend dependencies
cd src/backend && npm install && cd ../..

# Run in development mode (both frontend and backend with hot reload)
npm run dev
```

The development server runs at:
- Frontend: http://localhost:5173 (Vite dev server)
- Backend: http://localhost:4821 (Express server)

#### Production Build

```bash
# Build both frontend and backend
npm run build

# Start the production server
npm start
```

#### Creating Executables

```bash
# Build executables for all platforms
npm run package

# Build for macOS ARM64 only
npm run package:macos
```

## Configuration

### Connection Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| Host | GizmoSQL server hostname or IP | localhost |
| Port | GizmoSQL server port | 31337 |
| Username | Authentication username | (optional) |
| Password | Authentication password | (optional) |
| Use TLS | Enable TLS encryption | true |
| Skip TLS Verify | Skip TLS certificate verification | false |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | HTTP server port | 4821 |

## Architecture

```
┌──────────────────────────────────────────────────┐
│  GizmoSQL UI                                     │
├──────────────────────────────────────────────────┤
│  React Frontend                                  │
│  ├── Monaco SQL Editor                           │
│  ├── Results Grid                                │
│  └── Schema Browser                              │
├──────────────────────────────────────────────────┤
│  Express Backend                                 │
│  ├── REST API (/api/*)                           │
│  └── @gizmodata/gizmosql-client                  │
└──────────────────────────────────────────────────┘
                        │
                        │ gRPC (Arrow Flight SQL)
                        ▼
┌──────────────────────────────────────────────────┐
│  GizmoSQL Server                                 │
└──────────────────────────────────────────────────┘
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
- [@gizmodata/gizmosql-client](https://www.npmjs.com/package/@gizmodata/gizmosql-client) - GizmoSQL client library
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [Apache Arrow](https://arrow.apache.org/) - Columnar data format
