import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('q') || '';
    const periode = url.searchParams.get('periode') || '';
    const outlet_id = url.searchParams.get('outlet_id') || '';
    const status = url.searchParams.get('status') || ''; // 'aktif' | 'void' | ''
    const tipe = url.searchParams.get('tipe') || 'all'; // 'all' | 'member' | 'walk_in'
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(10, parseInt(url.searchParams.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    let whereSql = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (q) {
      whereSql += ` AND (
        c.nomor_kupon LIKE ? OR
        i.nama_pemilik LIKE ? OR
        c.identity_id LIKE ? OR
        c.whatsapp LIKE ? OR
        o.nama_outlet LIKE ? OR
        c.nama_walk_in LIKE ? OR
        c.no_hp_walk_in LIKE ? OR
        c.no_invoice LIKE ?
      )`;
      const queryPattern = `%${q}%`;
      params.push(queryPattern, queryPattern, queryPattern, queryPattern, queryPattern, queryPattern, queryPattern, queryPattern);
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

    if (tipe === 'walk_in') {
      whereSql += ` AND c.tipe_penerima = 'walk_in'`;
    } else if (tipe === 'member') {
      whereSql += ` AND (c.tipe_penerima IS NULL OR c.tipe_penerima != 'walk_in')`;
    }

    // Count total rows
    const countRow = db.prepare(`
      SELECT COUNT(*) as total
      FROM coupons c
      JOIN identities i ON c.identity_id = i.id
      JOIN outlets o ON c.outlet_asal_id = o.id
      ${whereSql}
    `).get(...params) as { total: number };

    const total = countRow.total;
    const totalPages = Math.ceil(total / limit) || 1;

    // Fetch paginated rows
    const rows = db.prepare(`
      SELECT
        c.id,
        c.nomor_kupon,
        c.periode_kupon,
        c.nomor_urut,
        c.status,
        c.tanggal_serah,
        c.petugas,
        c.whatsapp AS kupon_whatsapp,
        c.created_at,
        c.batch_id,
        c.tipe_penerima,
        c.nama_walk_in,
        c.no_hp_walk_in,
        c.no_invoice,
        i.id AS identity_id,
        i.nama_pemilik,
        i.kota,
        i.whatsapp AS member_whatsapp,
        o.id AS outlet_id,
        o.nama_outlet,
        o.tipe AS outlet_tipe,
        b.keterangan AS batch_keterangan
      FROM coupons c
      JOIN identities i ON c.identity_id = i.id
      JOIN outlets o ON c.outlet_asal_id = o.id
      LEFT JOIN coupon_batches b ON c.batch_id = b.id
      ${whereSql}
      ORDER BY c.created_at DESC, c.nomor_urut ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // Summary stats
    const stats = db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'aktif' THEN 1 END) AS total_aktif,
        COUNT(CASE WHEN status = 'void' THEN 1 END) AS total_void,
        COUNT(CASE WHEN tipe_penerima = 'walk_in' AND status = 'aktif' THEN 1 END) AS total_walkin,
        COUNT(DISTINCT CASE WHEN tipe_penerima != 'walk_in' AND identity_id NOT LIKE '999-%' THEN identity_id END) AS total_member,
        (SELECT COUNT(*) FROM coupon_batches WHERE status = 'aktif') AS total_batches
      FROM coupons
    `).get() as {
      total_aktif: number;
      total_void: number;
      total_walkin: number;
      total_member: number;
      total_batches: number;
    };

    return NextResponse.json({
      success: true,
      coupons: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      stats,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
