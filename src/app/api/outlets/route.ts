/**
 * GET /api/outlets
 * List outlets — bisa difilter by identity_id
 *
 * POST /api/outlets
 * Buat outlet baru manual
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const identityId = searchParams.get('identity_id') || '';
  const q = searchParams.get('q') || '';

  const outlets = db.prepare(`
    SELECT o.*,
      iden.nama_pemilik,
      (SELECT GROUP_CONCAT(pa.nama_pos, ' || ') FROM pos_aliases pa WHERE pa.outlet_id = o.id) AS aliases,
      COALESCE(SUM(inv.jumlah), 0) AS total_transaksi,
      COALESCE(SUM(inv.poin), 0)   AS total_poin,
      COALESCE(SUM(inv.kupon), 0)  AS total_kupon
    FROM outlets o
    JOIN identities iden ON iden.id = o.identity_id
    LEFT JOIN invoices inv ON inv.outlet_id = o.id AND inv.is_excluded = 0
    WHERE 1=1
      ${identityId ? 'AND o.identity_id = ?' : ''}
      ${q ? 'AND (o.nama_outlet LIKE ? OR o.id LIKE ?)' : ''}
    GROUP BY o.id
    ORDER BY iden.nama_pemilik, o.tipe
  `).all(
    ...[
      ...(identityId ? [identityId] : []),
      ...(q ? [`%${q}%`, `%${q}%`] : []),
    ]
  );

  return NextResponse.json({ outlets });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { id, identity_id, tipe, nama_outlet, id_pos_lama } = body;

    if (!identity_id || !tipe || !nama_outlet) {
      return NextResponse.json({ error: 'identity_id, tipe, dan nama_outlet wajib diisi' }, { status: 400 });
    }

    tipe = tipe.toLowerCase().trim();
    nama_outlet = nama_outlet.trim();

    const identity = db.prepare(`SELECT id, nama_pemilik FROM identities WHERE id = ?`).get(identity_id) as { id: string; nama_pemilik: string } | undefined;
    if (!identity) return NextResponse.json({ error: 'Identity tidak ditemukan' }, { status: 404 });

    // Validasi: hanya 1 Grosir per identity (PRD 4.4)
    if (tipe === 'grosir') {
      const existingGrosir = db.prepare(`SELECT id FROM outlets WHERE identity_id = ? AND tipe = 'grosir' AND aktif = 1`).get(identity_id);
      if (existingGrosir) {
        return NextResponse.json({ error: 'Satu One Identity hanya boleh memiliki 1 outlet Grosir (PRD Bagian 4.4)' }, { status: 400 });
      }
    }

    // Auto-generate ID jika tidak diisi manual
    if (!id || !id.trim()) {
      if (tipe === 'retail') {
        id = identity_id;
      } else if (tipe === 'grosir') {
        id = `${identity_id}-01-900`;
      } else {
        // UKM
        const existingUkm = db.prepare(`SELECT id FROM outlets WHERE identity_id = ? AND id LIKE '%-100'`).all(identity_id) as { id: string }[];
        let maxSeq = 0;
        for (const row of existingUkm) {
          const parts = row.id.split('-');
          if (parts.length >= 2 && parts[parts.length - 1] === '100') {
            const seq = parseInt(parts[parts.length - 2], 10);
            if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
          }
        }
        id = `${identity_id}-${String(maxSeq + 1).padStart(2, '0')}-100`;
      }
    } else {
      id = id.trim();
    }

    // Cek duplikasi ID outlet
    const conflict = db.prepare(`SELECT id FROM outlets WHERE id = ?`).get(id);
    if (conflict) {
      return NextResponse.json({ error: `ID Outlet "${id}" sudah terdaftar` }, { status: 400 });
    }

    db.prepare(`
      INSERT INTO outlets(id, identity_id, tipe, nama_outlet, id_pos_lama)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, identity_id, tipe, nama_outlet, id_pos_lama || null);

    db.prepare(`INSERT INTO audit_log(aksi, tabel, record_id, keterangan) VALUES (?, ?, ?, ?)`).run(
      'create',
      'outlets',
      id,
      `Buat outlet ${tipe.toUpperCase()} untuk ${identity.nama_pemilik}: "${nama_outlet}" (${id})`
    );

    return NextResponse.json({ success: true, id, tipe, nama_outlet });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
