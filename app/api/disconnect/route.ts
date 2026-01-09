import { NextRequest, NextResponse } from 'next/server';
import { getConnection, deleteConnection } from '@/lib/connections';

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    const service = getConnection(sessionId);
    if (service) {
      await service.close();
      deleteConnection(sessionId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Disconnect failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
