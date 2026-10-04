/**
 * POST /api/auth/verify — Verifikasi Password Owner Universal
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyOwnerPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const valid = verifyOwnerPassword(password);
    return NextResponse.json({ valid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
