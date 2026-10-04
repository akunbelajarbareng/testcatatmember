/**
 * GET  /api/aliases             — list semua alias + outlet
 * POST /api/aliases             — petakan nama POS ke outlet (berlaku surut)
 * DELETE /api/aliases           — hapus alias
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { transferAlias, detachAlias } from '@/lib/identity-manager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const belumPetakan = searchParams.get('belum') === '1';

  if (belumPetakan) {
    // Nama di transaksi yang belum terpetakan ke outlet mana pun
    const rows = db.prepare(`
      SELECT DISTINCT i.nama_pos,
        COUNT(i.id)     AS jumlah_transaksi,
        SUM(i.jumlah)   AS total_jumlah
      FROM invoices i
      WHERE i.outlet_id IS NULL AND i.nama_pos != 'CASH'
      ${q ? "AND i.nama_pos LIKE ?" : ""}
      GROUP BY i.nama_pos
      ORDER BY jumlah_transaksi DESC
    `).all(...(q ? [`%${q}%`] : []));
    return NextResponse.json({ rows });
  }

  const aliases = db.prepare(`
    SELECT pa.id, pa.nama_pos, pa.outlet_id, pa.created_at,
      o.nama_outlet, o.tipe, o.identity_id,
      iden.nama_pemilik
    FROM pos_aliases pa
    JOIN outlets o ON o.id = pa.outlet_id
    JOIN identities iden ON iden.id = o.identity_id
    ${q ? "WHERE pa.nama_pos LIKE ?" : ""}
    ORDER BY pa.nama_pos
  `).all(...(q ? [`%${q}%`] : []));

  return NextResponse.json({ aliases });
}

export async function POST(request: NextRequest) {
  try {
    const { nama_pos, outlet_id } = await request.json();

    if (!nama_pos || !outlet_id) {
      return NextResponse.json({ error: 'nama_pos dan outlet_id wajib diisi' }, { status: 400 });
    }

    const outlet = db.prepare(`SELECT id FROM outlets WHERE id = ?`).get(outlet_id);
    if (!outlet) return NextResponse.json({ error: 'Outlet tidak ditemukan' }, { status: 404 });

    const result = transferAlias(nama_pos, outlet_id);

    return NextResponse.json({
      success: true,
      message: `"${nama_pos}" berhasil dipetakan ke outlet ${outlet_id} (${result.updatedInvoices} invoice diperbarui)`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    const result = detachAlias(id);

    return NextResponse.json({
      success: true,
      message: `Alias "${result.nama_pos}" dilepaskan (${result.unlinkedInvoices} invoice dikembalikan ke status belum terpetakan)`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
