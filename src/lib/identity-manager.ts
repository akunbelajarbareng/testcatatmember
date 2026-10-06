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
import { isMemberSuspendedOnDate } from './member-penalty';

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
      const isDateExcluded = exclusions.some((ex) => inv.tanggal >= ex.dari && inv.tanggal <= ex.sampai);
      const isSuspended = isMemberSuspendedOnDate(targetIdentityId, inv.tanggal);
      if (isDateExcluded || isSuspended) {
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
      const isDateExcluded = exclusions.some((ex) => inv.tanggal >= ex.dari && inv.tanggal <= ex.sampai);
      const isSuspended = isMemberSuspendedOnDate(identityId, inv.tanggal);
      if (isDateExcluded || isSuspended) {
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

// ---------------------------------------------------------------------------
// 7. DEAKTIVASI & AKTIVASI IDENTITY & OUTLET (MANUAL & OTOMATIS)
// ---------------------------------------------------------------------------
export interface DeactivateOptions {
  tipe?: 'manual' | 'otomatis';
  alasan?: string;
  oleh?: string;
  cascadeOutlets?: boolean;
}

export function deactivateIdentity(
  identityId: string,
  options: DeactivateOptions = {}
): { id: string; deactivatedOutletsCount: number } {
  const existing = db.prepare(`SELECT * FROM identities WHERE id = ?`).get(identityId) as { id: string; nama_pemilik: string; status: string } | undefined;
  if (!existing) throw new Error(`Identity "${identityId}" tidak ditemukan`);

  const tipe = options.tipe || 'manual';
  const alasan = options.alasan || (tipe === 'manual' ? 'Dinonaktifkan secara manual oleh Owner' : 'Nonaktif otomatis (inaktivitas)');
  const oleh = options.oleh || (tipe === 'manual' ? 'Owner' : 'Sistem Otomatis');
  const cascade = options.cascadeOutlets !== false; // default true

  let deactivatedOutletsCount = 0;

  const doDeactivate = db.transaction(() => {
    // 1. Update status identity
    db.prepare(`
      UPDATE identities SET
        status = 'nonaktif',
        nonaktif_tipe = ?,
        nonaktif_alasan = ?,
        nonaktif_tanggal = datetime('now','localtime'),
        nonaktif_oleh = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(tipe, alasan, oleh, identityId);

    // 2. Cascade ke seluruh outlet anak yang masih aktif
    if (cascade) {
      const res = db.prepare(`
        UPDATE outlets SET
          aktif = 0,
          nonaktif_tipe = ?,
          nonaktif_alasan = ?,
          nonaktif_tanggal = datetime('now','localtime'),
          nonaktif_oleh = ?,
          updated_at = datetime('now','localtime')
        WHERE identity_id = ? AND aktif = 1
      `).run(tipe, `Mengikuti Akun Utama dinonaktifkan: ${alasan}`, oleh, identityId);
      deactivatedOutletsCount = res.changes;
    }

    // 3. Audit Log
    db.prepare(`
      INSERT INTO audit_log(aksi, tabel, record_id, keterangan)
      VALUES (?, ?, ?, ?)
    `).run(
      'deactivate',
      'identities',
      identityId,
      `Nonaktifkan akun utama ${identityId} (${existing.nama_pemilik}) [Tipe: ${tipe}]. Alasan: ${alasan}. Oleh: ${oleh}. ${deactivatedOutletsCount} outlet anak ikut dinonaktifkan.`
    );
  });

  doDeactivate();
  return { id: identityId, deactivatedOutletsCount };
}

export function activateIdentity(
  identityId: string,
  options: { oleh?: string; cascadeOutlets?: boolean } = {}
): { id: string; reactivatedOutletsCount: number } {
  const existing = db.prepare(`SELECT * FROM identities WHERE id = ?`).get(identityId) as { id: string; nama_pemilik: string; status: string } | undefined;
  if (!existing) throw new Error(`Identity "${identityId}" tidak ditemukan`);

  const oleh = options.oleh || 'Owner';
  const cascade = options.cascadeOutlets === true;
  let reactivatedOutletsCount = 0;

  const doActivate = db.transaction(() => {
    db.prepare(`
      UPDATE identities SET
        status = 'aktif',
        nonaktif_tipe = NULL,
        nonaktif_alasan = NULL,
        nonaktif_tanggal = NULL,
        nonaktif_oleh = NULL,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(identityId);

    if (cascade) {
      const res = db.prepare(`
        UPDATE outlets SET
          aktif = 1,
          nonaktif_tipe = NULL,
          nonaktif_alasan = NULL,
          nonaktif_tanggal = NULL,
          nonaktif_oleh = NULL,
          updated_at = datetime('now','localtime')
        WHERE identity_id = ? AND aktif = 0
      `).run(identityId);
      reactivatedOutletsCount = res.changes;
    }

    db.prepare(`
      INSERT INTO audit_log(aksi, tabel, record_id, keterangan)
      VALUES (?, ?, ?, ?)
    `).run(
      'activate',
      'identities',
      identityId,
      `Aktivasi kembali akun utama ${identityId} (${existing.nama_pemilik}). Oleh: ${oleh}.${cascade ? ` (${reactivatedOutletsCount} outlet diaktifkan kembali)` : ''}`
    );
  });

  doActivate();
  return { id: identityId, reactivatedOutletsCount };
}

export function deactivateOutlet(
  outletId: string,
  options: DeactivateOptions = {}
): { id: string; identityDeactivated: boolean } {
  const outlet = db.prepare(`SELECT * FROM outlets WHERE id = ?`).get(outletId) as { id: string; identity_id: string; nama_outlet: string; aktif: number } | undefined;
  if (!outlet) throw new Error(`Outlet "${outletId}" tidak ditemukan`);

  const tipe = options.tipe || 'manual';
  const alasan = options.alasan || (tipe === 'manual' ? 'Dinonaktifkan secara manual oleh Owner' : 'Nonaktif otomatis (inaktivitas)');
  const oleh = options.oleh || (tipe === 'manual' ? 'Owner' : 'Sistem Otomatis');

  let identityDeactivated = false;

  const doDeactivate = db.transaction(() => {
    // 1. Nonaktifkan outlet
    db.prepare(`
      UPDATE outlets SET
        aktif = 0,
        nonaktif_tipe = ?,
        nonaktif_alasan = ?,
        nonaktif_tanggal = datetime('now','localtime'),
        nonaktif_oleh = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(tipe, alasan, oleh, outletId);

    // 2. Cek apakah seluruh outlet milik identity ini sekarang sudah nonaktif
    const activeCount = (db.prepare(`
      SELECT COUNT(*) as c FROM outlets WHERE identity_id = ? AND aktif = 1
    `).get(outlet.identity_id) as { c: number }).c;

    if (activeCount === 0) {
      db.prepare(`
        UPDATE identities SET
          status = 'nonaktif',
          nonaktif_tipe = ?,
          nonaktif_alasan = 'Semua lini bisnis tidak aktif',
          nonaktif_tanggal = datetime('now','localtime'),
          nonaktif_oleh = ?,
          updated_at = datetime('now','localtime')
        WHERE id = ? AND status = 'aktif'
      `).run(tipe, oleh, outlet.identity_id);
      identityDeactivated = true;
    }

    // 3. Audit Log
    db.prepare(`
      INSERT INTO audit_log(aksi, tabel, record_id, keterangan)
      VALUES (?, ?, ?, ?)
    `).run(
      'deactivate',
      'outlets',
      outletId,
      `Nonaktifkan outlet ${outletId} (${outlet.nama_outlet}) [Tipe: ${tipe}]. Alasan: ${alasan}. Oleh: ${oleh}.${identityDeactivated ? ' (Akun utama ikut dinonaktifkan karena seluruh lini bisnis nonaktif)' : ''}`
    );
  });

  doDeactivate();
  return { id: outletId, identityDeactivated };
}

export function activateOutlet(
  outletId: string,
  options: { oleh?: string } = {}
): { id: string; identityReactivated: boolean } {
  const outlet = db.prepare(`SELECT * FROM outlets WHERE id = ?`).get(outletId) as { id: string; identity_id: string; nama_outlet: string; aktif: number } | undefined;
  if (!outlet) throw new Error(`Outlet "${outletId}" tidak ditemukan`);

  const oleh = options.oleh || 'Owner';
  let identityReactivated = false;

  const doActivate = db.transaction(() => {
    // 1. Aktifkan outlet
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

    // 2. Pastikan akun utama induknya aktif jika sebelumnya nonaktif
    const parentIdentity = db.prepare(`SELECT id, status FROM identities WHERE id = ?`).get(outlet.identity_id) as { id: string; status: string } | undefined;
    if (parentIdentity && parentIdentity.status === 'nonaktif') {
      db.prepare(`
        UPDATE identities SET
          status = 'aktif',
          nonaktif_tipe = NULL,
          nonaktif_alasan = NULL,
          nonaktif_tanggal = NULL,
          nonaktif_oleh = NULL,
          updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(outlet.identity_id);
      identityReactivated = true;
    }

    // 3. Audit Log
    db.prepare(`
      INSERT INTO audit_log(aksi, tabel, record_id, keterangan)
      VALUES (?, ?, ?, ?)
    `).run(
      'activate',
      'outlets',
      outletId,
      `Aktivasi kembali outlet ${outletId} (${outlet.nama_outlet}). Oleh: ${oleh}.${identityReactivated ? ' (Akun utama diaktifkan kembali secara otomatis)' : ''}`
    );
  });

  doActivate();
  return { id: outletId, identityReactivated };
}

// ---------------------------------------------------------------------------
// 8. AUDIT INAKTIVITAS OTOMATIS BERDASARKAN PERIODE
// ---------------------------------------------------------------------------
export interface InactivityAuditResult {
  thresholdMonths: number;
  cutoffDate: string;
  asOfDate: string;
  checkedOutlets: number;
  deactivatedOutlets: { id: string; nama: string; lastActivity: string }[];
  deactivatedIdentities: { id: string; nama: string }[];
}

export function auditInactivity(asOfDate?: string): InactivityAuditResult {
  const row = db.prepare(`SELECT nilai FROM rules_config WHERE kunci = 'periode_tidak_aktif_bulan'`).get() as { nilai: number } | undefined;
  const thresholdMonths = row && row.nilai > 0 ? Number(row.nilai) : 3;

  const now = asOfDate ? new Date(asOfDate) : new Date();
  const asOfDateStr = now.toISOString().slice(0, 10);

  // Hitung tanggal cutoff: now dikurangi thresholdMonths
  const cutoffTarget = new Date(now.getFullYear(), now.getMonth() - thresholdMonths, now.getDate());
  const cutoffDate = cutoffTarget.toISOString().slice(0, 10);

  const activeOutlets = db.prepare(`
    SELECT id, identity_id, nama_outlet, created_at
    FROM outlets
    WHERE aktif = 1
  `).all() as { id: string; identity_id: string; nama_outlet: string; created_at: string }[];

  const deactivatedOutlets: { id: string; nama: string; lastActivity: string }[] = [];
  const deactivatedIdentities: { id: string; nama: string }[] = [];

  const doAudit = db.transaction(() => {
    for (const o of activeOutlets) {
      // Ambil transaksi belanja terakhir
      const lastInv = db.prepare(`SELECT MAX(tanggal) as max_d FROM invoices WHERE outlet_id = ?`).get(o.id) as { max_d: string | null } | undefined;
      // Ambil transaksi waste terakhir
      const lastWaste = db.prepare(`SELECT MAX(tanggal) as max_d FROM waste_purchases WHERE outlet_id = ?`).get(o.id) as { max_d: string | null } | undefined;
      // Tanggal outlet dibuat
      const createdDate = o.created_at ? o.created_at.slice(0, 10) : '2026-09-01';

      const candidateDates = [lastInv?.max_d, lastWaste?.max_d, createdDate].filter((d): d is string => Boolean(d));
      candidateDates.sort().reverse();
      const lastActivity = candidateDates[0] || '2026-09-01';

      // Jika aktivitas terakhir lebih lama dari tanggal cutoff -> Nonaktifkan otomatis
      if (lastActivity < cutoffDate) {
        db.prepare(`
          UPDATE outlets SET
            aktif = 0,
            nonaktif_tipe = 'otomatis',
            nonaktif_alasan = ?,
            nonaktif_tanggal = datetime('now','localtime'),
            nonaktif_oleh = 'Sistem Otomatis',
            updated_at = datetime('now','localtime')
          WHERE id = ?
        `).run(`Tidak ada transaksi selama >= ${thresholdMonths} bulan (Aktivitas terakhir: ${lastActivity})`, o.id);

        deactivatedOutlets.push({
          id: o.id,
          nama: o.nama_outlet,
          lastActivity,
        });
      }
    }

    // Periksa akun utama yang seluruh outletnya sekarang sudah nonaktif
    const activeIdentities = db.prepare(`
      SELECT id, nama_pemilik
      FROM identities
      WHERE status = 'aktif'
    `).all() as { id: string; nama_pemilik: string }[];

    for (const ident of activeIdentities) {
      const activeCount = (db.prepare(`
        SELECT COUNT(*) as c FROM outlets WHERE identity_id = ? AND aktif = 1
      `).get(ident.id) as { c: number }).c;

      if (activeCount === 0) {
        db.prepare(`
          UPDATE identities SET
            status = 'nonaktif',
            nonaktif_tipe = 'otomatis',
            nonaktif_alasan = ?,
            nonaktif_tanggal = datetime('now','localtime'),
            nonaktif_oleh = 'Sistem Otomatis',
            updated_at = datetime('now','localtime')
          WHERE id = ?
        `).run(`Seluruh lini bisnis nonaktif (Audit otomatis >= ${thresholdMonths} bulan)`, ident.id);

        deactivatedIdentities.push({
          id: ident.id,
          nama: ident.nama_pemilik,
        });
      }
    }

    if (deactivatedOutlets.length > 0 || deactivatedIdentities.length > 0) {
      db.prepare(`
        INSERT INTO audit_log(aksi, tabel, record_id, keterangan)
        VALUES (?, ?, ?, ?)
      `).run(
        'auto_deactivate',
        'system',
        'audit_inactivity',
        `Audit inaktivitas otomatis (${thresholdMonths} bulan, cutoff: ${cutoffDate}): ${deactivatedOutlets.length} outlet dan ${deactivatedIdentities.length} akun utama dinonaktifkan.`
      );
    }
  });

  doAudit();

  return {
    thresholdMonths,
    cutoffDate,
    asOfDate: asOfDateStr,
    checkedOutlets: activeOutlets.length,
    deactivatedOutlets,
    deactivatedIdentities,
  };
}

