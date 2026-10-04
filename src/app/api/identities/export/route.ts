/**
 * GET /api/identities/export
 * Export seluruh data Member beserta Outlet, ID POS Baru, ID POS Lama, dan Aliases Kasir ke Excel (.xlsx)
 */
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';

    // Query seluruh member beserta outlet dan agregasi transaksinya
    const query = `
      SELECT 
        iden.id AS kode_akun_utama,
        iden.nama_pemilik,
        iden.status AS status_member,
        iden.alamat,
        iden.kecamatan,
        iden.kota,
        iden.provinsi,
        iden.kode_pos,
        o.id AS id_outlet,
        o.nama_outlet,
        o.tipe AS lini_bisnis,
        o.id_pos_lama,
        o.aktif AS status_outlet,
        (SELECT GROUP_CONCAT(pa.nama_pos, ' || ') FROM pos_aliases pa WHERE pa.outlet_id = o.id) AS alias_kasir,
        COALESCE(SUM(inv.jumlah), 0) AS total_transaksi,
        COALESCE(SUM(inv.poin), 0)   AS total_poin,
        COALESCE(SUM(inv.kupon), 0)  AS total_kupon
      FROM identities iden
      LEFT JOIN outlets o ON o.identity_id = iden.id
      LEFT JOIN invoices inv ON inv.outlet_id = o.id AND inv.is_excluded = 0
      WHERE 1=1
        ${q ? 'AND (iden.nama_pemilik LIKE ? OR iden.id LIKE ? OR o.nama_outlet LIKE ? OR o.id LIKE ?)' : ''}
      GROUP BY iden.id, o.id
      ORDER BY iden.id ASC, o.tipe ASC
    `;

    const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`] : [];
    const rows = db.prepare(query).all(...params) as {
      kode_akun_utama: string;
      nama_pemilik: string;
      status_member: string;
      alamat: string | null;
      kecamatan: string | null;
      kota: string | null;
      provinsi: string | null;
      kode_pos: string | null;
      id_outlet: string | null;
      nama_outlet: string | null;
      lini_bisnis: string | null;
      id_pos_lama: string | null;
      status_outlet: number | null;
      alias_kasir: string | null;
      total_transaksi: number;
      total_poin: number;
      total_kupon: number;
    }[];

    // Format data untuk Excel
    const excelRows = rows.map((r, idx) => {
      let ratePoin = '-';
      if (r.lini_bisnis === 'retail') ratePoin = 'Rp 100.000 / pt';
      else if (r.lini_bisnis === 'ukm') ratePoin = 'Rp 50.000 / pt';
      else if (r.lini_bisnis === 'grosir') ratePoin = 'Rp 200.000 / pt';

      return {
        'No': idx + 1,
        'ID Akun Utama (One Identity)': r.kode_akun_utama,
        'Nama Member (Pemilik)': r.nama_pemilik,
        'Status Member': (r.status_member || 'aktif').toUpperCase(),
        'Alamat': r.alamat || '-',
        'Kecamatan': r.kecamatan || '-',
        'Kota': r.kota || '-',
        'Provinsi': r.provinsi || '-',
        'Kode Pos': r.kode_pos || '-',
        'ID Outlet (POS Baru)': r.id_outlet || '(Belum Ada Outlet)',
        'Nama Outlet': r.nama_outlet || '-',
        'Lini Bisnis': r.lini_bisnis ? r.lini_bisnis.toUpperCase() : '-',
        'Skema Rate Poin': ratePoin,
        'ID POS Lama (Kode 131)': r.id_pos_lama || '-',
        'Status Outlet': r.status_outlet === 1 ? 'AKTIF' : r.id_outlet ? 'NONAKTIF' : '-',
        'Alias Kasir POS Terhubung': r.alias_kasir ? r.alias_kasir.replace(/ \|\| /g, '\n') : '(Belum Ada Alias)',
        'Total Transaksi (Rp)': r.total_transaksi,
        'Total Poin': r.total_poin,
        'Total Kupon': r.total_kupon,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    // Auto-fit column widths
    const colWidths = [
      { wch: 6 },  // No
      { wch: 22 }, // ID Akun Utama
      { wch: 30 }, // Nama Member
      { wch: 14 }, // Status Member
      { wch: 30 }, // Alamat
      { wch: 18 }, // Kecamatan
      { wch: 18 }, // Kota
      { wch: 20 }, // Provinsi
      { wch: 10 }, // Kode Pos
      { wch: 28 }, // ID Outlet
      { wch: 32 }, // Nama Outlet
      { wch: 14 }, // Lini Bisnis
      { wch: 18 }, // Skema Rate Poin
      { wch: 22 }, // ID POS Lama
      { wch: 14 }, // Status Outlet
      { wch: 45 }, // Alias Kasir POS
      { wch: 20 }, // Total Transaksi
      { wch: 14 }, // Total Poin
      { wch: 14 }, // Total Kupon
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Member & Outlets');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `Oriental_Member_dan_Outlet_${dateStr}.xlsx`;

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
