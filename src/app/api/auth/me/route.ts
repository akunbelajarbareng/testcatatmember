/**
 * GET /api/auth/me — Ambil Data Pengguna yang Sedang Login
 */
import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('crm_session')?.value;
    const user = await validateSession(token);

    if (!user) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    return NextResponse.json({ authenticated: true, user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error checking auth';
    return NextResponse.json({ authenticated: false, error: msg }, { status: 500 });
  }
}
