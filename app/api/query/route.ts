import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/connections';

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
  try {
    const { sessionId, sql, limit, offset } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    if (!sql) {
      return NextResponse.json({ error: 'SQL query is required' }, { status: 400 });
    }

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

      const result = await service.execute(paginatedSql);

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
      const result = await service.execute(sql);
      return NextResponse.json({
        ...result,
        hasMore: false,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Query execution failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
