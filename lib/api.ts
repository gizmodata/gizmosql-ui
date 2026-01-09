const API_BASE = '/api';

export interface ConnectionConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  useTls: boolean;
  skipTlsVerify: boolean;
}

export interface ConnectResponse {
  success: boolean;
  sessionId: string;
  message: string;
}

export interface Column {
  name: string;
  type: string;
}

export interface QueryResult {
  columns: Column[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  executionTimeMs: number;
  hasMore: boolean;
}

export interface TableInfo {
  catalog: string;
  schema: string;
  name: string;
  type: string;
}

export interface SchemaInfo {
  catalog: string;
  schema: string;
}

export interface ColumnInfo {
  catalog: string;
  schema: string;
  table: string;
  name: string;
  type: string;
  position: number;
}

class ApiClient {
  private sessionId: string | null = null;

  setSessionId(id: string | null) {
    this.sessionId = id;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.sessionId) {
      headers['X-Session-Id'] = this.sessionId;
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (networkError) {
      // Network error (server not reachable, CORS, etc.)
      throw new Error(`Network error: Unable to reach server. ${networkError instanceof Error ? networkError.message : ''}`);
    }

    let data: { error?: string };
    try {
      data = await response.json();
    } catch {
      throw new Error(`Server returned invalid response (status ${response.status})`);
    }

    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    return data as T;
  }

  async connect(config: ConnectionConfig): Promise<ConnectResponse> {
    const response = await this.request<ConnectResponse>('POST', '/connect', config);
    this.sessionId = response.sessionId;
    return response;
  }

  async disconnect(): Promise<void> {
    if (this.sessionId) {
      await this.request('POST', '/disconnect', { sessionId: this.sessionId });
      this.sessionId = null;
    }
  }

  async query(sql: string, limit?: number, offset?: number): Promise<QueryResult> {
    return this.request<QueryResult>('POST', '/query', {
      sessionId: this.sessionId,
      sql,
      limit,
      offset,
    });
  }

  async getCatalogs(): Promise<string[]> {
    const response = await this.request<{ catalogs: string[] }>('GET', '/catalogs');
    return response.catalogs;
  }

  async getSchemas(catalog?: string): Promise<SchemaInfo[]> {
    const params = catalog ? `?catalog=${encodeURIComponent(catalog)}` : '';
    const response = await this.request<{ schemas: SchemaInfo[] }>('GET', `/schemas${params}`);
    return response.schemas;
  }

  async getTables(catalog?: string, schema?: string): Promise<TableInfo[]> {
    const params = new URLSearchParams();
    if (catalog) params.append('catalog', catalog);
    if (schema) params.append('schema', schema);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const response = await this.request<{ tables: TableInfo[] }>('GET', `/tables${queryString}`);
    return response.tables;
  }

  async getColumns(catalog?: string, schema?: string, table?: string): Promise<ColumnInfo[]> {
    const params = new URLSearchParams();
    if (catalog) params.append('catalog', catalog);
    if (schema) params.append('schema', schema);
    if (table) params.append('table', table);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const response = await this.request<{ columns: ColumnInfo[] }>('GET', `/columns${queryString}`);
    return response.columns;
  }
}

export const api = new ApiClient();
