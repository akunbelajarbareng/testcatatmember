/**
 * POST /api/auth/logout — Hapus Session & Clear Cookie
 */
import { NextRequest, NextResponse } from 'next/server';
import { logoutUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('crm_session')?.value;
    if (token) {
      logoutUser(token);
    }

    const res = NextResponse.json({ success: true, message: 'Berhasil logout' });
    res.cookies.set('crm_session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal logout';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
