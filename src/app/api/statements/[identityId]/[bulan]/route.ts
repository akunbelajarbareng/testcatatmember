/**
 * GET /api/statements/[identityId]/[bulan]
 * Build + return statement data for printing
 *
 * POST /api/statements/[identityId]/[bulan]/finalize
 * Lock statement as Final
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { buildStatementData } from '@/lib/calc';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ identityId: string; bulan: string }> }
) {
  const auth = await requireAuth(_req);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { identityId, bulan } = await params;

  const identity = db.prepare(`SELECT id FROM identities WHERE id = ?`).get(identityId);
  if (!identity) return NextResponse.json({ error: 'Identity tidak ditemukan' }, { status: 404 });

  if (!/^\d{4}-\d{2}$/.test(bulan)) {
    return NextResponse.json({ error: 'Format bulan harus YYYY-MM' }, { status: 400 });
  }

  try {
    const data = buildStatementData(identityId, bulan);

    // Check/upsert statement record
    const existing = db.prepare(`SELECT * FROM statements WHERE identity_id = ? AND bulan = ?`).get(identityId, bulan) as {
      status: string;
      revisi: number;
    } | undefined;

    if (!existing) {
      db.prepare(`
        INSERT INTO statements(identity_id, bulan, total_transaksi, total_poin, total_kupon, kumulatif_poin, kumulatif_kupon)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(identityId, bulan, data.bulan_transaksi, data.bulan_poin, data.bulan_kupon, data.kumulatif_poin, data.kumulatif_kupon);
    } else {
      db.prepare(`
        UPDATE statements SET
          total_transaksi = ?, total_poin = ?, total_kupon = ?,
          kumulatif_poin = ?, kumulatif_kupon = ?,
          updated_at = datetime('now','localtime')
        WHERE identity_id = ? AND bulan = ?
      `).run(data.bulan_transaksi, data.bulan_poin, data.bulan_kupon, data.kumulatif_poin, data.kumulatif_kupon, identityId, bulan);
    }

    const statementRecord = db.prepare(`SELECT * FROM statements WHERE identity_id = ? AND bulan = ?`).get(identityId, bulan);

    // Peringatan: ada nama belum terpetakan di bulan ini?
    const [yyyy, mm] = bulan.split('-');
    const lastDay = new Date(Number(yyyy), Number(mm), 0).getDate();
    const warningCount = (db.prepare(`
      SELECT COUNT(DISTINCT nama_pos) as c
      FROM invoices
      WHERE outlet_id IS NULL
        AND nama_pos != 'CASH'
        AND tanggal >= ? AND tanggal <= ?
    `).get(`${bulan}-01`, `${bulan}-${String(lastDay).padStart(2, '0')}`) as { c: number }).c;

    return NextResponse.json({
      statement: statementRecord,
      data,
      peringatan_belum_petakan: warningCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
