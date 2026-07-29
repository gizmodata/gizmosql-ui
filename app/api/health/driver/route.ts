import { NextResponse } from 'next/server';
import { FlightSQLClient, resolveDriverLib, driverVersion } from '@gizmodata/gizmosql-client';

/**
 * Packaging health check: proves the ADBC client stack loads and the
 * native driver library is present. CI runs this against the PACKED
 * binary before any release — the 2.6.0 regression (pkg snapshot
 * breaking the ESM driver manager) would have failed here.
 */
export async function GET() {
  try {
    const lib = resolveDriverLib();
    // Constructing the client exercises the ESM driver-manager import.
    new FlightSQLClient({ host: 'localhost', port: 31337 });
    return NextResponse.json({ ok: true, driverLib: lib, driverVersion: driverVersion() });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: detail }, { status: 500 });
  }
}
