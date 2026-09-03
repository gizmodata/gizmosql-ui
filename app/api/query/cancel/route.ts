import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/connections';

/**
 * Cancel a statement started by POST /api/query with the same queryId.
 * Responds with { cancelled: true } if the statement was running or queued,
 * { cancelled: false } if it had already finished (or was never seen).
 */
export async function POST(request: NextRequest) {
  try {
    const { sessionId, queryId } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    if (typeof queryId !== 'string' || !queryId) {
      return NextResponse.json({ error: 'Query ID is required' }, { status: 400 });
    }

    const service = getConnection(sessionId);
    if (!service) {
      return NextResponse.json({ error: 'Session not found. Please reconnect.' }, { status: 404 });
    }

    const cancelled = service.cancelQuery(queryId);
    return NextResponse.json({ cancelled });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cancel failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
