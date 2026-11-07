/**
 * GET  /api/identities          — list semua identities
 * POST /api/identities          — buat identity baru
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const limit = Math.max(1, Number(searchParams.get('limit') || 10));
  const offset = (page - 1) * limit;

  const includeMerged = searchParams.get('include_merged') === '1';
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (!includeMerged) {
    conditions.push(`i.status != 'merged'`);
  }

  // Kecualikan akun sistem Walk-In non-member dari master member CRM
  conditions.push(`i.id NOT LIKE '999-%'`);

  if (q) {
    conditions.push(`(i.nama_pemilik LIKE ? OR i.id LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) as c FROM identities i ${where}`).get(...params) as { c: number }).c;

  const sortBy = searchParams.get('sort_by') || 'id';
  const order = (searchParams.get('order') || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  let orderByClause = `i.id ${order}`;
  if (sortBy === 'nama_pemilik') orderByClause = `i.nama_pemilik ${order}`;
  else if (sortBy === 'kota') orderByClause = `i.kota ${order}`;
  else if (sortBy === 'jumlah_outlet') orderByClause = `jumlah_outlet ${order}`;
  else if (sortBy === 'total_poin') orderByClause = `total_poin ${order}`;
  else if (sortBy === 'total_kupon') orderByClause = `total_kupon ${order}`;
  else if (sortBy === 'status') orderByClause = `i.status ${order}`;

  const identities = db.prepare(`
    SELECT
      i.id,
      i.nama_pemilik,
      i.alamat,
      i.kota,
      i.status,
      COUNT(DISTINCT o.id) AS jumlah_outlet,
      COALESCE(SUM(inv.poin), 0)  AS total_poin,
      COALESCE(SUM(inv.kupon), 0) AS total_kupon
    FROM identities i
    LEFT JOIN outlets o   ON o.identity_id = i.id AND o.aktif = 1
    LEFT JOIN invoices inv ON inv.outlet_id = o.id AND inv.is_excluded = 0
    ${where}
    GROUP BY i.id
    ORDER BY ${orderByClause}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as unknown[];

  return NextResponse.json({ identities, total, page, limit });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    let { id, nama_pemilik, alamat, kecamatan, kota, kode_pos, provinsi, create_retail_outlet = true, retail_name } = body;

    if (!nama_pemilik || !nama_pemilik.trim()) {
      return NextResponse.json({ error: 'Nama pemilik wajib diisi' }, { status: 400 });
    }
    nama_pemilik = nama_pemilik.trim();

    // Auto-generate ID jika tidak diisi manual
    if (!id || !id.trim()) {
      const now = new Date();
      const yy = String(now.getFullYear()).slice(2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const prefix = `102-${yy}${mm}${dd}-`;

      const existing = db.prepare(`SELECT id FROM identities WHERE id LIKE ?`).all(`${prefix}%`) as { id: string }[];
      let maxSeq = 0;
      for (const row of existing) {
        const parts = row.id.split('-');
        if (parts.length >= 3) {
          const seq = parseInt(parts[2], 10);
          if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        }
      }
      id = `${prefix}${String(maxSeq + 1).padStart(2, '0')}`;
    } else {
      id = id.trim();
    }

    // Cek duplikasi ID
    const conflict = db.prepare(`SELECT id FROM identities WHERE id = ?`).get(id);
    if (conflict) {
      return NextResponse.json({ error: `ID One Identity "${id}" sudah terdaftar` }, { status: 400 });
    }

    db.transaction(() => {
      // 1. Simpan identity
      db.prepare(`
        INSERT INTO identities(id, nama_pemilik, alamat, kecamatan, kota, kode_pos, provinsi)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, nama_pemilik, alamat || '', kecamatan || '', kota || 'WATAMPONE', kode_pos || '', provinsi || 'SULAWESI SELATAN');

      // 2. Buat default outlet Retail jika dipilih (PRD 4.2)
      if (create_retail_outlet) {
        const outletId = id; // Akun Retail memakai ID identitas
        const namaOutlet = retail_name?.trim() || `${nama_pemilik} - RETAIL`;
        db.prepare(`
          INSERT INTO outlets(id, identity_id, tipe, nama_outlet)
          VALUES (?, ?, 'retail', ?)
        `).run(outletId, id, namaOutlet);
      }

      // 3. Audit log
      db.prepare(`INSERT INTO audit_log(aksi, tabel, record_id, keterangan) VALUES (?, ?, ?, ?)`).run(
        'create',
        'identities',
        id,
        `Buat Akun Utama: ${nama_pemilik} (${id})`
      );
    })();

    return NextResponse.json({ success: true, id, nama_pemilik });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
