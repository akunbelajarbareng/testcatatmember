import { NextRequest, NextResponse } from 'next/server';
import { applyMemberPenalty } from '@/lib/member-penalty';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const body = await req.json();
    const {
      identity_id,
      jenis_sanksi,
      dari,
      sampai,
      reset_saldo_lama,
      alasan,
      petugas,
      password,
    } = body;

    if (!identity_id) {
      return NextResponse.json({ error: 'Identity ID wajib diisi' }, { status: 400 });
    }
    if (!jenis_sanksi || (jenis_sanksi !== 'temporary' && jenis_sanksi !== 'permanent')) {
      return NextResponse.json({ error: 'Jenis sanksi harus temporary atau permanent' }, { status: 400 });
    }
    if (!dari) {
      return NextResponse.json({ error: 'Tanggal mulai sanksi wajib diisi' }, { status: 400 });
    }
    if (jenis_sanksi === 'temporary' && !sampai) {
      return NextResponse.json({ error: 'Tanggal selesai sanksi wajib diisi untuk sanksi periode tertentu' }, { status: 400 });
    }
    if (!alasan || alasan.trim() === '') {
      return NextResponse.json({ error: 'Alasan sanksi pelanggaran wajib disertakan' }, { status: 400 });
    }
    if (!petugas || petugas.trim() === '') {
      return NextResponse.json({ error: 'Nama petugas wajib diisi' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: 'Password otorisasi Owner wajib diisi' }, { status: 401 });
    }

    const result = applyMemberPenalty({
      identity_id,
      jenis_sanksi,
      dari,
      sampai: sampai || undefined,
      reset_saldo_lama: Boolean(reset_saldo_lama),
      alasan: alasan.trim(),
      petugas: petugas.trim(),
      password,
    });

    return NextResponse.json({
      success: true,
      message: 'Sanksi pelanggaran member berhasil diberlakukan.',
      data: result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
    const isAuthError = msg.includes('Password persetujuan Owner salah');
    return NextResponse.json({ error: msg }, { status: isAuthError ? 401 : 400 });
  }
}
