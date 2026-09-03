import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/connections';
import { QueryAbortedError } from '@/lib/services/gizmosql';

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

export async function POST(request: NextRequest) {
  let sql: unknown;
  try {
    const body = await request.json();
    const { sessionId, limit, offset, queryId } = body;
    sql = body.sql;

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    if (typeof sql !== 'string' || !sql) {
      return NextResponse.json({ error: 'SQL query is required' }, { status: 400 });
    }

    // Optional client-generated id that /api/query/cancel can use to stop
    // this statement while it runs
    const executeOptions = typeof queryId === 'string' && queryId ? { queryId } : {};

    const service = getConnection(sessionId);
    if (!service) {
      return NextResponse.json({ error: 'Session not found. Please reconnect.' }, { status: 404 });
    }

    // Only apply pagination to SELECT-like queries
    if (canPaginate(sql)) {
      const pageLimit = typeof limit === 'number' ? limit : 1000; // Default page size
      const pageOffset = typeof offset === 'number' ? offset : 0;

      // Request one extra row to detect if there are more results
      const paginatedSql = `SELECT * FROM (${sql.replace(/;+\s*$/, '')}) AS __paginated_query LIMIT ${pageLimit + 1} OFFSET ${pageOffset}`;

      const result = await service.execute(paginatedSql, executeOptions);

      // Check if there are more results
      const hasMore = result.rows.length > pageLimit;
      if (hasMore) {
        result.rows = result.rows.slice(0, pageLimit);
        result.rowCount = pageLimit;
      }

      return NextResponse.json({
        ...result,
        hasMore,
      });
    } else {
      // DDL, DML, and other non-SELECT statements: execute directly without pagination
      const result = await service.execute(sql, executeOptions);
      return NextResponse.json({
        ...result,
        hasMore: false,
      });
    }
  } catch (error) {
    if (error instanceof QueryAbortedError) {
      // A user cancel interrupts SELECTs on the server, but cannot reach a
      // running DDL/DML statement through the driver — say so rather than
      // implying the write was rolled back. (The connection's query timeout
      // is also applied server-side, so it does bound DDL/DML.)
      const message = !error.timedOut && typeof sql === 'string' && !canPaginate(sql)
        ? `${error.message}. DDL/DML statements cannot be interrupted on the server and may still complete.`
        : error.message;
      return NextResponse.json({ error: message, cancelled: true }, { status: 500 });
    }
    const message = error instanceof Error ? error.message : 'Query execution failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
