import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { updateIdentity } from '@/lib/identity-manager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const identity = db.prepare(`SELECT * FROM identities WHERE id = ?`).get(id);
  if (!identity) return NextResponse.json({ error: 'Identity tidak ditemukan' }, { status: 404 });

  const outlets = db.prepare(`
    SELECT o.*,
      (SELECT GROUP_CONCAT(pa.nama_pos, ' | ') FROM pos_aliases pa WHERE pa.outlet_id = o.id) AS aliases
    FROM outlets o WHERE o.identity_id = ?
  `).all(id);

  const exclusions = db.prepare(`SELECT * FROM exclusions WHERE identity_id = ? ORDER BY dari`).all(id);

  const statements = db.prepare(`
    SELECT * FROM statements WHERE identity_id = ? ORDER BY bulan DESC LIMIT 24
  `).all(id);

  return NextResponse.json({ identity, outlets, exclusions, statements });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const result = updateIdentity(id, body);
    return NextResponse.json({ success: true, id: result.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const existing = db.prepare(`SELECT * FROM identities WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!existing) return NextResponse.json({ error: 'Identity tidak ditemukan' }, { status: 404 });

    db.transaction(() => {
      // Outlets & statements automatically cascade or detach invoices via foreign keys
      db.prepare(`DELETE FROM identities WHERE id = ?`).run(id);
      db.prepare(`INSERT INTO audit_log(aksi, tabel, record_id, sebelum, keterangan) VALUES (?, ?, ?, ?, ?)`).run(
        'delete',
        'identities',
        id,
        JSON.stringify(existing),
        `Hapus identity ${id} (${existing.nama_pemilik})`
      );
    })();

    return NextResponse.json({ success: true, message: `Identity ${id} berhasil dihapus` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

