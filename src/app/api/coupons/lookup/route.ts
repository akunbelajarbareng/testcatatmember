import { NextRequest, NextResponse } from 'next/server';
import { lookupCouponWinner } from '@/lib/coupon-manager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('q') || '';
    const periode = url.searchParams.get('periode') || '2026-09';

    if (!q.trim()) {
      return NextResponse.json({ error: 'Nomor kupon yang dicari wajib diisi' }, { status: 400 });
    }

    const result = lookupCouponWinner(q, periode);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = body.query || body.q || '';
    const periode = body.periode || '2026-09';

    if (!query.trim()) {
      return NextResponse.json({ error: 'Nomor kupon yang dicari wajib diisi' }, { status: 400 });
    }

    const result = lookupCouponWinner(query, periode);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
