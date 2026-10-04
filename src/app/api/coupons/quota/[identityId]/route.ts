import { NextRequest, NextResponse } from 'next/server';
import { getMemberCouponQuota } from '@/lib/coupon-manager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ identityId: string }> }
) {
  try {
    const { identityId } = await params;
    if (!identityId) {
      return NextResponse.json({ error: 'Identity ID wajib diisi' }, { status: 400 });
    }

    const quota = getMemberCouponQuota(identityId);
    return NextResponse.json({ success: true, quota });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    const status = msg.includes('tidak ditemukan') ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
