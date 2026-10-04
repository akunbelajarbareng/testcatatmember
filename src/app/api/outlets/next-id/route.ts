/**
 * GET /api/outlets/next-id — Auto-generate nomor ID Outlet berikutnya
 * Sesuai PRD Bagian 4:
 *   Retail = 102-YYMMDD-NN
 *   Grosir = 102-YYMMDD-NN-01-900
 *   UKM ke-n = 102-YYMMDD-NN-nn-100 (01-100, 02-100, dst)
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const identityId = searchParams.get('identity_id');
    const tipe = (searchParams.get('tipe') || 'ukm').toLowerCase();

    if (!identityId) {
      return NextResponse.json({ error: 'identity_id wajib disertakan' }, { status: 400 });
    }

    if (tipe === 'retail') {
      return NextResponse.json({ nextId: identityId, tipe: 'retail' });
    }

    if (tipe === 'grosir') {
      const nextId = `${identityId}-01-900`;
      const existing = db.prepare(`SELECT id FROM outlets WHERE id = ?`).get(nextId);
      return NextResponse.json({ nextId, tipe: 'grosir', exists: !!existing });
    }

    // UKM ke-n: cari suffix -100
    const existingUkm = db.prepare(`
      SELECT id FROM outlets WHERE identity_id = ? AND id LIKE '%-100'
    `).all(identityId) as { id: string }[];

    let maxSeq = 0;
    for (const row of existingUkm) {
      // Format: 102-YYMMDD-NN-nn-100
      const parts = row.id.split('-');
      if (parts.length >= 2 && parts[parts.length - 1] === '100') {
        const seq = parseInt(parts[parts.length - 2], 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }

    const nextSeq = String(maxSeq + 1).padStart(2, '0');
    const nextId = `${identityId}-${nextSeq}-100`;

    return NextResponse.json({ nextId, tipe: 'ukm', seq: maxSeq + 1 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
