import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/connections';

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.headers.get('x-session-id');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const service = getConnection(sessionId);
    if (!service) {
      return NextResponse.json({ error: 'Session not found. Please reconnect.' }, { status: 404 });
    }

    const catalogs = await service.getCatalogs();
    return NextResponse.json({ catalogs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get catalogs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
