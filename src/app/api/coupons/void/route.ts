import { NextRequest, NextResponse } from 'next/server';
import { voidCoupons } from '@/lib/coupon-manager';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const body = await req.json();
    const result = voidCoupons(body);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat membatalkan kupon';
    const status = msg.includes('Password persetujuan') ? 401 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
