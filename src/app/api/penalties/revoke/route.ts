import { NextRequest, NextResponse } from 'next/server';
import { revokeMemberPenalty } from '@/lib/member-penalty';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const body = await req.json();
    const { identity_id, alasan, petugas, password } = body;

    if (!identity_id) {
      return NextResponse.json({ error: 'Identity ID wajib diisi' }, { status: 400 });
    }
    if (!alasan || alasan.trim() === '') {
      return NextResponse.json({ error: 'Alasan pencabutan sanksi wajib disertakan' }, { status: 400 });
    }
    if (!petugas || petugas.trim() === '') {
      return NextResponse.json({ error: 'Nama petugas wajib diisi' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: 'Password otorisasi Owner wajib diisi' }, { status: 401 });
    }

    const result = revokeMemberPenalty({
      identity_id,
      alasan: alasan.trim(),
      petugas: petugas.trim(),
      password,
    });

    return NextResponse.json({
      success: true,
      message: 'Sanksi member berhasil dicabut. Status member telah dipulihkan.',
      data: result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
    const isAuthError = msg.includes('Password persetujuan Owner salah');
    return NextResponse.json({ error: msg }, { status: isAuthError ? 401 : 400 });
  }
}
