/**
 * Member Penalty & Suspension Engine (Sprint 1)
 * Oriental Customer Relationship Management
 *
 * Aturan Bisnis Disepakati:
 * 1. Dua Opsi Saldo:
 *    - Opsi A (Standar): Penangguhan Poin Baru (Poin masa sanksi = 0, saldo lama tetap).
 *    - Opsi B (Sanksi Berat): Reset Hangus Seluruh Saldo Lama jadi 0 (Konfirmasi ganda).
 * 2. Pencabutan Sanksi: Transaksi belanja selama masa sanksi HANGUS PERMANEN (tetap 0).
 * 3. Auto-Void Kupon: Seluruh kupon fisik aktif otomatis dibatalkan (VOID) berstatus gugur.
 * 4. Keterangan Statement: Gaya A (Formal & Sopan) -> "*Pemberian Poin & Kupon dinonaktifkan sementara (Status Evaluasi Khusus)".
 */

import db from '@/lib/db';
import { verifyOwnerPassword } from './auth';

export interface ApplyPenaltyParams {
  identity_id: string;
  jenis_sanksi: 'temporary' | 'permanent';
  dari: string; // YYYY-MM-DD
  sampai?: string; // YYYY-MM-DD (wajib jika temporary)
  reset_saldo_lama: boolean; // true = sanksi berat (hangus saldo lama)
  alasan: string;
  petugas: string;
  password: string;
}

export interface RevokePenaltyParams {
  identity_id: string;
  alasan: string;
  petugas: string;
  password: string;
}

export interface MemberPenaltyRecord {
  id: number;
  identity_id: string;
  jenis_sanksi: 'temporary' | 'permanent';
  reset_saldo_lama: number;
  dari: string;
  sampai?: string | null;
  alasan: string;
  petugas: string;
  voided_coupons_count: number;
  wiped_points: number;
  status: 'aktif' | 'dicabut';
  revoked_at?: string | null;
  revoked_by?: string | null;
  revoked_reason?: string | null;
  created_at: string;
}

export interface MemberPenaltyInfo {
  is_suspended: boolean;
  suspend_type?: 'temporary' | 'permanent' | null;
  suspend_dari?: string | null;
  suspend_sampai?: string | null;
  suspend_reason?: string | null;
  suspend_reset_points?: boolean;
  suspended_at?: string | null;
  suspended_by?: string | null;
  active_penalty?: MemberPenaltyRecord | null;
  history: MemberPenaltyRecord[];
}

export { verifyOwnerPassword };

/**
 * Cek status sanksi dan riwayat sanksi member
 */
export function getMemberPenaltyInfo(identityId: string): MemberPenaltyInfo {
  const identity = db.prepare(`
    SELECT
      is_suspended, suspend_type, suspend_dari, suspend_sampai,
      suspend_reason, suspend_reset_points, suspended_at, suspended_by
    FROM identities
    WHERE id = ?
  `).get(identityId) as any | undefined;

  if (!identity) {
    throw new Error(`Member dengan ID ${identityId} tidak ditemukan`);
  }

  const history = db.prepare(`
    SELECT *
    FROM member_penalties
    WHERE identity_id = ?
    ORDER BY created_at DESC
  `).all(identityId) as MemberPenaltyRecord[];

  const activePenalty = history.find((p) => p.status === 'aktif') || null;

  return {
    is_suspended: identity.is_suspended === 1,
    suspend_type: identity.suspend_type,
    suspend_dari: identity.suspend_dari,
    suspend_sampai: identity.suspend_sampai,
    suspend_reason: identity.suspend_reason,
    suspend_reset_points: identity.suspend_reset_points === 1,
    suspended_at: identity.suspended_at,
    suspended_by: identity.suspended_by,
    active_penalty: activePenalty,
    history,
  };
}

/**
 * Cek apakah member sedang dalam status sanksi pada tanggal tertentu
 */
export function isMemberSuspendedOnDate(identityId: string, tanggal: string): boolean {
  const row = db.prepare(`
    SELECT is_suspended, suspend_type, suspend_dari, suspend_sampai
    FROM identities
    WHERE id = ?
  `).get(identityId) as any | undefined;

  if (!row || row.is_suspended !== 1) return false;

  const { suspend_type, suspend_dari, suspend_sampai } = row;
  if (!suspend_dari) return true; // disuspend tanpa batas

  if (suspend_type === 'permanent') {
    return tanggal >= suspend_dari;
  }

  if (suspend_type === 'temporary' && suspend_sampai) {
    return tanggal >= suspend_dari && tanggal <= suspend_sampai;
  }

  return tanggal >= suspend_dari;
}

/**
 * Eksekusi Penjatuhan Sanksi Pelanggaran Member
 */
export function applyMemberPenalty(params: ApplyPenaltyParams): {
  success: boolean;
  penalty_id: number;
  invoices_affected: number;
  voided_coupons_count: number;
  wiped_points: number;
} {
  const {
    identity_id,
    jenis_sanksi,
    dari,
    sampai,
    reset_saldo_lama,
    alasan,
    petugas,
    password,
  } = params;

  // 1. Verifikasi Password Owner
  if (!verifyOwnerPassword(password)) {
    throw new Error('Password persetujuan Owner salah. Sanksi penangguhan ditolak.');
  }

  if (!identity_id) throw new Error('Member ID wajib diisi');
  if (!alasan || alasan.trim() === '') throw new Error('Alasan sanksi pelanggaran wajib disertakan');
  if (!petugas || petugas.trim() === '') throw new Error('Nama petugas yang memproses wajib diisi');
  if (!dari || !/^\d{4}-\d{2}-\d{2}$/.test(dari)) {
    throw new Error('Format tanggal mulai sanksi harus YYYY-MM-DD');
  }

  if (jenis_sanksi === 'temporary') {
    if (!sampai || !/^\d{4}-\d{2}-\d{2}$/.test(sampai)) {
      throw new Error('Tanggal selesai sanksi wajib diisi untuk sanksi periode tertentu');
    }
    if (dari > sampai) {
      throw new Error(`Tanggal mulai (${dari}) tidak boleh lebih besar dari tanggal selesai (${sampai})`);
    }
  }

  const identity = db.prepare(`SELECT id, nama_pemilik FROM identities WHERE id = ?`).get(identity_id) as
    | { id: string; nama_pemilik: string }
    | undefined;

  if (!identity) {
    throw new Error(`Member dengan ID ${identity_id} tidak ditemukan`);
  }

  let penaltyId = 0;
  let invoicesAffected = 0;
  let voidedCouponsCount = 0;
  let wipedPoints = 0;

  db.transaction(() => {
    // -----------------------------------------------------------------------
    // A. Update Invoices Selama Periode Sanksi -> Poin & Kupon = 0, is_excluded = 1
    // -----------------------------------------------------------------------
    if (jenis_sanksi === 'permanent') {
      const resInv = db.prepare(`
        UPDATE invoices
        SET poin = 0, kupon = 0, is_excluded = 1
        WHERE outlet_id IN (SELECT id FROM outlets WHERE identity_id = ?)
          AND tanggal >= ?
      `).run(identity_id, dari);
      invoicesAffected += resInv.changes;
    } else {
      const resInv = db.prepare(`
        UPDATE invoices
        SET poin = 0, kupon = 0, is_excluded = 1
        WHERE outlet_id IN (SELECT id FROM outlets WHERE identity_id = ?)
          AND tanggal >= ? AND tanggal <= ?
      `).run(identity_id, dari, sampai!);
      invoicesAffected += resInv.changes;
    }

    // -----------------------------------------------------------------------
    // B. Opsi B: Reset Hangus Seluruh Saldo Lama (Jika Dipilih)
    // -----------------------------------------------------------------------
    if (reset_saldo_lama) {
      // Hitung total poin lama yang dihanguskan
      const oldPointsRow = db.prepare(`
        SELECT COALESCE(SUM(poin), 0) AS total_old_poin
        FROM invoices
        WHERE outlet_id IN (SELECT id FROM outlets WHERE identity_id = ?)
          AND tanggal < ?
          AND is_excluded = 0
      `).get(identity_id, dari) as { total_old_poin: number };

      wipedPoints = oldPointsRow.total_old_poin;

      // Nolkan seluruh invoice lama sebelum tanggal sanksi
      const resOld = db.prepare(`
        UPDATE invoices
        SET poin = 0, kupon = 0, is_excluded = 1
        WHERE outlet_id IN (SELECT id FROM outlets WHERE identity_id = ?)
          AND tanggal < ?
      `).run(identity_id, dari);

      invoicesAffected += resOld.changes;
    }

    // -----------------------------------------------------------------------
    // C. Pilihan B (Auto-Void Kupon Fisik Yang Pernah Diterima)
    // -----------------------------------------------------------------------
    const voidReason = `Gugur akibat sanksi: ${alasan.trim()}`;

    const resVoidCoupons = db.prepare(`
      UPDATE coupons
      SET status = 'void', void_reason = ?
      WHERE identity_id = ? AND status = 'aktif'
    `).run(voidReason, identity_id);

    voidedCouponsCount = resVoidCoupons.changes;

    // Void batch aktif juga
    db.prepare(`
      UPDATE coupon_batches
      SET status = 'void'
      WHERE identity_id = ? AND status = 'aktif'
    `).run(identity_id);

    // -----------------------------------------------------------------------
    // D. Update Status pada Master Identities
    // -----------------------------------------------------------------------
    db.prepare(`
      UPDATE identities
      SET
        is_suspended = 1,
        suspend_type = ?,
        suspend_dari = ?,
        suspend_sampai = ?,
        suspend_reason = ?,
        suspend_reset_points = ?,
        suspended_at = datetime('now','localtime'),
        suspended_by = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      jenis_sanksi,
      dari,
      sampai || null,
      alasan.trim(),
      reset_saldo_lama ? 1 : 0,
      petugas.trim(),
      identity_id
    );

    // -----------------------------------------------------------------------
    // E. Simpan Catatan ke Tabel member_penalties
    // -----------------------------------------------------------------------
    const insertPenalty = db.prepare(`
      INSERT INTO member_penalties (
        identity_id, jenis_sanksi, reset_saldo_lama, dari, sampai,
        alasan, petugas, voided_coupons_count, wiped_points, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aktif')
    `).run(
      identity_id,
      jenis_sanksi,
      reset_saldo_lama ? 1 : 0,
      dari,
      sampai || null,
      alasan.trim(),
      petugas.trim(),
      voidedCouponsCount,
      wipedPoints
    );

    penaltyId = Number(insertPenalty.lastInsertRowid);

    // -----------------------------------------------------------------------
    // F. Audit Log
    // -----------------------------------------------------------------------
    db.prepare(`
      INSERT INTO audit_log (aksi, tabel, record_id, keterangan)
      VALUES (?, ?, ?, ?)
    `).run(
      'apply_member_penalty',
      'member_penalties',
      String(penaltyId),
      `Penjatuhan sanksi (${jenis_sanksi}) kepada member ${identity.nama_pemilik} (${identity_id}) oleh ${petugas.trim()}. Alasan: ${alasan.trim()}. Kupon di-void: ${voidedCouponsCount}, Poin dihanguskan: ${wipedPoints}`
    );
  })();

  return {
    success: true,
    penalty_id: penaltyId,
    invoices_affected: invoicesAffected,
    voided_coupons_count: voidedCouponsCount,
    wiped_points: wipedPoints,
  };
}

/**
 * Eksekusi Pencabutan Sanksi Member (Un-suspend)
 * Aturan Disepakati: Transaksi selama masa sanksi HANGUS PERMANEN (tetap 0).
 */
export function revokeMemberPenalty(params: RevokePenaltyParams): {
  success: boolean;
  revoked_count: number;
} {
  const { identity_id, alasan, petugas, password } = params;

  // 1. Verifikasi Password Owner
  if (!verifyOwnerPassword(password)) {
    throw new Error('Password persetujuan Owner salah. Pencabutan sanksi ditolak.');
  }

  if (!identity_id) throw new Error('Member ID wajib diisi');
  if (!alasan || alasan.trim() === '') throw new Error('Alasan pencabutan sanksi wajib disertakan');
  if (!petugas || petugas.trim() === '') throw new Error('Nama petugas yang memproses wajib diisi');

  const identity = db.prepare(`SELECT id, nama_pemilik, is_suspended FROM identities WHERE id = ?`).get(identity_id) as
    | { id: string; nama_pemilik: string; is_suspended: number }
    | undefined;

  if (!identity) {
    throw new Error(`Member dengan ID ${identity_id} tidak ditemukan`);
  }

  if (identity.is_suspended === 0) {
    throw new Error(`Member ${identity.nama_pemilik} tidak sedang dalam status sanksi/penangguhan.`);
  }

  let revokedCount = 0;

  db.transaction(() => {
    // -----------------------------------------------------------------------
    // 1. Update Tabel member_penalties
    // -----------------------------------------------------------------------
    const resPen = db.prepare(`
      UPDATE member_penalties
      SET
        status = 'dicabut',
        revoked_at = datetime('now','localtime'),
        revoked_by = ?,
        revoked_reason = ?
      WHERE identity_id = ? AND status = 'aktif'
    `).run(petugas.trim(), alasan.trim(), identity_id);

    revokedCount = resPen.changes;

    // -----------------------------------------------------------------------
    // 2. Pulihkan Status pada Master Identities
    //    Catatan: Invoices masa sanksi TETAP 0 (Hangus Permanen) sesuai Aturan 2!
    // -----------------------------------------------------------------------
    db.prepare(`
      UPDATE identities
      SET
        is_suspended = 0,
        suspend_type = null,
        suspend_dari = null,
        suspend_sampai = null,
        suspend_reason = null,
        suspend_reset_points = 0,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(identity_id);

    // -----------------------------------------------------------------------
    // 3. Audit Log
    // -----------------------------------------------------------------------
    db.prepare(`
      INSERT INTO audit_log (aksi, tabel, record_id, keterangan)
      VALUES (?, ?, ?, ?)
    `).run(
      'revoke_member_penalty',
      'identities',
      identity_id,
      `Pencabutan sanksi member ${identity.nama_pemilik} (${identity_id}) oleh ${petugas.trim()}. Alasan: ${alasan.trim()}. Transaksi masa sanksi tetap bernilai 0 (hangus permanen).`
    );
  })();

  return {
    success: true,
    revoked_count: revokedCount,
  };
}
