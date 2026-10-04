import { NextRequest, NextResponse } from 'next/server';
import { getMonthlyCouponStock } from '@/lib/coupon-manager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const periode = url.searchParams.get('periode') || '2026-09';

    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return NextResponse.json({ error: 'Format periode harus YYYY-MM' }, { status: 400 });
    }

    const stock = getMonthlyCouponStock(periode);
    return NextResponse.json({ success: true, stock });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
