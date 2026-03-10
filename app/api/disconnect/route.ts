import { NextRequest, NextResponse } from 'next/server';
import { getConnection, deleteConnection, getConnectionCount } from '@/lib/connections';

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    const service = getConnection(sessionId);
    if (service) {
      console.log(`Disconnecting session ${sessionId} (${getConnectionCount()} active connections)`);
      await service.close();
      deleteConnection(sessionId);
      console.log(`Session ${sessionId} disconnected (${getConnectionCount()} remaining)`);
    } else {
      console.warn(`Disconnect: no connection found for session ${sessionId}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Disconnect failed';
    console.error(`Disconnect failed for session:`, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
