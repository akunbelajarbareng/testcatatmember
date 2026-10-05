/**
 * GET /api/waste-purchases - List transaksi waste purchasing dengan filter & summary
 * POST /api/waste-purchases - Catat transaksi pembelian limbah (UCO) baru
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || ''; // YYYY-MM
    const outletId = searchParams.get('outlet_id') || '';
    const identityId = searchParams.get('identity_id') || '';
    const q = (searchParams.get('q') || '').trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '25', 10)));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const params: (string | number)[] = [];

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      conditions.push('w.tanggal >= ? AND w.tanggal <= ?');
      const [y, m] = month.split('-');
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      params.push(`${month}-01`, `${month}-${String(lastDay).padStart(2, '0')}`);
    }

    if (outletId) {
      conditions.push('w.outlet_id = ?');
      params.push(outletId);
    }

    if (identityId) {
      conditions.push('w.identity_id = ?');
      params.push(identityId);
    }

    if (q) {
      conditions.push(`(
        o.nama_outlet LIKE ? OR
        o.id LIKE ? OR
        iden.nama_pemilik LIKE ? OR
        iden.id LIKE ? OR
        w.no_timbangan LIKE ? OR
        w.catatan LIKE ?
      )`);
      const term = `%${q}%`;
      params.push(term, term, term, term, term, term);
    }

    const whereClause = conditions.join(' AND ');

    // Total count for pagination
    const countRow = db.prepare(`
      SELECT COUNT(w.id) AS total
      FROM waste_purchases w
      JOIN outlets o ON o.id = w.outlet_id
      JOIN identities iden ON iden.id = w.identity_id
      WHERE ${whereClause}
    `).get(...params) as { total: number };

    const total = countRow?.total || 0;
    const totalPages = Math.ceil(total / limit);

    // Items
    const items = db.prepare(`
      SELECT
        w.*,
        o.nama_outlet,
        o.tipe AS outlet_tipe,
        iden.nama_pemilik,
        iden.kota
      FROM waste_purchases w
      JOIN outlets o ON o.id = w.outlet_id
      JOIN identities iden ON iden.id = w.identity_id
      WHERE ${whereClause}
      ORDER BY w.tanggal DESC, w.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // Summary totals for current filter
    const summaryRow = db.prepare(`
      SELECT
        COUNT(w.id)               AS total_trx,
        COALESCE(SUM(w.berat_kg), 0)     AS total_berat_kg,
        COALESCE(SUM(w.total_rupiah), 0) AS total_rupiah,
        COALESCE(SUM(w.poin), 0)         AS total_poin
      FROM waste_purchases w
      JOIN outlets o ON o.id = w.outlet_id
      JOIN identities iden ON iden.id = w.identity_id
      WHERE ${whereClause}
    `).get(...params) as {
      total_trx: number;
      total_berat_kg: number;
      total_rupiah: number;
      total_poin: number;
    };

    // Reference pricing & rate from rules_config
    const hargaConfig = db.prepare(`SELECT nilai FROM rules_config WHERE kunci = 'harga_uco_per_kg'`).get() as { nilai: number } | undefined;
    const rateWasteConfig = db.prepare(`SELECT nilai FROM rules_config WHERE kunci = 'rate_waste_poin'`).get() as { nilai: number } | undefined;

    return NextResponse.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      summary: {
        total_trx: summaryRow.total_trx,
        total_berat_kg: summaryRow.total_berat_kg,
        total_rupiah: summaryRow.total_rupiah,
        total_poin: summaryRow.total_poin,
      },
      config: {
        harga_uco_per_kg: hargaConfig?.nilai ?? 8000,
        rate_waste_poin: rateWasteConfig?.nilai ?? 10000,
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const {
      outlet_id,
      tanggal,
      jenis_waste = 'UCO',
      berat_kg,
      harga_per_kg,
      total_rupiah,
      no_timbangan,
      catatan,
    } = body;

    if (!outlet_id) {
      return NextResponse.json({ error: 'Outlet wajib dipilih' }, { status: 400 });
    }

    const berat = Number(berat_kg);
    if (isNaN(berat) || berat <= 0) {
      return NextResponse.json({ error: 'Berat (Kg) harus berupa angka positif' }, { status: 400 });
    }

    // Lookup outlet & its identity_id
    const outlet = db.prepare(`
      SELECT o.id, o.identity_id, o.nama_outlet, iden.nama_pemilik
      FROM outlets o
      JOIN identities iden ON iden.id = o.identity_id
      WHERE o.id = ?
    `).get(outlet_id) as { id: string; identity_id: string; nama_outlet: string; nama_pemilik: string } | undefined;

    if (!outlet) {
      return NextResponse.json({ error: 'Outlet tidak ditemukan' }, { status: 404 });
    }

    // Lookup rules
    const hargaConfig = db.prepare(`SELECT nilai FROM rules_config WHERE kunci = 'harga_uco_per_kg'`).get() as { nilai: number } | undefined;
    const rateWasteConfig = db.prepare(`SELECT nilai FROM rules_config WHERE kunci = 'rate_waste_poin'`).get() as { nilai: number } | undefined;

    const finalHarga = Number(harga_per_kg) > 0 ? Number(harga_per_kg) : (hargaConfig?.nilai ?? 8000);
    const finalTotalRp = Number(total_rupiah) > 0 ? Math.round(Number(total_rupiah)) : Math.round(berat * finalHarga);

    const ratePoin = rateWasteConfig?.nilai ?? 10000;
    const finalPoin = Math.floor(finalTotalRp / ratePoin); // Rp 10.000 = 1 Poin Oriental

    const tgl = tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal)
      ? tanggal
      : new Date().toISOString().split('T')[0];

    const result = db.prepare(`
      INSERT INTO waste_purchases (
        outlet_id, identity_id, tanggal, jenis_waste,
        berat_kg, harga_per_kg, total_rupiah, poin,
        no_timbangan, catatan, petugas
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      outlet.id,
      outlet.identity_id,
      tgl,
      jenis_waste,
      berat,
      finalHarga,
      finalTotalRp,
      finalPoin,
      no_timbangan?.trim() || null,
      catatan?.trim() || null,
      auth.user.username || 'staff'
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_log(aksi, tabel, record_id, keterangan)
      VALUES (?, ?, ?, ?)
    `).run(
      'create_waste_purchase',
      'waste_purchases',
      String(result.lastInsertRowid),
      `Pembelian ${berat} kg ${jenis_waste} (Rp ${finalTotalRp.toLocaleString('id-ID')}, ${finalPoin} Poin) dari outlet ${outlet.nama_outlet} (${outlet.id}) oleh ${auth.user.username}`
    );

    const newRow = db.prepare(`
      SELECT w.*, o.nama_outlet, iden.nama_pemilik
      FROM waste_purchases w
      JOIN outlets o ON o.id = w.outlet_id
      JOIN identities iden ON iden.id = w.identity_id
      WHERE w.id = ?
    `).get(result.lastInsertRowid);

    return NextResponse.json({ success: true, item: newRow }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
