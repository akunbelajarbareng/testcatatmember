import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { buildStatementData } from '@/lib/calc';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ('errorResponse' in auth) return auth.errorResponse;

  const url = new URL(req.url);
  const bulan = url.searchParams.get('bulan') || '2026-09';

  if (!/^\d{4}-\d{2}$/.test(bulan)) {
    return NextResponse.json({ error: 'Format bulan harus YYYY-MM' }, { status: 400 });
  }

  try {
    // Ambil semua identity yang punya transaksi di bulan ini atau punya outlet
    const [yyyy, mm] = bulan.split('-');
    const lastDay = new Date(Number(yyyy), Number(mm), 0).getDate();
    const bulanStart = `${bulan}-01`;
    const bulanEnd = `${bulan}-${String(lastDay).padStart(2, '0')}`;

    // Cari identities yang memiliki outlet aktif (kecualikan akun khusus walk-in non-member)
    const identities = db.prepare(`
      SELECT DISTINCT i.id, i.nama_pemilik, i.kota
      FROM identities i
      WHERE i.id NOT LIKE '999-%' AND EXISTS (
        SELECT 1 FROM outlets o WHERE o.identity_id = i.id AND o.aktif = 1
      )
      ORDER BY i.nama_pemilik ASC
    `).all() as { id: string; nama_pemilik: string; kota: string }[];

    const statements = [];

    for (const iden of identities) {
      try {
        const data = buildStatementData(iden.id, bulan);

        // Jangan sertakan jika sama sekali tidak ada transaksi bulan ini dan kumulatif poin 0 (PRD B3)
        if (data.bulan_transaksi === 0 && data.kumulatif_poin === 0) {
          // Bila belum ada histori sama sekali, skip agar tidak mencetak lembar kosong
          continue;
        }

        const stmtRec = db.prepare(`SELECT * FROM statements WHERE identity_id = ? AND bulan = ?`).get(iden.id, bulan);
        statements.push({
          identity: iden,
          statement: stmtRec || { status: 'draft', revisi: 0 },
          data,
        });
      } catch {
        // Skip jika error data per-identity
      }
    }

    return NextResponse.json({
      bulan,
      count: statements.length,
      statements,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
