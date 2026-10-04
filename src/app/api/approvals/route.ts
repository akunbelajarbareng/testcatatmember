/**
 * GET  /api/approvals           — list approval queue
 * POST /api/approvals/[id]/resolve — approve / tolak / abaikan
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'menunggu';
  const jenis = searchParams.get('jenis') || '';

  const rows = db.prepare(`
    SELECT a.*, b.filename, b.bulan
    FROM approvals a
    LEFT JOIN import_batches b ON b.id = a.batch_id
    WHERE a.status = ?
    ${jenis ? 'AND a.jenis = ?' : ''}
    ORDER BY a.created_at DESC
  `).all(...(jenis ? [status, jenis] : [status]));

  const counts = db.prepare(`
    SELECT jenis, COUNT(*) as jumlah FROM approvals WHERE status = 'menunggu' GROUP BY jenis
  `).all() as { jenis: string; jumlah: number }[];

  return NextResponse.json({ approvals: rows, counts });
}
