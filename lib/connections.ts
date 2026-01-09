import { GizmoSQLService } from './services/gizmosql';

// Store active connections by session ID
// Using globalThis to persist across Next.js hot module reloading (HMR) in development
// In a production serverless environment, you might want to use Redis or similar

const globalForConnections = globalThis as unknown as {
  gizmosqlConnections: Map<string, GizmoSQLService> | undefined;
};

// Initialize the connections Map only once
const connections = globalForConnections.gizmosqlConnections ?? new Map<string, GizmoSQLService>();

// In development, persist to globalThis to survive HMR
if (process.env.NODE_ENV !== 'production') {
  globalForConnections.gizmosqlConnections = connections;
}

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
