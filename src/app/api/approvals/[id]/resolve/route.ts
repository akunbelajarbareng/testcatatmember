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
  const auth = await requireAuth(request, { role: 'admin' });
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

        case 'transaksi_outlet_nonaktif': {
          const mode = data?.mode || 'reopen_and_link';
          const outletId = payload.outlet_id;
          const identityId = payload.identity_id;

          if (mode === 'reopen_and_link') {
            // 1. Reopen outlet
            db.prepare(`
              UPDATE outlets SET
                aktif = 1,
                nonaktif_tipe = NULL,
                nonaktif_alasan = NULL,
                nonaktif_tanggal = NULL,
                nonaktif_oleh = NULL,
                updated_at = datetime('now','localtime')
              WHERE id = ?
            `).run(outletId);

            // 2. Reopen identity if needed
            if (identityId) {
              db.prepare(`
                UPDATE identities SET
                  status = 'aktif',
                  nonaktif_tipe = NULL,
                  nonaktif_alasan = NULL,
                  nonaktif_tanggal = NULL,
                  nonaktif_oleh = NULL,
                  updated_at = datetime('now','localtime')
                WHERE id = ? AND status = 'nonaktif'
              `).run(identityId);
            }
          }

          // Link the invoice and recalculate points & coupons
          const outlet = db.prepare(`SELECT tipe, identity_id FROM outlets WHERE id = ?`).get(outletId) as { tipe: import('@/lib/calc').OutletTipe; identity_id: string } | undefined;
          if (outlet) {
            const { hitungInvoice } = require('@/lib/calc');
            const invoices = db.prepare(`
              SELECT id, jumlah FROM invoices
              WHERE no_invoice = ? AND nama_pos = ?
            `).all(payload.no_invoice, payload.nama_pos) as { id: number; jumlah: number }[];

            const exclusions = db.prepare(`SELECT dari, sampai FROM exclusions WHERE identity_id = ?`).all(outlet.identity_id) as { dari: string; sampai: string }[];
            const updateInv = db.prepare(`UPDATE invoices SET outlet_id = ?, poin = ?, kupon = ?, is_excluded = ? WHERE id = ?`);

            for (const inv of invoices) {
              const isExcluded = exclusions.some(ex => payload.tanggal >= ex.dari && payload.tanggal <= ex.sampai);
              if (isExcluded) {
                updateInv.run(outletId, 0, 0, 1, inv.id);
              } else {
                const hasil = hitungInvoice(inv.jumlah, outlet.tipe);
                updateInv.run(outletId, hasil.poin, hasil.kupon, 0, inv.id);
              }
            }

            db.prepare(`UPDATE statements SET status = 'perlu_revisi', updated_at = datetime('now','localtime') WHERE identity_id = ?`).run(outlet.identity_id);
          }
          break;
        }

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
