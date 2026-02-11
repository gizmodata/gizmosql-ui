import { NextRequest, NextResponse } from 'next/server';
import { FlightSQLClient } from '@gizmodata/gizmosql-client';

export async function POST(request: NextRequest) {
  try {
    const { host, port, useTls, skipTlsVerify } = await request.json();

    if (!host) {
      return NextResponse.json({ error: 'Host is required' }, { status: 400 });
    }

    const client = new FlightSQLClient({
      host,
      port: port || 31337,
      plaintext: !useTls,
      tlsSkipVerify: skipTlsVerify || false,
    });

    const oauthUrl = await client.discoverOAuthUrl();
    await client.close();

    if (!oauthUrl) {
      return NextResponse.json(
        { error: 'Server does not have OAuth configured' },
        { status: 404 }
      );
    }

    return NextResponse.json({ oauthUrl });
  } catch (error) {
    console.error('OAuth discover error:', error);
    const message = error instanceof Error ? error.message : 'Failed to discover OAuth URL';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
