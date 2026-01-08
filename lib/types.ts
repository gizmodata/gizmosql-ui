// Server types
export interface ServerConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username?: string;
  useTls: boolean;
  skipTlsVerify: boolean;
  sessionId: string;
  status: 'connected' | 'disconnected' | 'error';
  errorMessage?: string;
}

export interface ServerConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  useTls: boolean;
  skipTlsVerify: boolean;
}

// Schema browser types
export interface CatalogInfo {
  name: string;
  schemas: SchemaInfo[];
}

export interface SchemaInfo {
  catalog: string;
  name: string;
  tables: TableInfo[];
}

export interface TableInfo {
  catalog: string;
  schema: string;
  name: string;
  type: string;
}

export interface ColumnInfo {
  catalog: string;
  schema: string;
  table: string;
  name: string;
  type: string;
  position: number;
}

// Notebook types
export interface Notebook {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  cells: Cell[];
}

export interface Cell {
  id: string;
  serverId: string | null; // null means no server selected
  sql: string;
  result: CellResult | null;
  isExecuting: boolean;
  error: string | null;
}

export interface CellResult {
  columns: Array<{ name: string; type: string }>;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  executionTimeMs: number;
  // Pagination
  page: number;
  pageSize: number;
  totalRows: number | null; // null if unknown (e.g., streaming or very large)
  hasMore: boolean;
  originalSql: string; // Store the original SQL for pagination
}

// Theme type
export type Theme = 'light' | 'dark';

// App state
export interface AppState {
  theme: Theme;
  servers: ServerConnection[];
  notebooks: Notebook[];
  activeNotebookId: string | null;
}
