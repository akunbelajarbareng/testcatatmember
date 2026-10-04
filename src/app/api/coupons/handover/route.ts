import { NextRequest, NextResponse } from 'next/server';
import { executeCouponHandover } from '@/lib/coupon-manager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = executeCouponHandover(body);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memproses penyerahan kupon';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
