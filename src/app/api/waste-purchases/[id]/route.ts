/**
 * PUT /api/waste-purchases/[id] - Edit transaksi waste purchasing
 * DELETE /api/waste-purchases/[id] - Hapus transaksi waste purchasing
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { id } = await params;
    const existing = db.prepare(`
      SELECT w.*, o.nama_outlet, iden.nama_pemilik
      FROM waste_purchases w
      JOIN outlets o ON o.id = w.outlet_id
      JOIN identities iden ON iden.id = w.identity_id
      WHERE w.id = ?
    `).get(id) as Record<string, any> | undefined;

    if (!existing) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
    }

    const body = await request.json();
    const {
      tanggal,
      jenis_waste = 'UCO',
      berat_kg,
      harga_per_kg,
      total_rupiah,
      no_timbangan,
      catatan,
    } = body;

    const berat = Number(berat_kg);
    if (isNaN(berat) || berat <= 0) {
      return NextResponse.json({ error: 'Berat (Kg) harus berupa angka positif' }, { status: 400 });
    }

    const harga = Number(harga_per_kg) > 0 ? Number(harga_per_kg) : existing.harga_per_kg;
    const finalTotalRp = Number(total_rupiah) > 0 ? Math.round(Number(total_rupiah)) : Math.round(berat * harga);

    const rateWasteConfig = db.prepare(`SELECT nilai FROM rules_config WHERE kunci = 'rate_waste_poin'`).get() as { nilai: number } | undefined;
    const ratePoin = rateWasteConfig?.nilai ?? 10000;
    const finalPoin = Math.floor(finalTotalRp / ratePoin);

    const tgl = tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal) ? tanggal : existing.tanggal;

    db.prepare(`
      UPDATE waste_purchases
      SET tanggal = ?, jenis_waste = ?, berat_kg = ?, harga_per_kg = ?, total_rupiah = ?, poin = ?, no_timbangan = ?, catatan = ?
      WHERE id = ?
    `).run(
      tgl,
      jenis_waste,
      berat,
      harga,
      finalTotalRp,
      finalPoin,
      no_timbangan?.trim() || null,
      catatan?.trim() || null,
      id
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_log(aksi, tabel, record_id, sebelum, sesudah, keterangan)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'update_waste_purchase',
      'waste_purchases',
      id,
      JSON.stringify(existing),
      JSON.stringify({ tgl, berat, harga, finalTotalRp, finalPoin }),
      `Update pembelian waste #${id} oleh ${auth.user.username}`
    );

    const updated = db.prepare(`
      SELECT w.*, o.nama_outlet, iden.nama_pemilik
      FROM waste_purchases w
      JOIN outlets o ON o.id = w.outlet_id
      JOIN identities iden ON iden.id = w.identity_id
      WHERE w.id = ?
    `).get(id);

    return NextResponse.json({ success: true, item: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { id } = await params;
    const existing = db.prepare(`
      SELECT w.*, o.nama_outlet, iden.nama_pemilik
      FROM waste_purchases w
      JOIN outlets o ON o.id = w.outlet_id
      JOIN identities iden ON iden.id = w.identity_id
      WHERE w.id = ?
    `).get(id) as Record<string, any> | undefined;

    if (!existing) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
    }

    db.prepare(`DELETE FROM waste_purchases WHERE id = ?`).run(id);

    // Audit log
    db.prepare(`
      INSERT INTO audit_log(aksi, tabel, record_id, sebelum, keterangan)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'delete_waste_purchase',
      'waste_purchases',
      id,
      JSON.stringify(existing),
      `Hapus transaksi pembelian waste #${id} (${existing.berat_kg} kg ${existing.jenis_waste}, Rp ${existing.total_rupiah.toLocaleString('id-ID')}) oleh ${auth.user.username}`
    );

    return NextResponse.json({ success: true, message: 'Transaksi berhasil dihapus' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
