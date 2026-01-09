import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/connections';

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.headers.get('x-session-id');
    const { searchParams } = new URL(request.url);
    const catalog = searchParams.get('catalog') || undefined;
    const schema = searchParams.get('schema') || undefined;
    const table = searchParams.get('table') || undefined;

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const service = getConnection(sessionId);
    if (!service) {
      return NextResponse.json({ error: 'Session not found. Please reconnect.' }, { status: 404 });
    }

    const columns = await service.getColumns(catalog, schema, table);
    return NextResponse.json({ columns });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get columns';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
