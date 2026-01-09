import { NextRequest, NextResponse } from 'next/server';
import { GizmoSQLService } from '@/lib/services/gizmosql';
import { setConnection } from '@/lib/connections';

export async function POST(request: NextRequest) {
  try {
    const { host, port, username, password, useTls, skipTlsVerify } = await request.json();

    if (!host) {
      return NextResponse.json({ error: 'Host is required' }, { status: 400 });
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
    setConnection(sessionId, service);

    return NextResponse.json({
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
