/**
 * GET  /api/approvals           — list approval queue with search & pagination
 * POST /api/approvals/[id]/resolve — approve / tolak / abaikan
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'menunggu';
  const jenis = searchParams.get('jenis') || '';
  const q = (searchParams.get('q') || '').trim();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limitParam = searchParams.get('limit');
  const limit = limitParam !== null ? Math.max(0, parseInt(limitParam)) : 20;

  const whereClauses: string[] = [];
  const params: any[] = [];

  if (status !== 'all') {
    whereClauses.push('a.status = ?');
    params.push(status);
  }

  if (jenis) {
    whereClauses.push('a.jenis = ?');
    params.push(jenis);
  }

  if (q) {
    whereClauses.push(`(
      a.payload LIKE ? OR
      a.jenis LIKE ? OR
      COALESCE(b.filename, '') LIKE ? OR
      CAST(a.id AS TEXT) LIKE ?
    )`);
    const qWildcard = `%${q}%`;
    params.push(qWildcard, qWildcard, qWildcard, qWildcard);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Count total matching items
  const totalRow = db.prepare(`
    SELECT COUNT(*) as total
    FROM approvals a
    LEFT JOIN import_batches b ON b.id = a.batch_id
    ${whereSql}
  `).get(...params) as { total: number };
  const total = totalRow?.total || 0;

  // Query rows
  let rowsQuery = `
    SELECT a.*, b.filename, b.bulan
    FROM approvals a
    LEFT JOIN import_batches b ON b.id = a.batch_id
    ${whereSql}
    ORDER BY a.created_at DESC
  `;

  let rows: any[];
  if (limit > 0) {
    rowsQuery += ` LIMIT ? OFFSET ?`;
    const offset = (page - 1) * limit;
    rows = db.prepare(rowsQuery).all(...params, limit, offset);
  } else {
    rows = db.prepare(rowsQuery).all(...params);
  }

  const counts = db.prepare(`
    SELECT jenis, COUNT(*) as jumlah FROM approvals WHERE status = 'menunggu' GROUP BY jenis
  `).all() as { jenis: string; jumlah: number }[];

  return NextResponse.json({
    approvals: rows,
    counts,
    total,
    page,
    limit,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 1,
  });
}
