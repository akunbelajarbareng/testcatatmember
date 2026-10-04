/**
 * GET /api/settings - Ambil rules_config dan status sistem (Admin Only)
 * POST /api/settings - Update nilai konversi rate poin / kupon (Admin Only)
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const rules = db.prepare(`SELECT * FROM rules_config ORDER BY kunci`).all();
    const auditCount = (db.prepare(`SELECT COUNT(*) as c FROM audit_log`).get() as { c: number }).c;
    const batchCount = (db.prepare(`SELECT COUNT(*) as c FROM import_batches`).get() as { c: number }).c;

    return NextResponse.json({
      rules,
      stats: {
        auditCount,
        batchCount,
        dbPath: 'data/oriental_crm.db',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const body = await req.json();
    const { key, nilai, keterangan } = body;

    if (!key || nilai === undefined) {
      return NextResponse.json({ error: 'key dan nilai wajib' }, { status: 400 });
    }

    const num = Number(nilai);
    if (isNaN(num) || num <= 0) {
      return NextResponse.json({ error: 'Nilai harus angka positif' }, { status: 400 });
    }

    db.prepare(`
      UPDATE rules_config
      SET nilai = ?, keterangan = COALESCE(?, keterangan), updated_at = datetime('now','localtime')
      WHERE kunci = ?
    `).run(num, keterangan || null, key);

    db.prepare(`INSERT INTO audit_log(aksi, tabel, record_id, keterangan) VALUES (?, ?, ?, ?)`).run(
      'update_rule',
      'rules_config',
      key,
      `Ubah nilai ${key} menjadi ${num} (oleh ${auth.user.username})`
    );

    return NextResponse.json({ success: true, key, nilai: num });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

