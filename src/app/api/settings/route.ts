/**
 * GET /api/settings - Ambil rules_config dan status sistem dari Firestore (Admin Only)
 * POST /api/settings - Update nilai konversi rate poin / kupon ke Firestore (Admin Only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  getAllRulesRowsFirestore,
  updateRuleConfigFirestore,
  getSystemStatsFirestore,
} from '@/lib/firestore-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const rules = await getAllRulesRowsFirestore();
    const stats = await getSystemStatsFirestore();

    return NextResponse.json({
      rules,
      stats: {
        auditCount: stats.auditCount,
        batchCount: stats.batchCount,
        identitiesCount: stats.identitiesCount,
        outletsCount: stats.outletsCount,
        couponsCount: stats.couponsCount,
        invoicesCount: stats.invoicesCount,
        dbEngine: 'Firebase Firestore (Cloud)',
        dbProject: process.env.FIREBASE_PROJECT_ID || 'oriental-crm-221e3',
      },
      backups: [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const body = await req.json();
    const { key, nilai, keterangan } = body;

    if (!key || nilai === undefined) {
      return NextResponse.json({ error: 'key dan nilai wajib' }, { status: 400 });
    }

    const num = Number(nilai);
    if (isNaN(num) || num <= 0) {
      return NextResponse.json({ error: 'Nilai harus angka positif' }, { status: 400 });
    }

    await updateRuleConfigFirestore(key, num, keterangan);

    return NextResponse.json({ success: true, key, nilai: num });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
