import { NextResponse } from 'next/server';
import { VERSION } from '@/lib/version';

export async function GET() {
  return NextResponse.json({ status: 'ok', version: VERSION });
}
