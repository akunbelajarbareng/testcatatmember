/**
 * Coupon Manager Engine (Sprint 1)
 * Oriental Customer Relationship Management
 *
 * Format Baku: ORT-KUPYYMM-NNNN (4 Digit Urutan)
 * Standar Kapasitas: 2.500 kupon / bulan (50 Bundel @ 50 lembar)
 */

import db from '@/lib/db';
import { verifyOwnerPassword } from '@/lib/auth';

export const MAX_MONTHLY_COUPONS = 2500;
export const BUNDLE_SIZE = 50;
export const TOTAL_BUNDLES = 50;

export interface CouponQuota {
  identity_id: string;
  nama_pemilik: string;
  alamat: string;
  kota?: string;
  kecamatan?: string;
  whatsapp?: string;
  hak_kupon: number;
  sudah_diambil: number;
  sisa_kuota: number;
  is_suspended?: boolean;
  suspend_reason?: string | null;
  outlets: Array<{
    id: string;
    nama_outlet: string;
    tipe: string;
  }>;
}

export interface BundleStatus {
  bundle_no: number;
  start_seq: number;
  end_seq: number;
  start_number: string;
  end_number: string;
  total: number;
  issued: number;
  available: number;
  status: 'available' | 'partial' | 'taken';
}

export interface MonthlyStock {
  periode: string; // YYYY-MM
  prefix: string;  // ORT-KUPYYMM-
  capacity: number; // 2500
  issued_count: number;
  available_count: number;
  bundles: BundleStatus[];
}

export interface HandoverParams {
  identity_id: string;
  outlet_asal_id: string;
  periode_kupon: string; // YYYY-MM (e.g. 2026-09)
  petugas: string;
  whatsapp?: string;
  keterangan?: string;
  mode: 'bundle' | 'range' | 'custom';
  bundle_numbers?: number[]; // e.g. [1, 2]
  range?: { start: number; end: number }; // e.g. { start: 1, end: 50 }
  custom_numbers?: number[]; // e.g. [1, 5, 12]
}

export interface CouponRecord {
  id: number;
  nomor_kupon: string;
  identity_id: string;
  outlet_asal_id: string;
  batch_id?: number | null;
  periode_kupon: string;
  nomor_urut: number;
  status: 'aktif' | 'void';
  void_reason?: string | null;
  petugas: string;
  whatsapp?: string | null;
  tanggal_serah: string;
  created_at: string;
}

/**
 * Format nomor kupon resmi: ORT-KUPYYMM-NNNN
 * Contoh: periode '2026-09', seq 1 -> ORT-KUP2609-0001
 */
export function formatCouponNumber(periode: string, seq: number): string {
  const [yyyy, mm] = periode.split('-');
  const yy = (yyyy || '2026').slice(-2);
  const m = (mm || '09').padStart(2, '0');
  const nnnn = String(seq).padStart(4, '0');
  return `ORT-KUP${yy}${m}-${nnnn}`;
}

/**
 * Parsing nomor kupon menjadi periode dan sequence urut
 */
export function parseCouponNumber(nomor: string): { periode: string; seq: number } | null {
  const clean = nomor.trim().toUpperCase();
  const match = clean.match(/^ORT-KUP(\d{2})(\d{2})-(\d{4})$/);
  if (!match) return null;
  const yy = match[1];
  const mm = match[2];
  const seq = parseInt(match[3], 10);
  const yyyy = `20${yy}`;
  return { periode: `${yyyy}-${mm}`, seq };
}

/**
 * Normalisasi input pencarian kupon agar bisa menerima:
 * - 'ORT-KUP2609-0001'
 * - '2609-0001'
 * - '0001' atau '1' (menggunakan periode default jika disediakan)
 */
export function normalizeCouponSearch(input: string, defaultPeriode = '2026-09'): string {
  const clean = input.trim().toUpperCase();
  if (clean.startsWith('ORT-KUP')) {
    return clean;
  }
  if (/^\d{4}-\d{4}$/.test(clean)) {
    return `ORT-KUP${clean}`;
  }
  if (/^\d+$/.test(clean)) {
    const seq = parseInt(clean, 10);
    return formatCouponNumber(defaultPeriode, seq);
  }
  return clean;
}

/**
 * Ambil Kuota Kupon Member (Hak Akumulasi vs Sudah Diambil vs Sisa)
 */
export function getMemberCouponQuota(identityId: string): CouponQuota {
  const identity = db.prepare(`
    SELECT id, nama_pemilik, alamat, kota, kecamatan, whatsapp, is_suspended, suspend_reason
    FROM identities
    WHERE id = ?
  `).get(identityId) as {
    id: string;
    nama_pemilik: string;
    alamat: string;
    kota?: string;
    kecamatan?: string;
    whatsapp?: string;
    is_suspended?: number;
    suspend_reason?: string | null;
  } | undefined;

  if (!identity) {
    throw new Error(`Member dengan ID ${identityId} tidak ditemukan`);
  }

  // Hak kupon dari seluruh transaksi aktif sejak program dimulai (1 Sep 2026)
  const hakRow = db.prepare(`
    SELECT COALESCE(SUM(i.kupon), 0) AS total_hak
    FROM invoices i
    JOIN outlets o ON i.outlet_id = o.id
    WHERE o.identity_id = ?
      AND i.tanggal >= '2026-09-01'
      AND i.is_excluded = 0
  `).get(identityId) as { total_hak: number };

  const isSuspended = identity.is_suspended === 1;
  const hak_kupon = isSuspended ? 0 : hakRow.total_hak;

  // Kupon fisik aktif yang sudah diserahkan
  const takenRow = db.prepare(`
    SELECT COUNT(*) AS total_diambil
    FROM coupons
    WHERE identity_id = ? AND status = 'aktif'
  `).get(identityId) as { total_diambil: number };

  const sudah_diambil = takenRow.total_diambil;
  const sisa_kuota = isSuspended ? 0 : Math.max(0, hak_kupon - sudah_diambil);

  // Ambil daftar outlet aktif milik identity ini
  const outlets = db.prepare(`
    SELECT id, nama_outlet, tipe
    FROM outlets
    WHERE identity_id = ? AND aktif = 1
    ORDER BY id ASC
  `).all(identityId) as Array<{ id: string; nama_outlet: string; tipe: string }>;

  return {
    identity_id: identity.id,
    nama_pemilik: identity.nama_pemilik,
    alamat: identity.alamat || '',
    kota: identity.kota,
    kecamatan: identity.kecamatan,
    whatsapp: identity.whatsapp,
    hak_kupon,
    sudah_diambil,
    sisa_kuota,
    is_suspended: identity.is_suspended === 1,
    suspend_reason: identity.suspend_reason || null,
    outlets,
  };
}

/**
 * Cek Stok Kupon Fisik Bulanan (Kapasitas 2500 & Status 50 Bundel)
 */
export function getMonthlyCouponStock(periode: string): MonthlyStock {
  const [yyyy, mm] = periode.split('-');
  const yy = (yyyy || '2026').slice(-2);
  const m = (mm || '09').padStart(2, '0');
  const prefix = `ORT-KUP${yy}${m}-`;

  // Ambil semua nomor urut kupon aktif pada periode ini
  const activeCoupons = db.prepare(`
    SELECT nomor_urut
    FROM coupons
    WHERE periode_kupon = ? AND status = 'aktif'
  `).all(periode) as Array<{ nomor_urut: number }>;

  const activeSet = new Set<number>(activeCoupons.map((c) => c.nomor_urut));
  const issued_count = activeCoupons.length;
  const available_count = Math.max(0, MAX_MONTHLY_COUPONS - issued_count);

  const bundles: BundleStatus[] = [];

  for (let b = 1; b <= TOTAL_BUNDLES; b++) {
    const start_seq = (b - 1) * BUNDLE_SIZE + 1;
    const end_seq = b * BUNDLE_SIZE;
    const start_number = formatCouponNumber(periode, start_seq);
    const end_number = formatCouponNumber(periode, end_seq);

    let bundleIssued = 0;
    for (let s = start_seq; s <= end_seq; s++) {
      if (activeSet.has(s)) bundleIssued++;
    }

    const available = BUNDLE_SIZE - bundleIssued;
    let status: 'available' | 'partial' | 'taken' = 'available';
    if (bundleIssued === BUNDLE_SIZE) status = 'taken';
    else if (bundleIssued > 0) status = 'partial';

    bundles.push({
      bundle_no: b,
      start_seq,
      end_seq,
      start_number,
      end_number,
      total: BUNDLE_SIZE,
      issued: bundleIssued,
      available,
      status,
    });
  }

  return {
    periode,
    prefix,
    capacity: MAX_MONTHLY_COUPONS,
    issued_count,
    available_count,
    bundles,
  };
}

/**
 * Resolver nomor urut kupon berdasarkan 3 mode input:
 * 1. bundle: bundel 1..50
 * 2. range: start s/d end
 * 3. custom: angka pecahan
 */
export function resolveRequestedCoupons(
  periode: string,
  params: {
    mode: 'bundle' | 'range' | 'custom';
    bundle_numbers?: number[];
    range?: { start: number; end: number };
    custom_numbers?: number[];
  }
): { numbers: string[]; seqs: number[]; count: number } {
  const seqSet = new Set<number>();

  if (params.mode === 'bundle') {
    const bundles = params.bundle_numbers || [];
    if (bundles.length === 0) throw new Error('Pilih minimal satu nomor bundel');

    for (const b of bundles) {
      if (b < 1 || b > TOTAL_BUNDLES) {
        throw new Error(`Nomor bundel tidak valid: ${b}. Bundel tersedia dari 1 s/d ${TOTAL_BUNDLES}`);
      }
      const start = (b - 1) * BUNDLE_SIZE + 1;
      const end = b * BUNDLE_SIZE;
      for (let s = start; s <= end; s++) {
        seqSet.add(s);
      }
    }
  } else if (params.mode === 'range') {
    const { start, end } = params.range || { start: 0, end: 0 };
    if (!start || !end) throw new Error('Nomor awal dan nomor akhir wajib diisi');
    if (start <= 0 || end <= 0) throw new Error('Nomor urut kupon harus lebih besar dari 0');
    if (start > end) throw new Error(`Nomor awal (${start}) tidak boleh lebih besar dari nomor akhir (${end})`);
    if (end - start + 1 > 1000) {
      throw new Error(`Maksimal 1.000 kupon dalam satu kali submit rentang (diminta: ${end - start + 1})`);
    }
    for (let s = start; s <= end; s++) {
      seqSet.add(s);
    }
  } else if (params.mode === 'custom') {
    const nums = params.custom_numbers || [];
    if (nums.length === 0) throw new Error('Daftar nomor kupon eceran tidak boleh kosong');
    for (const s of nums) {
      if (s <= 0) throw new Error(`Nomor kupon tidak valid: ${s}`);
      seqSet.add(s);
    }
  } else {
    throw new Error(`Mode input kupon tidak dikenal: ${(params as any).mode}`);
  }

  const seqs = Array.from(seqSet).sort((a, b) => a - b);
  const numbers = seqs.map((s) => formatCouponNumber(periode, s));

  return {
    numbers,
    seqs,
    count: numbers.length,
  };
}

/**
 * Validasi Anti-Duplikasi: Cek apakah ada nomor kupon yang sudah aktif digunakan
 */
export function checkCouponConflicts(
  numbers: string[]
): Array<{ nomor_kupon: string; identity_id: string; nama_pemilik: string; tanggal_serah: string }> {
  if (numbers.length === 0) return [];

  // Pecah query jika numbers banyak (SQLite max variable limitation)
  const chunkSize = 200;
  const conflicts: Array<{ nomor_kupon: string; identity_id: string; nama_pemilik: string; tanggal_serah: string }> = [];

  for (let i = 0; i < numbers.length; i += chunkSize) {
    const chunk = numbers.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT c.nomor_kupon, c.identity_id, i.nama_pemilik, c.tanggal_serah
      FROM coupons c
      JOIN identities i ON c.identity_id = i.id
      WHERE c.nomor_kupon IN (${placeholders})
        AND c.status = 'aktif'
    `).all(...chunk) as Array<{ nomor_kupon: string; identity_id: string; nama_pemilik: string; tanggal_serah: string }>;

    conflicts.push(...rows);
  }

  return conflicts;
}

/**
 * Eksekusi Serah Terima Kupon Fisik
 * Disimpan dalam SQLite Transaction untuk menjamin integritas data (ACID)
 */
export function executeCouponHandover(params: HandoverParams): {
  success: boolean;
  batch_id: number;
  total_issued: number;
  nomor_awal: string;
  nomor_akhir: string;
  coupons: string[];
} {
  const {
    identity_id,
    outlet_asal_id,
    periode_kupon,
    petugas,
    whatsapp,
    keterangan,
    mode,
    bundle_numbers,
    range,
    custom_numbers,
  } = params;

  if (!identity_id) throw new Error('Nomor Member (Identity ID) wajib diisi');
  if (!outlet_asal_id) throw new Error('Outlet Asal wajib dipilih');
  if (!periode_kupon || !/^\d{4}-\d{2}$/.test(periode_kupon)) {
    throw new Error('Format periode kupon harus YYYY-MM (misal 2026-09)');
  }
  if (!petugas || petugas.trim() === '') throw new Error('Nama petugas yang menyerahkan wajib diisi');

  // 0. Cek Status Sanksi / Penangguhan Member
  const memberCheck = db.prepare(`SELECT is_suspended, suspend_reason FROM identities WHERE id = ?`).get(identity_id) as
    | { is_suspended: number; suspend_reason?: string | null }
    | undefined;
  if (memberCheck && memberCheck.is_suspended === 1) {
    throw new Error(
      `Member sedang dalam masa sanksi penangguhan (${memberCheck.suspend_reason || 'Evaluasi Khusus'}). Penyerahan kupon fisik diblokir.`
    );
  }

  // 1. Cek Kuota Member
  const quota = getMemberCouponQuota(identity_id);

  // 2. Resolve nomor kupon yang diminta
  const resolved = resolveRequestedCoupons(periode_kupon, {
    mode,
    bundle_numbers,
    range,
    custom_numbers,
  });

  if (resolved.count === 0) {
    throw new Error('Tidak ada kupon yang dihasilkan dari pilihan Anda');
  }

  if (quota.sisa_kuota <= 0) {
    throw new Error(
      `Member tidak memiliki sisa hak kuota kupon (sisa kuota: 0 lembar dari total ${quota.hak_kupon} hak). Penyerahan kupon ditolak.`
    );
  }

  if (resolved.count > quota.sisa_kuota) {
    throw new Error(
      `Jumlah kupon yang diserahkan (${resolved.count} lembar) melebihi sisa hak kuota member (${quota.sisa_kuota} lembar). Batas maksimal yang boleh diserahkan adalah ${quota.sisa_kuota} lembar.`
    );
  }

  // 3. Validasi Anti-Duplikasi
  const conflicts = checkCouponConflicts(resolved.numbers);
  if (conflicts.length > 0) {
    const contoh = conflicts
      .slice(0, 3)
      .map((c) => `${c.nomor_kupon} (milik: ${c.nama_pemilik})`)
      .join(', ');
    const sisa = conflicts.length > 3 ? ` dan ${conflicts.length - 3} kupon lainnya` : '';
    throw new Error(`Ditemukan ${conflicts.length} kupon yang sudah pernah diserahkan: ${contoh}${sisa}`);
  }

  // 4. Eksekusi Transaction
  let batchId = 0;
  const nomorAwal = resolved.numbers[0];
  const nomorAkhir = resolved.numbers[resolved.numbers.length - 1];

  db.transaction(() => {
    // A. Update nomor WhatsApp di master member jika diisi
    if (whatsapp && whatsapp.trim() !== '') {
      db.prepare(`
        UPDATE identities
        SET whatsapp = ?, updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(whatsapp.trim(), identity_id);
    }

    // B. Insert batch serah terima
    const batchResult = db.prepare(`
      INSERT INTO coupon_batches (
        identity_id, outlet_asal_id, periode_kupon, jumlah_kupon,
        nomor_awal, nomor_akhir, keterangan, petugas, whatsapp, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aktif')
    `).run(
      identity_id,
      outlet_asal_id,
      periode_kupon,
      resolved.count,
      nomorAwal,
      nomorAkhir,
      keterangan || (mode === 'bundle' ? `Bundel ${bundle_numbers?.join(',')}` : null),
      petugas.trim(),
      whatsapp?.trim() || quota.whatsapp || null
    );

    batchId = Number(batchResult.lastInsertRowid);

    // C. Batch insert coupons
    const insertCoupon = db.prepare(`
      INSERT INTO coupons (
        nomor_kupon, identity_id, outlet_asal_id, batch_id,
        periode_kupon, nomor_urut, status, petugas, whatsapp, tanggal_serah
      ) VALUES (?, ?, ?, ?, ?, ?, 'aktif', ?, ?, date('now','localtime'))
    `);

    for (let i = 0; i < resolved.numbers.length; i++) {
      const num = resolved.numbers[i];
      const seq = resolved.seqs[i];
      insertCoupon.run(
        num,
        identity_id,
        outlet_asal_id,
        batchId,
        periode_kupon,
        seq,
        petugas.trim(),
        whatsapp?.trim() || quota.whatsapp || null
      );
    }

    // D. Audit Log
    db.prepare(`
      INSERT INTO audit_log (aksi, tabel, record_id, keterangan)
      VALUES (?, ?, ?, ?)
    `).run(
      'handover_coupon',
      'coupon_batches',
      String(batchId),
      `Serah terima ${resolved.count} kupon (${nomorAwal} - ${nomorAkhir}) kepada member ${quota.nama_pemilik} (${identity_id}) oleh ${petugas.trim()}`
    );
  })();

  return {
    success: true,
    batch_id: batchId,
    total_issued: resolved.count,
    nomor_awal: nomorAwal,
    nomor_akhir: nomorAkhir,
    coupons: resolved.numbers,
  };
}

/**
 * Doorprize Lookup: Mencari pemilik kupon undian
 */
export function lookupCouponWinner(query: string, defaultPeriode = '2026-09') {
  const normalized = normalizeCouponSearch(query, defaultPeriode);

  let row = db.prepare(`
    SELECT
      c.id AS coupon_id,
      c.nomor_kupon,
      c.periode_kupon,
      c.nomor_urut,
      c.status,
      c.void_reason,
      c.tanggal_serah,
      c.petugas,
      c.whatsapp AS kupon_whatsapp,
      c.created_at AS serah_created_at,
      i.id AS identity_id,
      i.nama_pemilik,
      i.alamat,
      i.kota,
      i.kecamatan,
      i.provinsi,
      i.whatsapp AS member_whatsapp,
      o.id AS outlet_id,
      o.nama_outlet,
      o.tipe AS outlet_tipe,
      b.id AS batch_id,
      b.keterangan AS batch_keterangan
    FROM coupons c
    JOIN identities i ON c.identity_id = i.id
    JOIN outlets o ON c.outlet_asal_id = o.id
    LEFT JOIN coupon_batches b ON c.batch_id = b.id
    WHERE c.nomor_kupon = ?
    ORDER BY (CASE WHEN c.status = 'aktif' THEN 1 ELSE 2 END) ASC, c.id DESC
  `).get(normalized) as any | undefined;

  // Jika belum ditemukan dan input pencarian murni berupa angka urut, cari berdasarkan nomor_urut aktif
  if (!row && /^\d+$/.test(query.trim())) {
    const seq = parseInt(query.trim(), 10);
    row = db.prepare(`
      SELECT
        c.id AS coupon_id,
        c.nomor_kupon,
        c.periode_kupon,
        c.nomor_urut,
        c.status,
        c.void_reason,
        c.tanggal_serah,
        c.petugas,
        c.whatsapp AS kupon_whatsapp,
        c.created_at AS serah_created_at,
        i.id AS identity_id,
        i.nama_pemilik,
        i.alamat,
        i.kota,
        i.kecamatan,
        i.provinsi,
        i.whatsapp AS member_whatsapp,
        o.id AS outlet_id,
        o.nama_outlet,
        o.tipe AS outlet_tipe,
        b.id AS batch_id,
        b.keterangan AS batch_keterangan
      FROM coupons c
      JOIN identities i ON c.identity_id = i.id
      JOIN outlets o ON c.outlet_asal_id = o.id
      LEFT JOIN coupon_batches b ON c.batch_id = b.id
      WHERE c.nomor_urut = ?
      ORDER BY (CASE WHEN c.status = 'aktif' THEN 1 ELSE 2 END) ASC, c.id DESC
    `).get(seq) as any | undefined;
  }

  if (!row) {
    return {
      found: false,
      nomor_dicari: normalized,
      message: `Nomor kupon ${normalized} belum pernah diserahkan atau tidak terdaftar.`,
    };
  }

  return {
    found: true,
    coupon: {
      id: row.coupon_id,
      nomor_kupon: row.nomor_kupon,
      periode_kupon: row.periode_kupon,
      nomor_urut: row.nomor_urut,
      status: row.status,
      void_reason: row.void_reason || null,
      tanggal_serah: row.tanggal_serah,
      petugas: row.petugas,
      whatsapp: row.kupon_whatsapp || row.member_whatsapp || '—',
      member: {
        id: row.identity_id,
        nama_pemilik: row.nama_pemilik,
        alamat: row.alamat || '—',
        kota: row.kota || '—',
        kecamatan: row.kecamatan || '—',
        provinsi: row.provinsi || '—',
      },
      outlet_asal: {
        id: row.outlet_id,
        nama_outlet: row.nama_outlet,
        tipe: row.outlet_tipe,
      },
      batch: {
        id: row.batch_id,
        keterangan: row.batch_keterangan || '—',
      },
    },
  };
}

/**
 * Void Kupon / Batch dengan Password Approval Universal Owner ('oriental2026')
 */
export function voidCoupons(params: {
  coupon_ids?: number[];
  nomor_kupons?: string[];
  batch_id?: number;
  password: string;
  alasan: string;
  petugas: string;
}): { success: boolean; voided_count: number } {
  const { coupon_ids, nomor_kupons, batch_id, password, alasan, petugas } = params;

  // Verifikasi password Owner
  if (!password || !verifyOwnerPassword(password)) {
    throw new Error('Password persetujuan Owner salah. Akses pembatalan kupon ditolak.');
  }

  if (!alasan || alasan.trim() === '') {
    throw new Error('Alasan pembatalan (void) kupon wajib disertakan.');
  }

  let voidedCount = 0;

  db.transaction(() => {
    if (batch_id) {
      const res = db.prepare(`
        UPDATE coupons
        SET status = 'void'
        WHERE batch_id = ? AND status = 'aktif'
      `).run(batch_id);

      db.prepare(`
        UPDATE coupon_batches
        SET status = 'void'
        WHERE id = ?
      `).run(batch_id);

      voidedCount = res.changes;

      db.prepare(`
        INSERT INTO audit_log (aksi, tabel, record_id, keterangan)
        VALUES (?, ?, ?, ?)
      `).run('void_coupon_batch', 'coupon_batches', String(batch_id), `Void batch #${batch_id} (${voidedCount} kupon) oleh ${petugas}. Alasan: ${alasan}`);
    } else if (coupon_ids && coupon_ids.length > 0) {
      const placeholders = coupon_ids.map(() => '?').join(',');
      const res = db.prepare(`
        UPDATE coupons
        SET status = 'void'
        WHERE id IN (${placeholders}) AND status = 'aktif'
      `).run(...coupon_ids);

      voidedCount = res.changes;

      db.prepare(`
        INSERT INTO audit_log (aksi, tabel, record_id, keterangan)
        VALUES (?, ?, ?, ?)
      `).run('void_coupons', 'coupons', coupon_ids.join(','), `Void ${voidedCount} kupon oleh ${petugas}. Alasan: ${alasan}`);
    } else if (nomor_kupons && nomor_kupons.length > 0) {
      const placeholders = nomor_kupons.map(() => '?').join(',');
      const res = db.prepare(`
        UPDATE coupons
        SET status = 'void'
        WHERE nomor_kupon IN (${placeholders}) AND status = 'aktif'
      `).run(...nomor_kupons);

      voidedCount = res.changes;

      db.prepare(`
        INSERT INTO audit_log (aksi, tabel, record_id, keterangan)
        VALUES (?, ?, ?, ?)
      `).run('void_coupons', 'coupons', nomor_kupons.join(','), `Void ${voidedCount} kupon oleh ${petugas}. Alasan: ${alasan}`);
    } else {
      throw new Error('Tidak ada kupon atau batch yang dipilih untuk di-void.');
    }
  })();

  return {
    success: true,
    voided_count: voidedCount,
  };
}
