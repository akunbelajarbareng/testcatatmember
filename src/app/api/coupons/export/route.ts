import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('q') || '';
    const periode = url.searchParams.get('periode') || '';
    const outlet_id = url.searchParams.get('outlet_id') || '';
    const status = url.searchParams.get('status') || '';

    let whereSql = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (q) {
      whereSql += ` AND (c.nomor_kupon LIKE ? OR i.nama_pemilik LIKE ? OR c.identity_id LIKE ? OR c.whatsapp LIKE ? OR o.nama_outlet LIKE ?)`;
      const queryPattern = `%${q}%`;
      params.push(queryPattern, queryPattern, queryPattern, queryPattern, queryPattern);
    }

    if (periode) {
      whereSql += ` AND c.periode_kupon = ?`;
      params.push(periode);
    }

    if (outlet_id) {
      whereSql += ` AND c.outlet_asal_id = ?`;
      params.push(outlet_id);
    }

    if (status && status !== 'all') {
      whereSql += ` AND c.status = ?`;
      params.push(status);
    }

    const rows = db.prepare(`
      SELECT
        c.id,
        c.nomor_kupon,
        c.periode_kupon,
        c.nomor_urut,
        c.status,
        c.tanggal_serah,
        c.petugas,
        c.tipe_penerima,
        c.nama_walk_in,
        c.no_hp_walk_in,
        c.no_invoice,
        COALESCE(c.whatsapp, i.whatsapp, '-') AS whatsapp,
        c.created_at AS waktu_input,
        c.batch_id,
        i.id AS identity_id,
        i.nama_pemilik,
        COALESCE(i.alamat, '-') AS alamat,
        COALESCE(i.kota, '-') AS kota,
        COALESCE(i.kecamatan, '-') AS kecamatan,
        o.id AS outlet_id,
        o.nama_outlet,
        UPPER(o.tipe) AS outlet_tipe,
        COALESCE(b.keterangan, '-') AS keterangan_batch
      FROM coupons c
      JOIN identities i ON c.identity_id = i.id
      JOIN outlets o ON c.outlet_asal_id = o.id
      LEFT JOIN coupon_batches b ON c.batch_id = b.id
      ${whereSql}
      ORDER BY c.periode_kupon DESC, c.nomor_urut ASC
    `).all(...params) as any[];

    const excelRows = rows.map((r, idx) => {
      const isWalkIn = r.tipe_penerima === 'walk_in';
      return {
        'No': idx + 1,
        'Nomor Kupon': r.nomor_kupon,
        'Periode': r.periode_kupon,
        'Nomor Urut': r.nomor_urut,
        'Status': r.status === 'aktif' ? 'AKTIF' : 'VOID (BATAL)',
        'Tipe Penerima': isWalkIn ? 'CASH WALK-IN' : 'MEMBER',
        'ID Member': isWalkIn ? 'NON-MEMBER' : r.identity_id,
        'Nama Pelanggan': isWalkIn ? (r.nama_walk_in || 'Walk-In') : r.nama_pemilik,
        'No. WhatsApp/HP': isWalkIn ? (r.no_hp_walk_in || r.whatsapp) : r.whatsapp,
        'No. Struk POS': r.no_invoice || '-',
        'Outlet Asal': isWalkIn ? 'Kasir Retail Non-Member' : r.nama_outlet,
        'ID Outlet': isWalkIn ? '-' : r.outlet_id,
        'Lini Bisnis': isWalkIn ? 'RETAIL' : r.outlet_tipe,
        'Tanggal Serah': r.tanggal_serah,
        'Petugas': r.petugas,
        'Waktu Input': r.waktu_input,
        'ID Batch': r.batch_id || '-',
        'Alamat': isWalkIn ? 'Transaksi Kasir Langsung' : r.alamat,
        'Kota': isWalkIn ? (r.no_invoice ? `Struk: ${r.no_invoice}` : '-') : r.kota,
        'Keterangan': r.keterangan_batch,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    worksheet['!cols'] = [
      { wch: 6 },  // No
      { wch: 22 }, // Nomor Kupon
      { wch: 12 }, // Periode
      { wch: 10 }, // Nomor Urut
      { wch: 14 }, // Status
      { wch: 16 }, // Tipe Penerima
      { wch: 16 }, // ID Member
      { wch: 28 }, // Nama Pelanggan
      { wch: 18 }, // No WhatsApp/HP
      { wch: 18 }, // No. Struk POS
      { wch: 24 }, // Outlet Asal
      { wch: 18 }, // ID Outlet
      { wch: 14 }, // Lini Bisnis
      { wch: 14 }, // Tanggal Serah
      { wch: 16 }, // Petugas
      { wch: 20 }, // Waktu Input
      { wch: 10 }, // ID Batch
      { wch: 30 }, // Alamat
      { wch: 16 }, // Kota
      { wch: 25 }, // Keterangan
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Kupon Undian');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `Oriental_Rekap_Kupon_Undian_${dateStr}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
