import { NextRequest, NextResponse } from 'next/server';
import { getMemberPenaltyInfo } from '@/lib/member-penalty';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ identityId: string }> }
) {
  try {
    const { identityId } = await params;
    if (!identityId) {
      return NextResponse.json({ error: 'Identity ID wajib disertakan' }, { status: 400 });
    }

    const penaltyInfo = getMemberPenaltyInfo(identityId);
    return NextResponse.json({
      success: true,
      data: penaltyInfo,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
    const isNotFound = msg.includes('tidak ditemukan');
    return NextResponse.json({ error: msg }, { status: isNotFound ? 404 : 400 });
  }
}
