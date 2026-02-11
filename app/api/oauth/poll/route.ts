import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { oauthBaseUrl, host, oauthServerPort, useTls, sessionUuid } = await request.json();

    if (!sessionUuid) {
      return NextResponse.json({ error: 'sessionUuid is required' }, { status: 400 });
    }

    // Prefer discovered oauthBaseUrl; fall back to manual host/port/tls
    let tokenUrl: string;
    if (oauthBaseUrl) {
      tokenUrl = `${oauthBaseUrl}/oauth/token/${sessionUuid}`;
    } else if (host) {
      const port = oauthServerPort || 31339;
      const scheme = useTls ? 'https' : 'http';
      tokenUrl = `${scheme}://${host}:${port}/oauth/token/${sessionUuid}`;
    } else {
      return NextResponse.json({ error: 'oauthBaseUrl or host is required' }, { status: 400 });
    }

    const response = await fetch(tokenUrl);

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `OAuth server returned ${response.status}: ${text}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('OAuth poll proxy error:', error);
    const message = error instanceof Error ? error.message : 'Failed to contact OAuth server';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
