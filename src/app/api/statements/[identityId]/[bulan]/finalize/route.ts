/**
 * POST /api/statements/[identityId]/[bulan]/finalize
 * Kunci statement menjadi Final (PRD Bagian 7)
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { buildStatementData, PERIODE_MONTHS } from '@/lib/calc';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ identityId: string; bulan: string }> }
) {
  const auth = await requireAuth(_req, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  const { identityId, bulan } = await params;

  const existing = db.prepare(`SELECT * FROM statements WHERE identity_id = ? AND bulan = ?`).get(identityId, bulan) as {
    id: number;
    status: string;
    revisi: number;
  } | undefined;

  if (!existing) {
    return NextResponse.json({ error: 'Statement belum dibuat (akses GET terlebih dahulu)' }, { status: 400 });
  }

  if (existing.status === 'final') {
    return NextResponse.json({ error: 'Statement sudah final' }, { status: 400 });
  }

  const data = buildStatementData(identityId, bulan);

  db.prepare(`
    UPDATE statements SET
      status = 'final',
      revisi = ?,
      total_transaksi = ?, total_poin = ?, total_kupon = ?,
      kumulatif_poin = ?, kumulatif_kupon = ?,
      updated_at = datetime('now','localtime')
    WHERE identity_id = ? AND bulan = ?
  `).run(
    existing.revisi,
    data.bulan_transaksi, data.bulan_poin, data.bulan_kupon,
    data.kumulatif_poin, data.kumulatif_kupon,
    identityId, bulan
  );

  // PRD 7 [USULAN]: tandai statement bulan sesudahnya sebagai perlu_revisi
  // karena kumulatif berubah
  const bulanIdx = PERIODE_MONTHS.indexOf(bulan);
  if (bulanIdx >= 0) {
    for (let i = bulanIdx + 1; i < PERIODE_MONTHS.length; i++) {
      db.prepare(`
        UPDATE statements SET status = 'perlu_revisi', updated_at = datetime('now','localtime')
        WHERE identity_id = ? AND bulan = ? AND status = 'final'
      `).run(identityId, PERIODE_MONTHS[i]);
    }
  }

  db.prepare(`INSERT INTO audit_log(aksi, tabel, record_id, keterangan) VALUES (?, ?, ?, ?)`)
    .run('finalize', 'statements', `${identityId}/${bulan}`, `Statement dikunci Final`);

  return NextResponse.json({ success: true, status: 'final' });
}
