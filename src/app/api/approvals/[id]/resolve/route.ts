/**
 * POST /api/approvals/[id]/resolve
 * Resolve approval: disetujui | ditolak | diabaikan
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { petakanAlias } from '@/lib/importer';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  const { id } = await params;
  try {
    const { keputusan, data } = await request.json();
    // keputusan: 'disetujui' | 'ditolak' | 'diabaikan'
    // data: optional payload spesifik per jenis (e.g. { outlet_id } untuk petakan alias)

    const approval = db.prepare(`SELECT * FROM approvals WHERE id = ?`).get(id) as {
      id: number;
      jenis: string;
      payload: string;
      status: string;
    } | undefined;

    if (!approval) return NextResponse.json({ error: 'Approval tidak ditemukan' }, { status: 404 });
    if (approval.status !== 'menunggu') {
      return NextResponse.json({ error: 'Approval sudah diselesaikan' }, { status: 400 });
    }

    const payload = JSON.parse(approval.payload);

    // Tindak lanjut berdasarkan jenis
    if (keputusan === 'disetujui') {
      switch (approval.jenis) {
        case 'nama_belum_dipetakan':
          // data.outlet_id harus disertakan
          if (data?.outlet_id) {
            petakanAlias(payload.nama_pos, data.outlet_id);
          }
          break;

        case 'kode_lama_131':
          if (data?.outlet_id && payload.nama) {
            petakanAlias(payload.nama, data.outlet_id);
          }
          break;

        case 'outlet_tanpa_induk': {
          // Jika parent identity sudah dibuat oleh owner, buat outlet-nya
          const parentExists = db.prepare(`SELECT id FROM identities WHERE id = ?`).get(payload.parent);
          if (parentExists) {
            const existingOutlet = db.prepare(`SELECT id FROM outlets WHERE id = ?`).get(payload.kode);
            if (!existingOutlet) {
              db.prepare(`
                INSERT INTO outlets(id, identity_id, tipe, nama_outlet)
                VALUES (?, ?, ?, ?)
              `).run(payload.kode, payload.parent, payload.tipe || 'ukm', payload.nama);
            }
          }
          break;
        }

        case 'kode_tabrakan':
        case 'anomali_master':
          // Owner sudah review / menyelesaikan secara manual
          break;

        default:
          break;
      }
    }

    db.prepare(`
      UPDATE approvals
      SET status = ?, resolved_at = datetime('now','localtime'), resolved_note = ?
      WHERE id = ?
    `).run(keputusan, data?.note || '', id);

    db.prepare(`INSERT INTO audit_log(aksi, tabel, record_id, keterangan) VALUES (?, ?, ?, ?)`)
      .run('approve', 'approvals', String(id), `${approval.jenis} → ${keputusan}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
