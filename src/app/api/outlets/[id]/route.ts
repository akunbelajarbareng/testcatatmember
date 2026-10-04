/**
 * /api/outlets/[id]
 * GET    — Detail outlet
 * PATCH  — Update nama_outlet, tipe, id_pos_lama, aktif (recalc jika tipe berubah)
 * DELETE — Hapus outlet (detach aliases & reset invoices ke unmapped)
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { recalcOutlet } from '@/lib/calc';
import type { OutletTipe } from '@/lib/calc';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outlet = db.prepare(`SELECT * FROM outlets WHERE id = ?`).get(id);
  if (!outlet) return NextResponse.json({ error: 'Outlet tidak ditemukan' }, { status: 404 });

  const aliases = db.prepare(`SELECT * FROM pos_aliases WHERE outlet_id = ?`).all(id);
  const invStats = db.prepare(`
    SELECT count(*) as count, COALESCE(sum(jumlah), 0) as total, COALESCE(sum(poin), 0) as poin, COALESCE(sum(kupon), 0) as kupon
    FROM invoices WHERE outlet_id = ?
  `).get(id);

  return NextResponse.json({ outlet, aliases, invStats });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { nama_outlet, tipe, id_pos_lama, aktif } = body;

    const existing = db.prepare(`SELECT * FROM outlets WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!existing) return NextResponse.json({ error: 'Outlet tidak ditemukan' }, { status: 404 });

    const newTipe = (tipe || existing.tipe) as OutletTipe;
    const newNama = (nama_outlet !== undefined ? nama_outlet : existing.nama_outlet) as string;
    const newPosLama = id_pos_lama !== undefined ? id_pos_lama : existing.id_pos_lama;
    const newAktif = aktif !== undefined ? (aktif ? 1 : 0) : existing.aktif;

    // Jika ganti tipe ke grosir, pastikan identity belum punya grosir lain
    if (newTipe === 'grosir' && existing.tipe !== 'grosir') {
      const conflictGrosir = db.prepare(`SELECT id FROM outlets WHERE identity_id = ? AND tipe = 'grosir' AND id != ? AND aktif = 1`).get(existing.identity_id, id);
      if (conflictGrosir) {
        return NextResponse.json({ error: 'Satu Identity hanya boleh memiliki 1 outlet Grosir' }, { status: 400 });
      }
    }

    db.transaction(() => {
      db.prepare(`
        UPDATE outlets
        SET nama_outlet = ?, tipe = ?, id_pos_lama = ?, aktif = ?, updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(newNama, newTipe, newPosLama || null, newAktif, id);

      // Jika tipe berubah, hitung ulang seluruh invoice di outlet ini
      if (newTipe !== existing.tipe) {
        recalcOutlet(id);
        db.prepare(`UPDATE statements SET status = 'perlu_revisi', updated_at = datetime('now','localtime') WHERE identity_id = ?`).run(existing.identity_id);
      }

      db.prepare(`
        INSERT INTO audit_log(aksi, tabel, record_id, sebelum, sesudah, keterangan)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'update',
        'outlets',
        id,
        JSON.stringify(existing),
        JSON.stringify({ ...existing, nama_outlet: newNama, tipe: newTipe }),
        `Update outlet ${id}: ${newNama} [${newTipe}]`
      );
    })();

    return NextResponse.json({ success: true, id, tipe: newTipe, nama_outlet: newNama });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const existing = db.prepare(`SELECT * FROM outlets WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!existing) return NextResponse.json({ error: 'Outlet tidak ditemukan' }, { status: 404 });

    let unlinkedInvoices = 0;

    db.transaction(() => {
      // 1. Reset invoice: outlet_id = NULL, poin = 0, kupon = 0
      const invRes = db.prepare(`
        UPDATE invoices
        SET outlet_id = NULL, poin = 0, kupon = 0, is_excluded = 0
        WHERE outlet_id = ?
      `).run(id);
      unlinkedInvoices = invRes.changes;

      // 2. Hapus pos_aliases
      db.prepare(`DELETE FROM pos_aliases WHERE outlet_id = ?`).run(id);

      // 3. Hapus outlet
      db.prepare(`DELETE FROM outlets WHERE id = ?`).run(id);

      // 4. Update statement status
      db.prepare(`UPDATE statements SET status = 'perlu_revisi', updated_at = datetime('now','localtime') WHERE identity_id = ?`).run(existing.identity_id);

      // 5. Audit log
      db.prepare(`
        INSERT INTO audit_log(aksi, tabel, record_id, sebelum, keterangan)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        'delete',
        'outlets',
        id,
        JSON.stringify(existing),
        `Hapus outlet ${id} (${existing.nama_outlet}). ${unlinkedInvoices} invoice dilepas ke antrean belum terpetakan.`
      );
    })();

    return NextResponse.json({
      success: true,
      message: `Outlet ${existing.nama_outlet} berhasil dihapus. ${unlinkedInvoices} invoice dikembalikan ke status belum terpetakan.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
