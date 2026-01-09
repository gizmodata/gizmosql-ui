import { FlightSQLClient } from '@gizmodata/gizmosql-client';

export interface GizmoSQLConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  useTls: boolean;
  skipTlsVerify: boolean;
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

  constructor(config: GizmoSQLConfig) {
    this.config = config;
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

    // Test connection by getting catalogs
    try {
      await this.client.getCatalogs();
    } catch (error) {
      // Log full error for debugging
      console.error('GizmoSQL connection error (full):', error);

      // Re-throw with the full message - don't strip anything
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(String(error));
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  async execute(sql: string): Promise<QueryResult> {
    if (!this.client) {
      throw new Error('Not connected to GizmoSQL server');
    }

    const startTime = Date.now();
    const table = await this.client.execute(sql);
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
  }

  async getCatalogs(): Promise<string[]> {
    if (!this.client) {
      throw new Error('Not connected to GizmoSQL server');
    }

    return this.client.getCatalogs();
  }

  async getSchemas(catalog?: string): Promise<Array<{ catalog: string; schema: string }>> {
    if (!this.client) {
      throw new Error('Not connected to GizmoSQL server');
    }

    return this.client.getSchemas(catalog);
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

    const tables = await this.client.getTables(catalog, schema);
    return tables.map((t) => ({
      catalog: t.catalog,
      schema: t.schema,
      name: t.tableName,
      type: t.tableType,
    }));
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

    const table = await this.client.execute(sql);
    return table.toArray().map((row: ArrowRow) => ({
      catalog: row.catalog_name as string,
      schema: row.schema_name as string,
      table: row.table_name as string,
      name: row.column_name as string,
      type: row.data_type as string,
      position: row.ordinal_position as number,
    }));
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
