/**
 * POST /api/auth/change-password — Ubah Password Owner Universal (Admin Only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { setOwnerPassword, requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { current_password, new_password } = await request.json();
    await setOwnerPassword(current_password, new_password);
    return NextResponse.json({ success: true, message: 'Password Owner berhasil diperbarui' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

