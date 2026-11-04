/**
 * /api/identities/merge
 * GET  — Preview penggabungan akun (cek nomor invoice, cek bulan, status kelayakan)
 * POST — Eksekusi merge akun dengan persetujuan password owner universal
 */
import { NextRequest, NextResponse } from 'next/server';
import { previewMergeIdentities, mergeIdentities } from '@/lib/identity-manager';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get('source_id');
    const targetId = searchParams.get('target_id');

    if (!sourceId || !targetId) {
      return NextResponse.json({ error: 'source_id dan target_id wajib disertakan' }, { status: 400 });
    }

    const preview = previewMergeIdentities(sourceId, targetId);
    return NextResponse.json(preview);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const { source_id, target_id, owner_password } = body;

    if (!source_id || !target_id) {
      return NextResponse.json({ error: 'source_id dan target_id wajib diisi' }, { status: 400 });
    }

    if (!owner_password) {
      return NextResponse.json({ error: 'Password Owner wajib diisi untuk persetujuan merge' }, { status: 401 });
    }

    const result = mergeIdentities(source_id, target_id, owner_password);

    return NextResponse.json({
      success: true,
      message: `Akun ${source_id} berhasil dilebur ke dalam ${target_id}. Berhasil mengalihkan ${result.transferredInvoices} invoice, ${result.transferredCoupons} kupon fisik (${result.transferredBatches} batch), ${result.transferredOutlets} unit usaha, dan ${result.transferredAliases} alias kasir.`,
      result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
