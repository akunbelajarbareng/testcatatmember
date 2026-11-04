/**
 * POST /api/identities/[id]/status — Deaktivasi / Aktivasi Akun Utama manual (Admin/Owner)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { deactivateIdentity, activateIdentity } from '@/lib/identity-manager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const { action, alasan, cascadeOutlets } = body;

    if (!action || (action !== 'deactivate' && action !== 'activate')) {
      return NextResponse.json(
        { error: "Parameter 'action' wajib bernilai 'deactivate' atau 'activate'" },
        { status: 400 }
      );
    }

    const userName = auth.user.nama || auth.user.username || 'Owner';

    if (action === 'deactivate') {
      const reason = alasan?.trim() || 'Dinonaktifkan secara manual oleh Owner';
      const result = deactivateIdentity(id, {
        tipe: 'manual',
        alasan: reason,
        oleh: userName,
        cascadeOutlets: cascadeOutlets !== false,
      });

      return NextResponse.json({
        success: true,
        message: `Akun utama ${id} berhasil dinonaktifkan. ${result.deactivatedOutletsCount} outlet anak ikut dinonaktifkan.`,
        result,
      });
    } else {
      const result = activateIdentity(id, {
        oleh: userName,
        cascadeOutlets: cascadeOutlets === true,
      });

      return NextResponse.json({
        success: true,
        message: `Akun utama ${id} berhasil diaktifkan kembali.${cascadeOutlets ? ` ${result.reactivatedOutletsCount} outlet anak ikut diaktifkan.` : ''}`,
        result,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
