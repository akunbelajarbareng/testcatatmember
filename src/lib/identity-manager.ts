/**
 * identity-manager.ts — Core service for Identity, Outlet & Alias Lifecycle
 * Provides atomic, transaction-safe operations for:
 * - Renumbering & Editing Identity IDs (with full cascade)
 * - Transferring Outlets to other Identities
 * - Transferring & Detaching POS Aliases (with invoice recalculation)
 * - Safe Data Cleansing
 */
import db from './db';
import type { OutletTipe } from './calc';

// ---------------------------------------------------------------------------
// Rate & Rule Helpers
// ---------------------------------------------------------------------------
function getRateForOutlet(outletId: string): { rate: number; nilaiKupon: number; outletTipe: OutletTipe; identityId: string } {
  const outlet = db.prepare(`SELECT tipe, identity_id FROM outlets WHERE id = ?`).get(outletId) as
    | { tipe: OutletTipe; identity_id: string }
    | undefined;

  if (!outlet) throw new Error(`Outlet tidak ditemukan: ${outletId}`);

  const rateRow = db.prepare(`SELECT nilai FROM rules_config WHERE kunci = ?`).get(`rate_${outlet.tipe}`) as { nilai: number } | undefined;
  const rate = rateRow?.nilai ?? (outlet.tipe === 'grosir' ? 200000 : outlet.tipe === 'retail' ? 100000 : 50000);

  const kuponRow = db.prepare(`SELECT nilai FROM rules_config WHERE kunci = 'nilai_kupon'`).get() as { nilai: number } | undefined;
  const nilaiKupon = kuponRow?.nilai ?? 150000;

  return { rate, nilaiKupon, outletTipe: outlet.tipe, identityId: outlet.identity_id };
}

// ---------------------------------------------------------------------------
// 1. UPDATE IDENTITY ID (RENUMBERING) & PROFILE
// ---------------------------------------------------------------------------
export interface UpdateIdentityPayload {
  new_id?: string;
  nama_pemilik?: string;
  alamat?: string;
  kecamatan?: string;
  kota?: string;
  kode_pos?: string;
  provinsi?: string;
  whatsapp?: string;
  status?: string;
}

export function updateIdentity(oldId: string, payload: UpdateIdentityPayload): { id: string } {
  const existing = db.prepare(`SELECT * FROM identities WHERE id = ?`).get(oldId) as Record<string, unknown> | undefined;
  if (!existing) throw new Error(`Identity "${oldId}" tidak ditemukan`);

  const newId = payload.new_id?.trim() || oldId;

  // Cek jika ganti ID dan ID tujuan sudah dipakai oleh identitas lain
  if (newId !== oldId) {
    const conflict = db.prepare(`SELECT id FROM identities WHERE id = ?`).get(newId);
    if (conflict) throw new Error(`ID baru "${newId}" sudah digunakan oleh identitas lain`);
  }

  const doUpdate = db.transaction(() => {
    // Jika ganti ID, lakukan rename pada identities (cascade otomatis menangani foreign keys)
    if (newId !== oldId) {
      db.prepare(`UPDATE identities SET id = ? WHERE id = ?`).run(newId, oldId);

      // Update ID outlet anak yang berawalan oldId jika formatnya mengikuti standar
      const outlets = db.prepare(`SELECT id FROM outlets WHERE identity_id = ?`).all(newId) as { id: string }[];
      for (const o of outlets) {
        if (o.id.startsWith(oldId)) {
          const updatedOutletId = o.id.replace(oldId, newId);
          if (updatedOutletId !== o.id) {
            db.prepare(`UPDATE outlets SET id = ? WHERE id = ?`).run(updatedOutletId, o.id);
          }
        }
      }
    }

    // Update field profil jika ada
    const activeId = newId;
    const nama_pemilik = payload.nama_pemilik !== undefined ? payload.nama_pemilik : existing.nama_pemilik;
    const alamat = payload.alamat !== undefined ? payload.alamat : existing.alamat;
    const kecamatan = payload.kecamatan !== undefined ? payload.kecamatan : existing.kecamatan;
    const kota = payload.kota !== undefined ? payload.kota : existing.kota;
    const kode_pos = payload.kode_pos !== undefined ? payload.kode_pos : existing.kode_pos;
    const provinsi = payload.provinsi !== undefined ? payload.provinsi : existing.provinsi;
    const whatsapp = payload.whatsapp !== undefined ? payload.whatsapp : existing.whatsapp;
    const status = payload.status !== undefined ? payload.status : existing.status;

    db.prepare(`
      UPDATE identities SET
        nama_pemilik = ?, alamat = ?, kecamatan = ?, kota = ?, kode_pos = ?, provinsi = ?, whatsapp = ?,
        status = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(nama_pemilik, alamat, kecamatan, kota, kode_pos, provinsi, whatsapp, status, activeId);

    // Audit Log
    db.prepare(`
      INSERT INTO audit_log(aksi, tabel, record_id, sebelum, sesudah, keterangan)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'update',
      'identities',
      activeId,
      JSON.stringify(existing),
      JSON.stringify({ ...existing, ...payload, id: activeId }),
      newId !== oldId ? `Renumbering ID dari ${oldId} ke ${newId}` : `Update profil identity ${activeId}`
    );
  });

  doUpdate();
  return { id: newId };
}

// ---------------------------------------------------------------------------
// 2. TRANSFER OUTLET KE IDENTITY LAIN
// ---------------------------------------------------------------------------
export function transferOutlet(outletId: string, targetIdentityId: string): void {
  const outlet = db.prepare(`SELECT * FROM outlets WHERE id = ?`).get(outletId) as Record<string, unknown> | undefined;
  if (!outlet) throw new Error(`Outlet "${outletId}" tidak ditemukan`);

  const targetIdentity = db.prepare(`SELECT id, nama_pemilik FROM identities WHERE id = ?`).get(targetIdentityId);
  if (!targetIdentity) throw new Error(`Target Identity "${targetIdentityId}" tidak ditemukan`);

  if (outlet.identity_id === targetIdentityId) return; // sudah sama

  const sourceIdentityId = String(outlet.identity_id);

  const doTransfer = db.transaction(() => {
    // 1. Pindahkan outlet
    db.prepare(`UPDATE outlets SET identity_id = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(targetIdentityId, outletId);

    // 2. Recalculate invoice terkait outlet ini dengan exclusion milik target identity
    const exclusions = db.prepare(`SELECT dari, sampai FROM exclusions WHERE identity_id = ?`).all(targetIdentityId) as { dari: string; sampai: string }[];
    const { rate, nilaiKupon } = getRateForOutlet(outletId);

    const invoices = db.prepare(`SELECT id, tanggal, jumlah FROM invoices WHERE outlet_id = ?`).all(outletId) as { id: number; tanggal: string; jumlah: number }[];
    const updateInv = db.prepare(`UPDATE invoices SET poin = ?, kupon = ?, is_excluded = ? WHERE id = ?`);

    for (const inv of invoices) {
      const isExcluded = exclusions.some((ex) => inv.tanggal >= ex.dari && inv.tanggal <= ex.sampai);
      if (isExcluded) {
        updateInv.run(0, 0, 1, inv.id);
      } else {
        const poin = Math.floor(inv.jumlah / rate);
        const kupon = Math.floor(inv.jumlah / nilaiKupon);
        updateInv.run(poin, kupon, 0, inv.id);
      }
    }

    // 3. Tandai statement asal dan tujuan sebagai perlu_revisi
    db.prepare(`UPDATE statements SET status = 'perlu_revisi' WHERE identity_id IN (?, ?)`).run(sourceIdentityId, targetIdentityId);

    // 4. Audit Log
    db.prepare(`
      INSERT INTO audit_log(aksi, tabel, record_id, sebelum, sesudah, keterangan)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'update',
      'outlets',
      outletId,
      JSON.stringify({ identity_id: sourceIdentityId }),
      JSON.stringify({ identity_id: targetIdentityId }),
      `Transfer outlet ${outletId} dari ${sourceIdentityId} ke ${targetIdentityId}`
    );
  });

  doTransfer();
}

// ---------------------------------------------------------------------------
// 3. TRANSFER / REMAP ALIAS KE OUTLET LAIN
// ---------------------------------------------------------------------------
export function transferAlias(aliasIdentifier: number | string, targetOutletId: string): { nama_pos: string; updatedInvoices: number } {
  // Ambil alias record (bisa via id number atau nama_pos string)
  const alias = (
    typeof aliasIdentifier === 'number' || /^\d+$/.test(String(aliasIdentifier))
      ? db.prepare(`SELECT * FROM pos_aliases WHERE id = ?`).get(Number(aliasIdentifier))
      : db.prepare(`SELECT * FROM pos_aliases WHERE nama_pos = ?`).get(String(aliasIdentifier))
  ) as { id: number; nama_pos: string; outlet_id: string } | undefined;

  let namaPos = '';
  let oldOutletId: string | null = null;

  if (alias) {
    namaPos = alias.nama_pos;
    oldOutletId = alias.outlet_id;
  } else if (typeof aliasIdentifier === 'string') {
    namaPos = aliasIdentifier;
  } else {
    throw new Error(`Alias tidak ditemukan`);
  }

  const { rate, nilaiKupon, identityId } = getRateForOutlet(targetOutletId);
  const exclusions = db.prepare(`SELECT dari, sampai FROM exclusions WHERE identity_id = ?`).all(identityId) as { dari: string; sampai: string }[];

  let invoiceCount = 0;

  const doTransfer = db.transaction(() => {
    // 1. Upsert pos_aliases record
    if (alias) {
      db.prepare(`UPDATE pos_aliases SET outlet_id = ? WHERE id = ?`).run(targetOutletId, alias.id);
    } else {
      db.prepare(`INSERT OR REPLACE INTO pos_aliases(nama_pos, outlet_id) VALUES (?, ?)`).run(namaPos, targetOutletId);
    }

    // 2. Update SEMUA invoices dengan nama_pos ini (baik yang sebelumnya belum dipetakan ataupun dari outlet lama)
    const invoices = db.prepare(`SELECT id, tanggal, jumlah FROM invoices WHERE nama_pos = ?`).all(namaPos) as { id: number; tanggal: string; jumlah: number }[];
    invoiceCount = invoices.length;

    const updateInv = db.prepare(`UPDATE invoices SET outlet_id = ?, poin = ?, kupon = ?, is_excluded = ? WHERE id = ?`);

    for (const inv of invoices) {
      const isExcluded = exclusions.some((ex) => inv.tanggal >= ex.dari && inv.tanggal <= ex.sampai);
      if (isExcluded) {
        updateInv.run(targetOutletId, 0, 0, 1, inv.id);
      } else {
        const poin = Math.floor(inv.jumlah / rate);
        const kupon = Math.floor(inv.jumlah / nilaiKupon);
        updateInv.run(targetOutletId, poin, kupon, 0, inv.id);
      }
    }

    // 3. Tandai statement sebagai perlu revisi
    const identityIds = [identityId];
    if (oldOutletId) {
      const oldOutlet = db.prepare(`SELECT identity_id FROM outlets WHERE id = ?`).get(oldOutletId) as { identity_id: string } | undefined;
      if (oldOutlet) identityIds.push(oldOutlet.identity_id);
    }
    for (const iId of identityIds) {
      db.prepare(`UPDATE statements SET status = 'perlu_revisi' WHERE identity_id = ?`).run(iId);
    }

    // 4. Audit Log
    db.prepare(`
      INSERT INTO audit_log(aksi, tabel, record_id, sebelum, sesudah, keterangan)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'update',
      'pos_aliases',
      namaPos,
      JSON.stringify({ outlet_id: oldOutletId }),
      JSON.stringify({ outlet_id: targetOutletId }),
      `Transfer alias "${namaPos}" ke outlet ${targetOutletId} (${invoiceCount} invoice dihitung ulang)`
    );
  });

  doTransfer();
  return { nama_pos: namaPos, updatedInvoices: invoiceCount };
}

// ---------------------------------------------------------------------------
// 4. DETACH / UNLINK ALIAS (KEMBALIKAN KE STATUS UNMAPPED)
// ---------------------------------------------------------------------------
export function detachAlias(aliasIdentifier: number | string): { nama_pos: string; unlinkedInvoices: number } {
  const alias = (
    typeof aliasIdentifier === 'number' || /^\d+$/.test(String(aliasIdentifier))
      ? db.prepare(`SELECT * FROM pos_aliases WHERE id = ?`).get(Number(aliasIdentifier))
      : db.prepare(`SELECT * FROM pos_aliases WHERE nama_pos = ?`).get(String(aliasIdentifier))
  ) as { id: number; nama_pos: string; outlet_id: string } | undefined;

  if (!alias) throw new Error(`Alias tidak ditemukan`);

  const { id, nama_pos, outlet_id } = alias;
  let unlinkedCount = 0;

  const doDetach = db.transaction(() => {
    // 1. Hapus dari pos_aliases
    db.prepare(`DELETE FROM pos_aliases WHERE id = ?`).run(id);

    // 2. Reset semua invoice dengan nama_pos ini: outlet_id = NULL, poin = 0, kupon = 0
    const result = db.prepare(`
      UPDATE invoices
      SET outlet_id = NULL, poin = 0, kupon = 0, is_excluded = 0
      WHERE nama_pos = ?
    `).run(nama_pos);

    unlinkedCount = result.changes;

    // 3. Tandai statement outlet sebelumnya sebagai perlu_revisi
    const oldOutlet = db.prepare(`SELECT identity_id FROM outlets WHERE id = ?`).get(outlet_id) as { identity_id: string } | undefined;
    if (oldOutlet) {
      db.prepare(`UPDATE statements SET status = 'perlu_revisi' WHERE identity_id = ?`).run(oldOutlet.identity_id);
    }

    // 4. Audit Log
    db.prepare(`
      INSERT INTO audit_log(aksi, tabel, record_id, sebelum, keterangan)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'delete',
      'pos_aliases',
      String(id),
      JSON.stringify(alias),
      `Detach alias "${nama_pos}" dari outlet ${outlet_id}. ${unlinkedCount} invoice dilepas kembali ke antrean belum terpetakan.`
    );
  });

  doDetach();
  return { nama_pos, unlinkedInvoices: unlinkedCount };
}

// ---------------------------------------------------------------------------
// 5. DATA CLEANSING: RESET DATA KOTOR (MEMPERTAHANKAN TRANSAKSI & PAK CATUR)
// ---------------------------------------------------------------------------
export interface CleanseResult {
  unlinkedInvoices: number;
  removedIdentities: number;
  removedOutlets: number;
  removedAliases: number;
  preservedIdentities: string[];
}

export function cleanseMasterData(options: { keepPakCatur?: boolean; specificKeepIds?: string[] } = {}): CleanseResult {
  const keepPakCatur = options.keepPakCatur ?? true;
  const keepIds = new Set<string>(options.specificKeepIds || []);

  if (keepPakCatur) {
    keepIds.add('102-260901-01'); // Pak Catur
  }

  let unlinkedInvoices = 0;
  let removedIdentities = 0;
  let removedOutlets = 0;
  let removedAliases = 0;

  const doCleanse = db.transaction(() => {
    // 1. Identifikasi outlet yang akan dipertahankan
    const keepOutlets = db.prepare(`
      SELECT id FROM outlets WHERE identity_id IN (${Array.from(keepIds).map(() => '?').join(',') || "''"})
    `).all(...Array.from(keepIds)) as { id: string }[];
    const keepOutletIds = new Set(keepOutlets.map((o) => o.id));

    // 2. Reset invoice yang terhubung ke outlet yang akan dibersihkan
    if (keepOutletIds.size > 0) {
      const placeholders = Array.from(keepOutletIds).map(() => '?').join(',');
      const res = db.prepare(`
        UPDATE invoices
        SET outlet_id = NULL, poin = 0, kupon = 0, is_excluded = 0
        WHERE outlet_id IS NOT NULL AND outlet_id NOT IN (${placeholders})
      `).run(...Array.from(keepOutletIds));
      unlinkedInvoices = res.changes;

      // Hapus aliases di luar outlet yang dipertahankan
      const aliasRes = db.prepare(`
        DELETE FROM pos_aliases WHERE outlet_id NOT IN (${placeholders})
      `).run(...Array.from(keepOutletIds));
      removedAliases = aliasRes.changes;

      // Hapus outlets di luar yang dipertahankan
      const outletRes = db.prepare(`
        DELETE FROM outlets WHERE id NOT IN (${placeholders})
      `).run(...Array.from(keepOutletIds));
      removedOutlets = outletRes.changes;
    } else {
      const res = db.prepare(`
        UPDATE invoices
        SET outlet_id = NULL, poin = 0, kupon = 0, is_excluded = 0
        WHERE outlet_id IS NOT NULL
      `).run();
      unlinkedInvoices = res.changes;

      removedAliases = db.prepare(`DELETE FROM pos_aliases`).run().changes;
      removedOutlets = db.prepare(`DELETE FROM outlets`).run().changes;
    }

    // 3. Hapus identities di luar yang dipertahankan
    if (keepIds.size > 0) {
      const placeholders = Array.from(keepIds).map(() => '?').join(',');
      const idRes = db.prepare(`
        DELETE FROM identities WHERE id NOT IN (${placeholders})
      `).run(...Array.from(keepIds));
      removedIdentities = idRes.changes;

      // Bersihkan statements untuk identity yang dihapus
      db.prepare(`
        DELETE FROM statements WHERE identity_id NOT IN (${placeholders})
      `).run(...Array.from(keepIds));
    } else {
      removedIdentities = db.prepare(`DELETE FROM identities`).run().changes;
      db.prepare(`DELETE FROM statements`).run();
    }

    // 4. Audit Log
    db.prepare(`
      INSERT INTO audit_log(aksi, tabel, keterangan)
      VALUES (?, ?, ?)
    `).run(
      'cleanse',
      'master_data',
      `Data cleansing: ${removedIdentities} identities, ${removedOutlets} outlets, ${removedAliases} aliases dibersihkan. ${unlinkedInvoices} invoices dilepas ke unmapped. Preserved: ${Array.from(keepIds).join(', ')}`
    );
  });

  doCleanse();

  return {
    unlinkedInvoices,
    removedIdentities,
    removedOutlets,
    removedAliases,
    preservedIdentities: Array.from(keepIds),
  };
}

// ---------------------------------------------------------------------------
// 6. MERGE AKUN (ACCOUNT MERGE) — DENGAN VALIDASI SYARAT & PASSWORD OWNER
// ---------------------------------------------------------------------------
import { verifyOwnerPassword } from './auth';
import { recalcOutlet } from './calc';

export interface MergePreviewResult {
  canMerge: boolean;
  reasons: string[];
  source: {
    id: string;
    nama_pemilik: string;
    outletsCount: number;
    invoicesCount: number;
    months: string[];
  };
  target: {
    id: string;
    nama_pemilik: string;
    outletsCount: number;
    invoicesCount: number;
    months: string[];
  };
  collisions: string[];
  monthsMatch: boolean;
}

export function previewMergeIdentities(sourceId: string, targetId: string): MergePreviewResult {
  if (sourceId === targetId) {
    throw new Error('Akun sumber dan akun tujuan tidak boleh sama');
  }

  const source = db.prepare(`SELECT * FROM identities WHERE id = ?`).get(sourceId) as Record<string, unknown> | undefined;
  if (!source) throw new Error(`Akun sumber "${sourceId}" tidak ditemukan`);

  const target = db.prepare(`SELECT * FROM identities WHERE id = ?`).get(targetId) as Record<string, unknown> | undefined;
  if (!target) throw new Error(`Akun tujuan "${targetId}" tidak ditemukan`);

  const sourceOutlets = db.prepare(`SELECT id, nama_outlet, tipe FROM outlets WHERE identity_id = ?`).all(sourceId) as { id: string; nama_outlet: string; tipe: string }[];
  const targetOutlets = db.prepare(`SELECT id, nama_outlet, tipe FROM outlets WHERE identity_id = ?`).all(targetId) as { id: string; nama_outlet: string; tipe: string }[];

  const sourceOutletIds = sourceOutlets.map((o) => o.id);
  const targetOutletIds = targetOutlets.map((o) => o.id);

  let sourceInvoicesCount = 0;
  let sourceMonths: string[] = [];
  if (sourceOutletIds.length > 0) {
    const sPlaceholders = sourceOutletIds.map(() => '?').join(',');
    sourceInvoicesCount = (db.prepare(`SELECT count(*) as c FROM invoices WHERE outlet_id IN (${sPlaceholders})`).get(...sourceOutletIds) as { c: number }).c;
    sourceMonths = (db.prepare(`SELECT DISTINCT substr(tanggal, 1, 7) as bulan FROM invoices WHERE outlet_id IN (${sPlaceholders}) ORDER BY bulan`).all(...sourceOutletIds) as { bulan: string }[]).map((r) => r.bulan);
  }

  let targetInvoicesCount = 0;
  let targetMonths: string[] = [];
  if (targetOutletIds.length > 0) {
    const tPlaceholders = targetOutletIds.map(() => '?').join(',');
    targetInvoicesCount = (db.prepare(`SELECT count(*) as c FROM invoices WHERE outlet_id IN (${tPlaceholders})`).get(...targetOutletIds) as { c: number }).c;
    targetMonths = (db.prepare(`SELECT DISTINCT substr(tanggal, 1, 7) as bulan FROM invoices WHERE outlet_id IN (${tPlaceholders}) ORDER BY bulan`).all(...targetOutletIds) as { bulan: string }[]).map((r) => r.bulan);
  }

  // 1. Syarat 1: Nomor invoice wajib beda (tidak ada duplikasi)
  let collisions: string[] = [];
  if (sourceOutletIds.length > 0 && targetOutletIds.length > 0) {
    const sPlaceholders = sourceOutletIds.map(() => '?').join(',');
    const tPlaceholders = targetOutletIds.map(() => '?').join(',');
    const dupRows = db.prepare(`
      SELECT s.no_invoice
      FROM invoices s
      WHERE s.outlet_id IN (${sPlaceholders})
        AND s.no_invoice IN (
          SELECT t.no_invoice FROM invoices t WHERE t.outlet_id IN (${tPlaceholders})
        )
    `).all(...sourceOutletIds, ...targetOutletIds) as { no_invoice: string }[];
    collisions = dupRows.map((r) => r.no_invoice);
  }

  // 2. Syarat 2: Masih berada di bulan yang sama
  let monthsMatch = true;
  if (sourceMonths.length > 0 && targetMonths.length > 0) {
    const hasSharedMonth = sourceMonths.some((m) => targetMonths.includes(m));
    if (!hasSharedMonth) {
      monthsMatch = false;
    }
  }

  const reasons: string[] = [];
  if (collisions.length > 0) {
    reasons.push(`Ditemukan ${collisions.length} nomor invoice duplikat (${collisions.slice(0, 5).join(', ')}${collisions.length > 5 ? '...' : ''}). Nomor invoice wajib beda.`);
  }
  if (!monthsMatch) {
    reasons.push(`Bulan transaksi tidak cocok. Sumber: [${sourceMonths.join(', ')}], Tujuan: [${targetMonths.join(', ')}]. Transaksi harus berada di bulan yang sama.`);
  }

  return {
    canMerge: reasons.length === 0,
    reasons,
    source: {
      id: sourceId,
      nama_pemilik: String(source.nama_pemilik),
      outletsCount: sourceOutlets.length,
      invoicesCount: sourceInvoicesCount,
      months: sourceMonths,
    },
    target: {
      id: targetId,
      nama_pemilik: String(target.nama_pemilik),
      outletsCount: targetOutlets.length,
      invoicesCount: targetInvoicesCount,
      months: targetMonths,
    },
    collisions,
    monthsMatch,
  };
}

export function mergeIdentities(
  sourceId: string,
  targetId: string,
  ownerPassword: string
): {
  transferredOutlets: number;
  transferredAliases: number;
  transferredInvoices: number;
  targetId: string;
} {
  // Syarat 4: Password Owner Universal
  if (!verifyOwnerPassword(ownerPassword)) {
    throw new Error('Password Owner salah. Approval ditolak.');
  }

  // Validasi prasyarat (Syarat 1 & 2)
  const preview = previewMergeIdentities(sourceId, targetId);
  if (!preview.canMerge) {
    throw new Error(`Gagal merge: ${preview.reasons.join('. ')}`);
  }

  let transferredOutlets = 0;
  let transferredAliases = 0;
  let transferredInvoices = 0;

  const doMerge = db.transaction(() => {
    const sourceOutlets = db.prepare(`SELECT * FROM outlets WHERE identity_id = ?`).all(sourceId) as {
      id: string;
      tipe: OutletTipe;
      nama_outlet: string;
      id_pos_lama: string | null;
    }[];

    const targetOutlets = db.prepare(`SELECT * FROM outlets WHERE identity_id = ?`).all(targetId) as {
      id: string;
      tipe: OutletTipe;
      nama_outlet: string;
    }[];

    for (const sOut of sourceOutlets) {
      const matchedTargetOutlet = targetOutlets.find((t) => t.tipe === sOut.tipe);

      if (matchedTargetOutlet) {
        // Pindahkan aliases
        const aliasUpdate = db.prepare(`UPDATE pos_aliases SET outlet_id = ? WHERE outlet_id = ?`).run(matchedTargetOutlet.id, sOut.id);
        transferredAliases += aliasUpdate.changes;

        // Pindahkan invoices
        const invUpdate = db.prepare(`UPDATE invoices SET outlet_id = ? WHERE outlet_id = ?`).run(matchedTargetOutlet.id, sOut.id);
        transferredInvoices += invUpdate.changes;

        // Recalculate outlet target
        recalcOutlet(matchedTargetOutlet.id);

        // Hapus outlet source yang sudah dipindahkan
        db.prepare(`DELETE FROM outlets WHERE id = ?`).run(sOut.id);
      } else {
        // Pindahkan outlet ke target
        db.prepare(`UPDATE outlets SET identity_id = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(targetId, sOut.id);
        recalcOutlet(sOut.id);
        transferredOutlets++;
      }
    }

    // Tandai statement target perlu revisi
    db.prepare(`UPDATE statements SET status = 'perlu_revisi', updated_at = datetime('now','localtime') WHERE identity_id = ?`).run(targetId);

    // Hapus statements milik source identity agar tidak dobel
    db.prepare(`DELETE FROM statements WHERE identity_id = ?`).run(sourceId);

    // Syarat 3: Akun yang digabung statusnya 'merged' (tidak ditampilkan lagi di daftar)
    db.prepare(`
      UPDATE identities
      SET status = 'merged', updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(sourceId);

    // Audit Log
    db.prepare(`
      INSERT INTO audit_log(aksi, tabel, record_id, keterangan)
      VALUES (?, ?, ?, ?)
    `).run(
      'merge_identity',
      'identities',
      sourceId,
      `Merge akun ${sourceId} (${preview.source.nama_pemilik}) ke ${targetId} (${preview.target.nama_pemilik}). Dipindahkan: ${transferredInvoices} invoice, ${transferredAliases} alias, ${transferredOutlets} outlet. Disetujui Owner.`
    );
  });

  doMerge();

  return {
    transferredOutlets,
    transferredAliases,
    transferredInvoices,
    targetId,
  };
}

