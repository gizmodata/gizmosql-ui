import { NextRequest, NextResponse } from 'next/server';
import { GizmoSQLService } from '@/lib/services/gizmosql';
import { setConnection } from '@/lib/connections';

export async function POST(request: NextRequest) {
  try {
    const { host, port, username, password, useTls, skipTlsVerify, queryTimeout } = await request.json();

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
      queryTimeout: queryTimeout || 0, // 0 = unlimited
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
    console.error('Connection error:', error);

    const message = error instanceof Error ? error.message : 'Connection failed';
    // Return 401 for authentication errors so the client knows it's a credentials issue
    const isAuthError = error instanceof Error &&
      (error.name === 'AuthenticationError' ||
       (error as unknown as Record<string, unknown>).code === 'UNAUTHENTICATED' ||
       message.toLowerCase().includes('unauthenticated') ||
       message.toLowerCase().includes('invalid credentials'));
    const status = isAuthError ? 401 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
