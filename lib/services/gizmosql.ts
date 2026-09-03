import { FlightSQLClient, QueryCancelledError } from '@gizmodata/gizmosql-client';
import { InstrumentationInfo } from '@/lib/types';

/**
 * Thrown by GizmoSQLService.execute() when a statement was stopped before
 * it produced a result — either by cancelQuery() (`timedOut: false`) or by
 * the connection's query timeout (`timedOut: true`).
 */
export class QueryAbortedError extends Error {
  constructor(message: string, public readonly timedOut: boolean) {
    super(message);
    this.name = 'QueryAbortedError';
  }
}

export interface ExecuteOptions {
  /** Identifier a later cancelQuery() call can use to abort this statement. */
  queryId?: string;
}

/** Marker used as the abort reason when the connection's query timeout fires. */
class QueryTimeoutReason {
  constructor(public readonly seconds: number) {}
}

export interface GizmoSQLConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  useTls: boolean;
  skipTlsVerify: boolean;
  queryTimeout?: number; // Timeout in seconds (0 or undefined = unlimited)
}

export interface QueryResult {
  columns: Array<{ name: string; type: string }>;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  executionTimeMs: number;
}

interface ArrowRow {
  [key: string]: unknown;
}

export class GizmoSQLService {
  private client: FlightSQLClient | null = null;
  private config: GizmoSQLConfig;
  private queryQueue: Promise<unknown> = Promise.resolve();
  // In-flight (or still queued) statements that can be cancelled, by queryId
  private activeQueries = new Map<string, AbortController>();

  constructor(config: GizmoSQLConfig) {
    this.config = config;
  }

  // Queue a query to ensure sequential execution per connection
  private async queueQuery<T>(fn: () => Promise<T>): Promise<T> {
    // Chain onto the existing queue
    const result = this.queryQueue.then(
      () => fn(),
      () => fn() // Continue even if previous query failed
    );
    // Update queue to track this query (ignore errors to keep queue moving)
    this.queryQueue = result.catch(() => {});
    return result;
  }

  async connect(): Promise<void> {
    this.client = new FlightSQLClient({
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      password: this.config.password,
      plaintext: !this.config.useTls,
      tlsSkipVerify: this.config.skipTlsVerify,
    });

    // Explicitly connect/authenticate first so auth errors are surfaced
    // cleanly rather than being wrapped inside getCatalogs().
    try {
      await this.client.connect();
    } catch (error) {
      console.error('GizmoSQL connection error:', error);
      throw error instanceof Error ? error : new Error(String(error));
    }

    // Verify connection works by fetching catalogs
    try {
      await this.client.getCatalogs();
    } catch (error) {
      console.error('GizmoSQL connection test error:', error);
      throw error instanceof Error ? error : new Error(String(error));
    }

    // Bound statements on the server too. The client-side AbortSignal in
    // execute() interrupts SELECTs, but an abort cannot reach a running
    // DDL/DML statement through the ADBC driver manager — the server-side
    // session timeout covers those. Older servers may not know the setting.
    const timeoutSeconds = this.timeoutSeconds();
    if (timeoutSeconds > 0) {
      try {
        await this.client.execute(`SET gizmosql.query_timeout = ${timeoutSeconds}`);
      } catch (error) {
        console.warn(
          `GizmoSQLService: server did not accept SET gizmosql.query_timeout (client-side timeout still applies):`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  // Validated whole-second query timeout (0 = unlimited)
  private timeoutSeconds(): number {
    const raw = Number(this.config.queryTimeout);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  }

  /**
   * Abort a statement started with execute({ queryId }). Returns false if no
   * such statement is running or queued. Aborting a running SELECT interrupts
   * it on the server (GizmoSQL >= 1.38.0); a running DDL/DML statement
   * completes on the server, only the wait for it is abandoned.
   */
  cancelQuery(queryId: string): boolean {
    const controller = this.activeQueries.get(queryId);
    if (!controller) {
      return false;
    }
    controller.abort(new Error('Query cancelled by user'));
    return true;
  }

  async close(): Promise<void> {
    if (this.client) {
      console.log(`GizmoSQLService: closing connection to ${this.config.host}:${this.config.port}...`);
      await this.client.close();
      this.client = null;
    }
  }

  async execute(sql: string, options: ExecuteOptions = {}): Promise<QueryResult> {
    if (!this.client) {
      throw new Error('Not connected to GizmoSQL server');
    }

    // Register the controller before queueing so a cancel that arrives while
    // the statement is still waiting behind another one is not lost.
    const controller = new AbortController();
    const { queryId } = options;
    if (queryId) {
      this.activeQueries.set(queryId, controller);
    }

    const run = async (): Promise<QueryResult> => {
      const startTime = Date.now();
      const timeoutSeconds = this.timeoutSeconds();
      const timer = timeoutSeconds > 0
        ? setTimeout(() => controller.abort(new QueryTimeoutReason(timeoutSeconds)), timeoutSeconds * 1000)
        : undefined;

      let table;
      try {
        if (controller.signal.aborted) {
          // Cancelled while queued — never reached the server
          throw new QueryCancelledError('Query cancelled', controller.signal.reason);
        }
        table = await this.client!.execute(sql, undefined, { signal: controller.signal });
      } catch (error) {
        if (error instanceof QueryCancelledError) {
          const reason = error.reason ?? controller.signal.reason;
          if (reason instanceof QueryTimeoutReason) {
            throw new QueryAbortedError(`Query timeout: exceeded ${reason.seconds} seconds`, true);
          }
          throw new QueryAbortedError('Query cancelled', false);
        }
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
      }

      const executionTimeMs = Date.now() - startTime;

      // Extract column information from schema
      const columns = table.schema.fields.map(field => ({
        name: field.name,
        type: this.normalizeTypeName(field.type.toString()),
      }));

      // Convert Arrow table to array of objects
      const rows = table.toArray().map((row: ArrowRow) => {
        const obj: Record<string, unknown> = {};
        for (const field of table.schema.fields) {
          obj[field.name] = this.convertValue(row[field.name], field.type.toString());
        }
        return obj;
      });

      return {
        columns,
        rows,
        rowCount: rows.length,
        executionTimeMs,
      };
    };

    try {
      return await this.queueQuery(run);
    } finally {
      if (queryId && this.activeQueries.get(queryId) === controller) {
        this.activeQueries.delete(queryId);
      }
    }
  }

  async getCatalogs(): Promise<string[]> {
    if (!this.client) {
      throw new Error('Not connected to GizmoSQL server');
    }

    return this.queueQuery(() => this.client!.getCatalogs());
  }

  async getSchemas(catalog?: string): Promise<Array<{ catalog: string; schema: string }>> {
    if (!this.client) {
      throw new Error('Not connected to GizmoSQL server');
    }

    return this.queueQuery(() => this.client!.getSchemas(catalog));
  }

  async getTables(catalog?: string, schema?: string): Promise<Array<{
    catalog: string;
    schema: string;
    name: string;
    type: string;
  }>> {
    if (!this.client) {
      throw new Error('Not connected to GizmoSQL server');
    }

    return this.queueQuery(async () => {
      const tables = await this.client!.getTables(catalog, schema);
      return tables.map((t) => ({
        catalog: t.catalog,
        schema: t.schema,
        name: t.tableName,
        type: t.tableType,
      }));
    });
  }

  async getColumns(catalog?: string, schema?: string, tableName?: string): Promise<Array<{
    catalog: string;
    schema: string;
    table: string;
    name: string;
    type: string;
    position: number;
  }>> {
    if (!this.client) {
      throw new Error('Not connected to GizmoSQL server');
    }

    return this.queueQuery(async () => {
      // Use a query to get column information
      let sql = `
        SELECT
          table_catalog as catalog_name,
          table_schema as schema_name,
          table_name,
          column_name,
          data_type,
          ordinal_position
        FROM information_schema.columns
        WHERE 1=1
      `;

      if (catalog) {
        sql += ` AND table_catalog = '${catalog}'`;
      }
      if (schema) {
        sql += ` AND table_schema = '${schema}'`;
      }
      if (tableName) {
        sql += ` AND table_name = '${tableName}'`;
      }

      sql += ' ORDER BY table_catalog, table_schema, table_name, ordinal_position';

      const table = await this.client!.execute(sql);
      return table.toArray().map((row: ArrowRow) => ({
        catalog: row.catalog_name as string,
        schema: row.schema_name as string,
        table: row.table_name as string,
        name: row.column_name as string,
        type: row.data_type as string,
        position: row.ordinal_position as number,
      }));
    });
  }

  async getInstrumentationMetadata(): Promise<InstrumentationInfo | null> {
    if (!this.client) {
      throw new Error('Not connected to GizmoSQL server');
    }

    return this.queueQuery(async () => {
      try {
        const sql =
          'SELECT GIZMOSQL_INSTRUMENTATION_ENABLED() AS enabled,' +
          ' GIZMOSQL_INSTRUMENTATION_CATALOG() AS catalog,' +
          ' GIZMOSQL_INSTRUMENTATION_SCHEMA() AS schema';
        const table = await this.client!.execute(sql);
        const rows = table.toArray();

        if (rows.length === 0) {
          return null;
        }

        const row = rows[0];
        const enabled = Boolean(row.enabled);
        const catalogStr = String(row.catalog || '');
        const schemaStr = String(row.schema || '');

        return {
          enabled,
          catalog: catalogStr,
          schema: schemaStr,
          qualifiedPrefix: catalogStr && schemaStr ? `${catalogStr}.${schemaStr}` : '',
        };
      } catch {
        // Older servers may not support GIZMOSQL_INSTRUMENTATION_*() functions
        return null;
      }
    });
  }

  private convertValue(value: unknown, fieldType?: string): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    // Handle BigInt
    if (typeof value === 'bigint') {
      return value.toString();
    }

    // Handle Date objects
    if (value instanceof Date) {
      return value.toISOString();
    }

    // Handle numbers that might be dates (epoch milliseconds)
    if (typeof value === 'number' && fieldType) {
      const lowerType = fieldType.toLowerCase();
      if (lowerType.includes('date') || lowerType.includes('timestamp')) {
        // Check if it looks like epoch milliseconds (reasonable date range)
        if (value > 86400000 && value < 253402300800000) {
          return new Date(value).toISOString();
        }
        // Could be epoch days for Date32
        if (value > 0 && value < 100000) {
          return new Date(value * 86400000).toISOString().split('T')[0];
        }
      }
    }

    // Handle Uint8Array (binary data)
    if (value instanceof Uint8Array) {
      return `<binary: ${value.length} bytes>`;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(v => this.convertValue(v));
    }

    // Handle Uint32Array (Arrow decimal values)
    if (value instanceof Uint32Array && fieldType?.toLowerCase().includes('decimal')) {
      const scale = this.extractDecimalScale(fieldType);
      return this.decimalWordsToNumber(value, value.length, scale);
    }

    // Handle objects - check if it's a Decimal (has numeric keys 0,1,2,3 representing 32-bit words)
    if (typeof value === 'object' && value !== null) {
      const keys = Object.keys(value);

      // Check if this looks like a Decimal buffer (keys are 0,1,2,3... representing 32-bit words)
      // Decimal128 has 4 words, Decimal256 has 8 words
      const isDecimalBuffer = keys.length > 0 &&
        keys.length <= 8 &&
        keys.every(k => /^\d+$/.test(k));

      if (isDecimalBuffer && fieldType?.toLowerCase().includes('decimal')) {
        const scale = this.extractDecimalScale(fieldType);
        return this.decimalWordsToNumber(value as Record<string, number>, keys.length, scale);
      }

      // Regular object (struct/map)
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        obj[k] = this.convertValue(v);
      }
      return obj;
    }

    return value;
  }

  private extractDecimalScale(fieldType: string): number {
    // Extract scale from various type string formats
    let scale = 0;

    // Format: Decimal[15e+2] or Decimal[15e-2] (Arrow's format where e+N means scale=N)
    let scaleMatch = fieldType.match(/Decimal\[?\d*e([+-]?\d+)\]?/i);
    if (scaleMatch) {
      scale = parseInt(scaleMatch[1], 10);
    } else {
      // Try parentheses format: Decimal128(15, 2)
      scaleMatch = fieldType.match(/Decimal\d*\s*\(\s*\d+\s*,\s*(\d+)\s*\)/i);
      if (scaleMatch) {
        scale = parseInt(scaleMatch[1], 10);
      } else {
        // Try angle bracket format: Decimal128<15, 2>
        scaleMatch = fieldType.match(/Decimal\d*\s*<\s*\d+\s*,\s*(\d+)\s*>/i);
        if (scaleMatch) {
          scale = parseInt(scaleMatch[1], 10);
        }
      }
    }

    return scale;
  }

  private decimalWordsToNumber(value: Record<string, number> | Uint32Array | ArrayLike<number>, wordCount: number, scale: number): number | string {
    // Arrow Decimal is stored as 32-bit integers (little-endian)
    // Decimal128 = 4 x 32-bit, Decimal256 = 8 x 32-bit
    if (wordCount === 0) return 0;

    // Convert to BigInt from 32-bit words (little-endian)
    let bigValue = BigInt(0);
    for (let i = wordCount - 1; i >= 0; i--) {
      // Handle both Uint32Array and plain objects
      const word = (value as Uint32Array)[i] ?? (value as Record<string, number>)[i.toString()] ?? 0;
      // Handle as unsigned 32-bit integer
      const unsignedWord = word >>> 0;
      bigValue = (bigValue << BigInt(32)) | BigInt(unsignedWord);
    }

    // Check if negative (two's complement - check high bit)
    const bitCount = BigInt(wordCount * 32);
    const signBit = BigInt(1) << (bitCount - BigInt(1));
    const isNegative = (bigValue & signBit) !== BigInt(0);

    if (isNegative) {
      // Convert from two's complement
      const maxValue = BigInt(1) << bitCount;
      bigValue = bigValue - maxValue;
    }

    // Apply scale (positive scale means divide, negative means multiply)
    if (scale !== 0) {
      const divisor = Math.pow(10, scale);
      const num = Number(bigValue) / divisor;

      // Return with appropriate decimal places
      if (Number.isFinite(num)) {
        return num;
      }
    }

    // No scale or very large number
    const num = Number(bigValue);
    if (Number.isFinite(num) && Math.abs(num) < Number.MAX_SAFE_INTEGER) {
      return num;
    }
    return bigValue.toString();
  }

  private normalizeTypeName(type: string): string {
    // Map Arrow type names to SQL type names
    const typeMap: Record<string, string> = {
      'Utf8': 'VARCHAR',
      'utf8': 'VARCHAR',
      'LargeUtf8': 'VARCHAR',
      'Int8': 'TINYINT',
      'Int16': 'SMALLINT',
      'Int32': 'INTEGER',
      'Int64': 'BIGINT',
      'UInt8': 'UTINYINT',
      'UInt16': 'USMALLINT',
      'UInt32': 'UINTEGER',
      'UInt64': 'UBIGINT',
      'Float16': 'FLOAT',
      'Float32': 'FLOAT',
      'Float64': 'DOUBLE',
      'Boolean': 'BOOLEAN',
      'Bool': 'BOOLEAN',
      'Date32': 'DATE',
      'Date64': 'DATE',
      'Time32': 'TIME',
      'Time64': 'TIME',
      'Timestamp': 'TIMESTAMP',
      'Binary': 'BLOB',
      'LargeBinary': 'BLOB',
      'FixedSizeBinary': 'BLOB',
      'Decimal': 'DECIMAL',
      'Decimal128': 'DECIMAL',
      'Decimal256': 'DECIMAL',
    };

    // Check for exact match first
    if (typeMap[type]) {
      return typeMap[type];
    }

    // Check for partial matches (e.g., "Timestamp(Microsecond, None)")
    for (const [key, value] of Object.entries(typeMap)) {
      if (type.startsWith(key)) {
        return value;
      }
    }

    return type;
  }
}
