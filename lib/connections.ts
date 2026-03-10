import { GizmoSQLService } from './services/gizmosql';

// Store active connections by session ID
// IMPORTANT: globalThis is required in BOTH development AND production.
// In development, it survives HMR. In production standalone builds,
// each Next.js route handler is a separate webpack bundle with its own
// module cache — globalThis is the only way to share state across routes.

const globalForConnections = globalThis as unknown as {
  gizmosqlConnections: Map<string, GizmoSQLService> | undefined;
  shutdownHandlersRegistered: boolean | undefined;
};

// Initialize the connections Map only once, shared via globalThis
const connections = globalForConnections.gizmosqlConnections ?? new Map<string, GizmoSQLService>();
globalForConnections.gizmosqlConnections = connections;

export function getConnection(sessionId: string): GizmoSQLService | undefined {
  return connections.get(sessionId);
}

export function setConnection(sessionId: string, service: GizmoSQLService): void {
  connections.set(sessionId, service);
}

export function deleteConnection(sessionId: string): boolean {
  return connections.delete(sessionId);
}

export function hasConnection(sessionId: string): boolean {
  return connections.has(sessionId);
}

export function getConnectionCount(): number {
  return connections.size;
}

/**
 * Close all active connections (sends CloseSession RPC for each).
 * Used during graceful shutdown (SIGTERM/SIGINT).
 */
export async function closeAllConnections(): Promise<void> {
  const entries = Array.from(connections.entries());
  if (entries.length === 0) return;

  console.log(`Closing ${entries.length} active GizmoSQL connection(s)...`);
  await Promise.allSettled(
    entries.map(async ([sessionId, service]) => {
      try {
        await service.close();
        connections.delete(sessionId);
        console.log(`  Closed session ${sessionId}`);
      } catch (error) {
        console.error(`  Failed to close session ${sessionId}:`, error);
      }
    })
  );
}

// Register process signal handlers for graceful shutdown (once only)
if (!globalForConnections.shutdownHandlersRegistered) {
  const handleShutdown = (signal: string) => {
    console.log(`\nReceived ${signal}, closing all GizmoSQL connections...`);
    closeAllConnections()
      .then(() => {
        console.log('All GizmoSQL connections closed.');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Error during connection cleanup:', error);
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  globalForConnections.shutdownHandlersRegistered = true;
}
