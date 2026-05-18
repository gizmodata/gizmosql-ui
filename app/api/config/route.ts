import { NextResponse } from 'next/server';

// Runtime client config. No session required — reflects launch-time flags only.
export const dynamic = 'force-dynamic';

function isTruthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes'].includes((value || '').toLowerCase());
}

export async function GET() {
  return NextResponse.json({
    enableTpch: isTruthy(process.env.GIZMOSQL_UI_ENABLE_TPCH),
  });
}
