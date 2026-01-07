import { Router, Request, Response } from 'express';
import { GizmoSQLService } from '../services/gizmosql.js';
import { VERSION } from '../version.js';

export const apiRouter = Router();

// Store active connections by session ID
const connections = new Map<string, GizmoSQLService>();

// Health check
apiRouter.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', version: VERSION });
});

// Connect to GizmoSQL server
apiRouter.post('/connect', async (req: Request, res: Response) => {
  try {
    const { host, port, username, password, useTls, skipTlsVerify } = req.body;

    if (!host) {
      res.status(400).json({ error: 'Host is required' });
      return;
    }

    const service = new GizmoSQLService({
      host,
      port: port || 31337,
      username,
      password,
      useTls: useTls !== false, // Default to true
      skipTlsVerify: skipTlsVerify || false,
    });

    await service.connect();

    // Generate session ID
    const sessionId = crypto.randomUUID();
    connections.set(sessionId, service);

    res.json({
      success: true,
      sessionId,
      message: `Connected to ${host}:${port || 31337}`
    });
  } catch (error) {
    // Log full error for debugging
    console.error('Connection error:', error);

    // Extract detailed error message (gRPC errors may have nested details)
    let message = 'Connection failed';
    if (error instanceof Error) {
      message = error.message;
      // Check for gRPC error details
      const grpcError = error as Error & { details?: string; code?: number; cause?: Error };
      if (grpcError.details) {
        message = grpcError.details;
      } else if (grpcError.cause?.message) {
        message = grpcError.cause.message;
      }
    }
    res.status(500).json({ error: message });
  }
});

// Disconnect from GizmoSQL server
apiRouter.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    const service = connections.get(sessionId);
    if (service) {
      await service.close();
      connections.delete(sessionId);
    }

    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Disconnect failed';
    res.status(500).json({ error: message });
  }
});

// Check if SQL statement can be paginated (only SELECT-like queries)
function canPaginate(sql: string): boolean {
  // Normalize: trim whitespace and remove leading comments
  let normalized = sql.trim();

  // Remove block comments /* ... */
  normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove line comments -- ...
  normalized = normalized.replace(/--[^\n]*/g, '');
  // Trim again after removing comments
  normalized = normalized.trim();

  // Get the first keyword (case-insensitive)
  const firstWord = normalized.split(/\s+/)[0]?.toUpperCase() || '';

  // Only SELECT, WITH (CTE), TABLE, and VALUES can be paginated
  // Note: EXPLAIN could return rows but wrapping it would change semantics
  const paginatableKeywords = ['SELECT', 'WITH', 'TABLE', 'VALUES'];

  return paginatableKeywords.includes(firstWord);
}

// Execute SQL query with optional pagination
apiRouter.post('/query', async (req: Request, res: Response) => {
  try {
    const { sessionId, sql, limit, offset } = req.body;

    if (!sessionId) {
      res.status(400).json({ error: 'Session ID is required' });
      return;
    }

    if (!sql) {
      res.status(400).json({ error: 'SQL query is required' });
      return;
    }

    const service = connections.get(sessionId);
    if (!service) {
      res.status(404).json({ error: 'Session not found. Please reconnect.' });
      return;
    }

    // Only apply pagination to SELECT-like queries
    if (canPaginate(sql)) {
      const pageLimit = typeof limit === 'number' ? limit : 1000; // Default page size
      const pageOffset = typeof offset === 'number' ? offset : 0;

      // Request one extra row to detect if there are more results
      const paginatedSql = `SELECT * FROM (${sql.replace(/;+\s*$/, '')}) AS __paginated_query LIMIT ${pageLimit + 1} OFFSET ${pageOffset}`;

      const result = await service.execute(paginatedSql);

      // Check if there are more results
      const hasMore = result.rows.length > pageLimit;
      if (hasMore) {
        result.rows = result.rows.slice(0, pageLimit);
        result.rowCount = pageLimit;
      }

      res.json({
        ...result,
        hasMore,
      });
    } else {
      // DDL, DML, and other non-SELECT statements: execute directly without pagination
      const result = await service.execute(sql);
      res.json({
        ...result,
        hasMore: false,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Query execution failed';
    res.status(500).json({ error: message });
  }
});

// Get catalogs
apiRouter.get('/catalogs', async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['x-session-id'] as string;

    const service = connections.get(sessionId);
    if (!service) {
      res.status(404).json({ error: 'Session not found. Please reconnect.' });
      return;
    }

    const catalogs = await service.getCatalogs();
    res.json({ catalogs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get catalogs';
    res.status(500).json({ error: message });
  }
});

// Get schemas
apiRouter.get('/schemas', async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['x-session-id'] as string;
    const catalog = req.query.catalog as string | undefined;

    const service = connections.get(sessionId);
    if (!service) {
      res.status(404).json({ error: 'Session not found. Please reconnect.' });
      return;
    }

    const schemas = await service.getSchemas(catalog);
    res.json({ schemas });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get schemas';
    res.status(500).json({ error: message });
  }
});

// Get tables
apiRouter.get('/tables', async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['x-session-id'] as string;
    const catalog = req.query.catalog as string | undefined;
    const schema = req.query.schema as string | undefined;

    const service = connections.get(sessionId);
    if (!service) {
      res.status(404).json({ error: 'Session not found. Please reconnect.' });
      return;
    }

    const tables = await service.getTables(catalog, schema);
    res.json({ tables });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get tables';
    res.status(500).json({ error: message });
  }
});

// Get table columns
apiRouter.get('/columns', async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['x-session-id'] as string;
    const catalog = req.query.catalog as string | undefined;
    const schema = req.query.schema as string | undefined;
    const table = req.query.table as string | undefined;

    const service = connections.get(sessionId);
    if (!service) {
      res.status(404).json({ error: 'Session not found. Please reconnect.' });
      return;
    }

    const columns = await service.getColumns(catalog, schema, table);
    res.json({ columns });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get columns';
    res.status(500).json({ error: message });
  }
});
