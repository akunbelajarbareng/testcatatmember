/**
 * POST /api/outlets/transfer — Pindahkan outlet ke identity (Akun Utama) lain
 * Berlaku surut, menghitung ulang invoice terkait sesuai exclusions pemilik baru
 */
import { NextRequest, NextResponse } from 'next/server';
import { transferOutlet } from '@/lib/identity-manager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { outlet_id, target_identity_id } = body;

    if (!outlet_id || !target_identity_id) {
      return NextResponse.json({ error: 'outlet_id dan target_identity_id wajib diisi' }, { status: 400 });
    }

    transferOutlet(outlet_id, target_identity_id);

    return NextResponse.json({
      success: true,
      message: `Outlet ${outlet_id} berhasil dipindahkan ke member ${target_identity_id}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
