import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { oauthBaseUrl, host, oauthServerPort, useTls } = await request.json();

    // Prefer discovered oauthBaseUrl; fall back to manual host/port/tls
    let initiateUrl: string;
    if (oauthBaseUrl) {
      initiateUrl = `${oauthBaseUrl}/oauth/initiate`;
    } else if (host) {
      const port = oauthServerPort || 31339;
      const scheme = useTls ? 'https' : 'http';
      initiateUrl = `${scheme}://${host}:${port}/oauth/initiate`;
    } else {
      return NextResponse.json({ error: 'oauthBaseUrl or host is required' }, { status: 400 });
    }

    const response = await fetch(initiateUrl);

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
    console.error('OAuth initiate proxy error:', error);
    const message = error instanceof Error ? error.message : 'Failed to contact OAuth server';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
