/**
 * POST /api/outlets/[id]/status — Deaktivasi / Aktivasi Lini Bisnis (Outlet) manual (Admin/Owner)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { deactivateOutlet, activateOutlet } from '@/lib/identity-manager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const { action, alasan } = body;

    if (!action || (action !== 'deactivate' && action !== 'activate')) {
      return NextResponse.json(
        { error: "Parameter 'action' wajib bernilai 'deactivate' atau 'activate'" },
        { status: 400 }
      );
    }

    const userName = auth.user.nama || auth.user.username || 'Owner';

    if (action === 'deactivate') {
      const reason = alasan?.trim() || 'Lini bisnis ditutup pemilik';
      const result = deactivateOutlet(id, {
        tipe: 'manual',
        alasan: reason,
        oleh: userName,
      });

      return NextResponse.json({
        success: true,
        message: `Outlet ${id} berhasil dinonaktifkan.${result.identityDeactivated ? ' Akun utama ikut dinonaktifkan karena seluruh lini bisnisnya nonaktif.' : ''}`,
        result,
      });
    } else {
      const result = activateOutlet(id, {
        oleh: userName,
      });

      return NextResponse.json({
        success: true,
        message: `Outlet ${id} berhasil diaktifkan kembali.${result.identityReactivated ? ' Akun utama dipulihkan ke status aktif.' : ''}`,
        result,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
