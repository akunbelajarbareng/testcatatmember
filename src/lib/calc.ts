/**
 * calc.ts — Core Point & Coupon Calculation Engine
 * Implements PRD Section 5 rules exactly.
 */
import db from './db';
import { isMemberSuspendedOnDate, syncMemberPenaltyInvoices } from './member-penalty';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type OutletTipe = 'retail' | 'grosir' | 'ukm';

export interface InvoiceRow {
  id: number;
  no_invoice: string;
  tanggal: string;
  nama_pos: string;
  jenis: string;
  jumlah: number;
  outlet_id: string | null;
  poin: number;
  kupon: number;
  is_excluded: number;
}

export interface OutletSummary {
  outlet_id: string;
  nama_outlet: string;
  tipe: OutletTipe;
  identity_id: string;
  total_transaksi: number;
  poin: number;
  kupon: number;
  poin_seharusnya?: number;
  kupon_seharusnya?: number;
  is_devalued?: boolean;
  devaluasi_poin?: number;
  devaluasi_kupon?: number;
}

export interface StatementData {
  identity_id: string;
  nama_pemilik: string;
  alamat: string;
  kecamatan?: string;
  kota?: string;
  kode_pos?: string;
  provinsi?: string;
  bulan: string; // YYYY-MM
  bulan_label: string; // "SEPTEMBER 2026"
  // Bulan berjalan
  bulan_transaksi: number;
  bulan_poin: number;
  bulan_belanja_poin?: number;
  gross_bulan_poin?: number;
  gross_waste_bulan_poin?: number;
  devaluasi_waste_bulan_poin?: number;
  bulan_bonus_poin: number; // Selalu 0 fase ini
  bulan_kupon: number;
  // Kumulatif sejak awal periode (Sep 2026) s.d. hari pengecekan / transaksi terakhir
  kumulatif_poin: number;
  kumulatif_kupon: number;
  transaksi_terakhir?: string | null;
  // Per outlet
  outlets: OutletSummary[];
  // Histori 13 bulan
  histori: MonthlyHistory[];
  // Sanksi / Penangguhan Member (Gaya A)
  is_suspended?: boolean;
  suspend_type?: 'temporary' | 'permanent' | null;
  suspend_dari?: string | null;
  suspend_sampai?: string | null;
  suspend_reason?: string | null;
  suspend_note?: string | null;
  // Devaluasi metrics untuk Visual Statement
  has_devaluasi?: boolean;
  devaluasi_bulan_poin?: number;
  devaluasi_bulan_kupon?: number;
  sebelumnya_kumulatif_poin?: number;
  sebelumnya_kumulatif_kupon?: number;
  total_devaluasi_kumulatif_poin?: number;
  total_devaluasi_kumulatif_kupon?: number;
  // Waste Purchasing Metrics (UCO)
  waste_bulan_kg: number;
  waste_bulan_rupiah: number;
  waste_bulan_poin: number;
  waste_kumulatif_kg: number;
  waste_kumulatif_rupiah: number;
  waste_kumulatif_poin: number;
  outlets_waste?: Array<{
    outlet_id: string;
    nama_outlet: string;
    berat_kg: number;
    total_rupiah: number;
    poin: number;
    is_void?: boolean;
  }>;
  // Nilai Penghematan Customer (Savings)
  hemat_trx_count: number;
  saving_parkir_per_trx: number;
  saving_kurir_per_trx: number;
  total_hemat_parkir: number;
  total_hemat_kurir: number;
  total_nilai_penghematan: number;
  // Detail Nomor Kupon Fisik Resmi (Opsi A)
  kupon_detail?: StatementCouponDetail;
}

export interface StatementCouponDetail {
  total_fisik_aktif: number;
  items: Array<{
    nomor_kupon: string;
    nomor_urut: number;
    tanggal_serah?: string;
  }>;
  ranges: Array<{
    start: string;
    end: string;
    count: number;
  }>;
  pecahan: string[];
  format_mode: 'empty' | 'full' | 'range_and_singles';
}

export interface MonthlyHistory {
  no: number;
  bulan: string; // YYYY-MM
  label: string; // "SEPTEMBER 2026"
  total_transaksi: number;
  poin: number;
  bonus_poin: number;
  kupon: number;
  is_suspended?: boolean;
  devaluasi_poin?: number;
  devaluasi_kupon?: number;
  waste_rupiah?: number;
  waste_kg?: number;
  waste_poin?: number;
}

// ---------------------------------------------------------------------------
// Rate lookup from rules_config
// ---------------------------------------------------------------------------
function getRate(tipe: OutletTipe): number {
  const row = db.prepare(`SELECT nilai FROM rules_config WHERE kunci = ?`).get(`rate_${tipe}`) as { nilai: number } | undefined;
  if (!row) throw new Error(`Rate tidak ditemukan untuk tipe: ${tipe}`);
  return row.nilai;
}

function getNilaiKupon(): number {
  const row = db.prepare(`SELECT nilai FROM rules_config WHERE kunci = 'nilai_kupon'`).get() as { nilai: number } | undefined;
  return row?.nilai ?? 150000;
}

// ---------------------------------------------------------------------------
// Hitung poin dan kupon per invoice (PRD Bagian 5)
// ---------------------------------------------------------------------------
export function hitungInvoice(jumlah: number, tipe: OutletTipe): { poin: number; kupon: number } {
  const rate = getRate(tipe);
  const nilaiKupon = getNilaiKupon();
  return {
    poin: Math.floor(jumlah / rate),
    kupon: Math.floor(jumlah / nilaiKupon),
  };
}

// ---------------------------------------------------------------------------
// Recalculate ALL invoices for a given outlet
// Called when: alias dipetakan, tipe outlet diubah, exclusion ditambah/hapus
// ---------------------------------------------------------------------------
export function recalcOutlet(outletId: string): void {
  const outlet = db.prepare(`SELECT o.tipe, o.identity_id FROM outlets o WHERE o.id = ?`).get(outletId) as {
    tipe: OutletTipe;
    identity_id: string;
  } | undefined;
  if (!outlet) return;

  const rate = getRate(outlet.tipe);
  const nilaiKupon = getNilaiKupon();

  // Ambil semua exclusions untuk identity ini
  const exclusions = db
    .prepare(`SELECT dari, sampai FROM exclusions WHERE identity_id = ?`)
    .all(outlet.identity_id) as { dari: string; sampai: string }[];

  const invoices = db
    .prepare(`SELECT id, tanggal, jumlah FROM invoices WHERE outlet_id = ?`)
    .all(outletId) as { id: number; tanggal: string; jumlah: number }[];

  const updateStmt = db.prepare(`UPDATE invoices SET poin = ?, kupon = ?, is_excluded = ? WHERE id = ?`);

  const recalcAll = db.transaction(() => {
    for (const inv of invoices) {
      const isDateExcluded = exclusions.some(
        (ex) => inv.tanggal >= ex.dari && inv.tanggal <= ex.sampai
      );
      const isSuspended = isMemberSuspendedOnDate(outlet.identity_id, inv.tanggal);

      if (isDateExcluded || isSuspended) {
        updateStmt.run(0, 0, 1, inv.id);
      } else {
        const poin = Math.floor(inv.jumlah / rate);
        const kupon = Math.floor(inv.jumlah / nilaiKupon);
        updateStmt.run(poin, kupon, 0, inv.id);
      }
    }
  });

  recalcAll();
}

// ---------------------------------------------------------------------------
// Recalculate seluruh identity (semua outlet)
// ---------------------------------------------------------------------------
export function recalcIdentity(identityId: string): void {
  const outlets = db
    .prepare(`SELECT id FROM outlets WHERE identity_id = ? AND aktif = 1`)
    .all(identityId) as { id: string }[];
  for (const o of outlets) {
    recalcOutlet(o.id);
  }
}

// ---------------------------------------------------------------------------
// Build statement data untuk satu identity + bulan
// ---------------------------------------------------------------------------
const PERIODE_MONTHS: string[] = (() => {
  const months: string[] = [];
  const start = new Date(2026, 8, 1); // Sep 2026
  for (let i = 0; i < 13; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${yyyy}-${mm}`);
  }
  return months;
})();

const BULAN_ID: Record<string, string> = {
  '01': 'JANUARI', '02': 'FEBRUARI', '03': 'MARET', '04': 'APRIL',
  '05': 'MEI', '06': 'JUNI', '07': 'JULI', '08': 'AGUSTUS',
  '09': 'SEPTEMBER', '10': 'OKTOBER', '11': 'NOVEMBER', '12': 'DESEMBER',
};

export function bulanLabel(yyyyMM: string): string {
  const [yyyy, mm] = yyyyMM.split('-');
  return `${BULAN_ID[mm]} ${yyyy}`;
}

export function buildStatementData(identityId: string, bulan: string): StatementData {
  // Identity info
  const identity = db
    .prepare(`
      SELECT
        id, nama_pemilik, alamat, kecamatan, kota, kode_pos, provinsi,
        is_suspended, suspend_type, suspend_dari, suspend_sampai, suspend_reason
      FROM identities
      WHERE id = ?
    `)
    .get(identityId) as {
      id: string;
      nama_pemilik: string;
      alamat: string;
      kecamatan: string;
      kota: string;
      kode_pos: string;
      provinsi: string;
      is_suspended?: number;
      suspend_type?: 'temporary' | 'permanent' | null;
      suspend_dari?: string | null;
      suspend_sampai?: string | null;
      suspend_reason?: string | null;
    } | undefined;
  if (!identity) throw new Error(`Identity ${identityId} tidak ditemukan`);

  // Rentang bulan
  const bulanStart = `${bulan}-01`;
  const [yyyy, mm] = bulan.split('-');
  const lastDay = new Date(Number(yyyy), Number(mm), 0).getDate();
  const bulanEnd = `${bulan}-${String(lastDay).padStart(2, '0')}`;

  // Cek status sanksi / penangguhan member untuk bulan statement ini
  let isMonthSuspended = false;
  let activeReason = identity.suspend_reason || null;
  let activeType = identity.suspend_type || null;
  let activeDari = identity.suspend_dari || null;
  let activeSampai = identity.suspend_sampai || null;

  if (identity.is_suspended === 1) {
    if (identity.suspend_type === 'permanent') {
      if (!identity.suspend_dari || bulanEnd >= identity.suspend_dari) {
        isMonthSuspended = true;
      }
    } else if (identity.suspend_dari && identity.suspend_sampai) {
      if (identity.suspend_dari <= bulanEnd && identity.suspend_sampai >= bulanStart) {
        isMonthSuspended = true;
      }
    } else {
      isMonthSuspended = true;
    }
  }

  // Jika tidak aktif saat ini, periksa apakah bulan ini pernah tercatat dalam riwayat sanksi
  if (!isMonthSuspended) {
    const pastPenalty = db.prepare(`
      SELECT jenis_sanksi, alasan, dari, sampai
      FROM member_penalties
      WHERE identity_id = ?
        AND dari <= ?
        AND (sampai IS NULL OR sampai >= ?)
      ORDER BY id DESC
      LIMIT 1
    `).get(identityId, bulanEnd, bulanStart) as { jenis_sanksi: 'temporary' | 'permanent'; alasan: string; dari: string; sampai: string | null } | undefined;

    if (pastPenalty) {
      isMonthSuspended = true;
      activeReason = pastPenalty.alasan;
      activeType = pastPenalty.jenis_sanksi;
      activeDari = pastPenalty.dari;
      activeSampai = pastPenalty.sampai;
    }
  }

  // Jika akun dalam sanksi, jalankan sinkronisasi invoice & kupon otomatis
  if (isMonthSuspended) {
    syncMemberPenaltyInvoices(identityId);
  }

  // Outlet-outlet aktif ATAU outlet nonaktif yang memiliki transaksi pada bulan ini
  const outletsDb = db
    .prepare(`
      SELECT o.id, o.nama_outlet, o.tipe
      FROM outlets o
      WHERE o.identity_id = ?
        AND (
          o.aktif = 1
          OR EXISTS (
            SELECT 1 FROM invoices i
            WHERE i.outlet_id = o.id
              AND i.tanggal >= ? AND i.tanggal <= ?
          )
          OR EXISTS (
            SELECT 1 FROM waste_purchases wp
            WHERE wp.outlet_id = o.id
              AND wp.tanggal >= ? AND wp.tanggal <= ?
          )
        )
    `)
    .all(identityId, bulanStart, bulanEnd, bulanStart, bulanEnd) as { id: string; nama_outlet: string; tipe: OutletTipe }[];

  const nilaiKupon = getNilaiKupon();

  // Ringkasan per outlet untuk BULAN INI
  const outletSummaries: OutletSummary[] = outletsDb.map((o) => {
    const rate = getRate(o.tipe);
    const invoices = db
      .prepare(`
        SELECT id, jumlah, poin, kupon, is_excluded, tanggal
        FROM invoices
        WHERE outlet_id = ?
          AND tanggal >= ? AND tanggal <= ?
      `)
      .all(o.id, bulanStart, bulanEnd) as {
        id: number;
        jumlah: number;
        poin: number;
        kupon: number;
        is_excluded: number;
        tanggal: string;
      }[];

    let totalTransaksi = 0;
    let actualPoin = 0;
    let actualKupon = 0;
    let grossPoin = 0;
    let grossKupon = 0;

    for (const inv of invoices) {
      totalTransaksi += inv.jumlah;
      const gPoin = Math.floor(inv.jumlah / rate);
      const gKupon = Math.floor(inv.jumlah / nilaiKupon);
      grossPoin += gPoin;
      grossKupon += gKupon;

      const isInvSuspended = isMonthSuspended || isMemberSuspendedOnDate(identityId, inv.tanggal) || inv.is_excluded === 1;
      if (!isInvSuspended) {
        actualPoin += inv.poin;
        actualKupon += inv.kupon;
      }
    }

    const devaluasiPoinOutlet = isMonthSuspended ? grossPoin : Math.max(0, grossPoin - actualPoin);
    const devaluasiKuponOutlet = isMonthSuspended ? grossKupon : Math.max(0, grossKupon - actualKupon);
    const isOutletDevalued = isMonthSuspended || (totalTransaksi > 0 && (devaluasiPoinOutlet > 0 || devaluasiKuponOutlet > 0));

    return {
      outlet_id: o.id,
      nama_outlet: o.nama_outlet,
      tipe: o.tipe,
      identity_id: identityId,
      total_transaksi: totalTransaksi,
      poin: isMonthSuspended ? 0 : actualPoin,
      kupon: isMonthSuspended ? 0 : actualKupon,
      poin_seharusnya: grossPoin,
      kupon_seharusnya: grossKupon,
      is_devalued: isOutletDevalued,
      devaluasi_poin: devaluasiPoinOutlet,
      devaluasi_kupon: devaluasiKuponOutlet,
    };
  });

  const bulanTotal = outletSummaries.reduce(
    (acc, o) => ({
      transaksi: acc.transaksi + o.total_transaksi,
      poin: acc.poin + o.poin,
      kupon: acc.kupon + o.kupon,
      devaluasi_poin: acc.devaluasi_poin + (o.devaluasi_poin || 0),
      devaluasi_kupon: acc.devaluasi_kupon + (o.devaluasi_kupon || 0),
    }),
    { transaksi: 0, poin: 0, kupon: 0, devaluasi_poin: 0, devaluasi_kupon: 0 }
  );

  // Kumulatif seluruh transaksi aktif sejak program dimulai (1 Sep 2026) s.d. hari pengecekan / transaksi terakhir
  const kumulatifRow = db
    .prepare(`
      SELECT
        COALESCE(SUM(i.poin), 0)  AS kumulatif_poin,
        COALESCE(SUM(i.kupon), 0) AS kumulatif_kupon,
        MAX(i.tanggal)            AS transaksi_terakhir
      FROM invoices i
      JOIN outlets o ON i.outlet_id = o.id
      WHERE o.identity_id = ?
        AND i.tanggal >= '2026-09-01'
        AND i.tanggal <= ?
        AND i.is_excluded = 0
    `)
    .get(identityId, bulanEnd) as { kumulatif_poin: number; kumulatif_kupon: number; transaksi_terakhir: string | null };

  // Kumulatif bruto (sebelum devaluasi/sanksi)
  const allInvoicesCum = db
    .prepare(`
      SELECT i.jumlah, i.poin, i.kupon, o.tipe
      FROM invoices i
      JOIN outlets o ON i.outlet_id = o.id
      WHERE o.identity_id = ?
        AND i.tanggal >= '2026-09-01'
        AND i.tanggal <= ?
    `)
    .all(identityId, bulanEnd) as { jumlah: number; poin: number; kupon: number; tipe: OutletTipe }[];

  let grossCumPoin = 0;
  let grossCumKupon = 0;
  for (const inv of allInvoicesCum) {
    const rate = getRate(inv.tipe);
    grossCumPoin += Math.floor(inv.jumlah / rate);
    grossCumKupon += Math.floor(inv.jumlah / nilaiKupon);
  }

  // ---------------------------------------------------------------------------
  // Waste Purchasing Calculations (UCO)
  // ---------------------------------------------------------------------------
  const wasteMonthRow = db
    .prepare(`
      SELECT
        COALESCE(SUM(w.berat_kg), 0)     AS total_kg,
        COALESCE(SUM(w.total_rupiah), 0) AS total_rupiah,
        COALESCE(SUM(w.poin), 0)         AS total_poin
      FROM waste_purchases w
      WHERE w.identity_id = ?
        AND w.tanggal >= ? AND w.tanggal <= ?
    `)
    .get(identityId, bulanStart, bulanEnd) as {
      total_kg: number;
      total_rupiah: number;
      total_poin: number;
    };

  const grossWasteBulanPoin = wasteMonthRow?.total_poin ?? 0;
  const wasteBulanKg = wasteMonthRow?.total_kg ?? 0;
  const wasteBulanRupiah = wasteMonthRow?.total_rupiah ?? 0;
  const wasteBulanPoin = isMonthSuspended ? 0 : grossWasteBulanPoin;
  const devaluasiWasteBulanPoin = isMonthSuspended ? grossWasteBulanPoin : 0;

  const wasteCumRow = db
    .prepare(`
      SELECT
        COALESCE(SUM(w.berat_kg), 0)     AS total_kg,
        COALESCE(SUM(w.total_rupiah), 0) AS total_rupiah,
        COALESCE(SUM(w.poin), 0)         AS total_poin
      FROM waste_purchases w
      WHERE w.identity_id = ?
        AND w.tanggal >= '2026-09-01'
        AND w.tanggal <= ?
    `)
    .get(identityId, bulanEnd) as {
      total_kg: number;
      total_rupiah: number;
      total_poin: number;
    };

  const grossWasteCumPoin = wasteCumRow?.total_poin ?? 0;
  const wasteKumulatifKg = wasteCumRow?.total_kg ?? 0;
  const wasteKumulatifRupiah = wasteCumRow?.total_rupiah ?? 0;
  const wasteKumulatifPoin = isMonthSuspended ? 0 : grossWasteCumPoin;

  const outletsWaste = db
    .prepare(`
      SELECT
        w.outlet_id,
        o.nama_outlet,
        COALESCE(SUM(w.berat_kg), 0)     AS berat_kg,
        COALESCE(SUM(w.total_rupiah), 0) AS total_rupiah,
        COALESCE(SUM(w.poin), 0)         AS poin
      FROM waste_purchases w
      JOIN outlets o ON o.id = w.outlet_id
      WHERE w.identity_id = ?
        AND w.tanggal >= ? AND w.tanggal <= ?
      GROUP BY w.outlet_id
    `)
    .all(identityId, bulanStart, bulanEnd) as Array<{
      outlet_id: string;
      nama_outlet: string;
      berat_kg: number;
      total_rupiah: number;
      poin: number;
      is_void?: boolean;
    }>;

  if (isMonthSuspended) {
    for (const ow of outletsWaste) {
      ow.is_void = true;
    }
  }

  const voidedCouponsDb = db.prepare(`
    SELECT COALESCE(SUM(voided_coupons_count), 0) AS total_voided_coupons,
           COALESCE(SUM(wiped_points), 0) AS total_wiped_points
    FROM member_penalties
    WHERE identity_id = ?
  `).get(identityId) as { total_voided_coupons: number; total_wiped_points: number };

  const netKumulatifPoin = (kumulatifRow?.kumulatif_poin ?? 0) + wasteKumulatifPoin;
  const netKumulatifKupon = kumulatifRow?.kumulatif_kupon ?? 0;

  // Devaluasi & Void gabungan (Belanja + Waste Purchasing)
  const grossBulanBelanjaKupon = outletSummaries.reduce((acc, o) => acc + (o.kupon_seharusnya || 0), 0);
  const grossBulanPoin = (bulanTotal.poin + (bulanTotal.devaluasi_poin || 0)) + grossWasteBulanPoin;
  const totalDevaluasiBulanPoin = isMonthSuspended ? grossBulanPoin : ((bulanTotal.devaluasi_poin || 0) + devaluasiWasteBulanPoin);
  const totalDevaluasiBulanKupon = isMonthSuspended ? grossBulanBelanjaKupon : (bulanTotal.devaluasi_kupon || 0);

  const sebelumnyaKumulatifPoin = Math.max(
    grossCumPoin + grossWasteCumPoin,
    netKumulatifPoin + voidedCouponsDb.total_wiped_points + (isMonthSuspended ? grossWasteCumPoin : 0)
  );
  const sebelumnyaKumulatifKupon = Math.max(grossCumKupon, netKumulatifKupon + voidedCouponsDb.total_voided_coupons);

  const totalDevaluasiKumulatifPoin = Math.max(0, sebelumnyaKumulatifPoin - netKumulatifPoin);
  const totalDevaluasiKumulatifKupon = Math.max(0, sebelumnyaKumulatifKupon - netKumulatifKupon);

  const hasDevaluasi = isMonthSuspended || totalDevaluasiKumulatifPoin > 0 || totalDevaluasiKumulatifKupon > 0;

  // ---------------------------------------------------------------------------
  // Customer Savings Calculation (Nilai yang dihemat per bulan)
  // ---------------------------------------------------------------------------
  const savingParkirRow = db.prepare(`SELECT nilai FROM rules_config WHERE kunci = 'saving_parkir_per_trx'`).get() as { nilai: number } | undefined;
  const savingKurirRow = db.prepare(`SELECT nilai FROM rules_config WHERE kunci = 'saving_kurir_per_trx'`).get() as { nilai: number } | undefined;
  const savingParkirPerTrx = savingParkirRow?.nilai ?? 2000;
  const savingKurirPerTrx = savingKurirRow?.nilai ?? 15000;

  const trxCountRow = db
    .prepare(`
      SELECT COUNT(i.id) AS trx_count
      FROM invoices i
      JOIN outlets o ON i.outlet_id = o.id
      WHERE o.identity_id = ?
        AND i.tanggal >= ? AND i.tanggal <= ?
    `)
    .get(identityId, bulanStart, bulanEnd) as { trx_count: number } | undefined;

  const hematTrxCount = trxCountRow?.trx_count ?? 0;
  const totalHematParkir = hematTrxCount * savingParkirPerTrx;
  const totalHematKurir = hematTrxCount * savingKurirPerTrx;
  const totalNilaiPenghematan = totalHematParkir + totalHematKurir;

  // Histori 13 bulan
  const histori: MonthlyHistory[] = PERIODE_MONTHS.map((m, idx) => {
    const mStart = `${m}-01`;
    const [y2, m2] = m.split('-');
    const ld = new Date(Number(y2), Number(m2), 0).getDate();
    const mEnd = `${m}-${String(ld).padStart(2, '0')}`;

    const monthInvoices = db
      .prepare(`
        SELECT i.jumlah, i.poin, i.kupon, o.tipe
        FROM invoices i
        JOIN outlets o ON i.outlet_id = o.id
        WHERE o.identity_id = ?
          AND i.tanggal >= ? AND i.tanggal <= ?
      `)
      .all(identityId, mStart, mEnd) as { jumlah: number; poin: number; kupon: number; tipe: OutletTipe }[];

    let mTotalTransaksi = 0;
    let mActualPoin = 0;
    let mActualKupon = 0;
    let mGrossPoin = 0;
    let mGrossKupon = 0;

    for (const inv of monthInvoices) {
      mTotalTransaksi += inv.jumlah;
      mActualPoin += inv.poin;
      mActualKupon += inv.kupon;
      const rate = getRate(inv.tipe);
      mGrossPoin += Math.floor(inv.jumlah / rate);
      mGrossKupon += Math.floor(inv.jumlah / nilaiKupon);
    }

    const monthWaste = db
      .prepare(`
        SELECT
          COALESCE(SUM(poin), 0)         AS poin,
          COALESCE(SUM(total_rupiah), 0) AS total_rupiah,
          COALESCE(SUM(berat_kg), 0)     AS berat_kg
        FROM waste_purchases
        WHERE identity_id = ? AND tanggal >= ? AND tanggal <= ?
      `)
      .get(identityId, mStart, mEnd) as { poin: number; total_rupiah: number; berat_kg: number } | undefined;

    const rawMonthWastePoin = monthWaste?.poin ?? 0;
    const mDevaluasiBelanjaPoin = Math.max(0, mGrossPoin - mActualPoin);
    const mDevaluasiKupon = Math.max(0, mGrossKupon - mActualKupon);
    const mIsSuspended = (m === bulan && isMonthSuspended) || ((mDevaluasiBelanjaPoin > 0 || mDevaluasiKupon > 0) && (mActualPoin === 0 && mTotalTransaksi > 0));

    const monthWastePoin = mIsSuspended ? 0 : rawMonthWastePoin;
    const mDevaluasiWastePoin = mIsSuspended ? rawMonthWastePoin : 0;
    const mDevaluasiPoin = mIsSuspended ? (mGrossPoin + rawMonthWastePoin) : (mDevaluasiBelanjaPoin + mDevaluasiWastePoin);
    const mDevaluasiKuponVal = mIsSuspended ? mGrossKupon : mDevaluasiKupon;

    return {
      no: idx + 1,
      bulan: m,
      label: bulanLabel(m),
      total_transaksi: mTotalTransaksi,
      poin: mIsSuspended ? 0 : (mActualPoin + monthWastePoin),
      bonus_poin: 0,  // Fase berikutnya (PRD 5)
      kupon: mIsSuspended ? 0 : mActualKupon,
      is_suspended: mIsSuspended,
      devaluasi_poin: mDevaluasiPoin,
      devaluasi_kupon: mDevaluasiKuponVal,
      waste_rupiah: monthWaste?.total_rupiah ?? 0,
      waste_kg: monthWaste?.berat_kg ?? 0,
      waste_poin: monthWastePoin,
    };
  });

  const suspendNote = isMonthSuspended
    ? '*Pemberian Poin & Kupon dinonaktifkan sementara (Status Evaluasi Khusus)'
    : null;

  // ---------------------------------------------------------------------------
  // Kupon Fisik Yang Diserahkan pada Periode Bulan Ini (Opsi A)
  // ---------------------------------------------------------------------------
  const couponsDb = db
    .prepare(`
      SELECT nomor_kupon, nomor_urut, tanggal_serah
      FROM coupons
      WHERE identity_id = ?
        AND (periode_kupon = ? OR strftime('%Y-%m', tanggal_serah) = ?)
        AND status = 'aktif'
      ORDER BY nomor_urut ASC
    `)
    .all(identityId, bulan, bulan) as Array<{
      nomor_kupon: string;
      nomor_urut: number;
      tanggal_serah?: string;
    }>;

  const totalFisik = couponsDb.length;
  let kuponDetail: StatementCouponDetail;

  if (totalFisik === 0) {
    kuponDetail = {
      total_fisik_aktif: 0,
      items: [],
      ranges: [],
      pecahan: [],
      format_mode: 'empty',
    };
  } else if (totalFisik <= 10) {
    kuponDetail = {
      total_fisik_aktif: totalFisik,
      items: couponsDb,
      ranges: [],
      pecahan: couponsDb.map((c) => c.nomor_kupon),
      format_mode: 'full',
    };
  } else {
    // Kelompokkan nomor urut yang berurutan kontigu
    const runs: Array<{ start: string; end: string; count: number; items: string[] }> = [];
    let currentRun: Array<{ nomor_kupon: string; nomor_urut: number }> = [couponsDb[0]];

    for (let i = 1; i < couponsDb.length; i++) {
      const prev = couponsDb[i - 1];
      const curr = couponsDb[i];
      if (curr.nomor_urut === prev.nomor_urut + 1) {
        currentRun.push(curr);
      } else {
        runs.push({
          start: currentRun[0].nomor_kupon,
          end: currentRun[currentRun.length - 1].nomor_kupon,
          count: currentRun.length,
          items: currentRun.map((c) => c.nomor_kupon),
        });
        currentRun = [curr];
      }
    }
    if (currentRun.length > 0) {
      runs.push({
        start: currentRun[0].nomor_kupon,
        end: currentRun[currentRun.length - 1].nomor_kupon,
        count: currentRun.length,
        items: currentRun.map((c) => c.nomor_kupon),
      });
    }

    const ranges: Array<{ start: string; end: string; count: number }> = [];
    const pecahan: string[] = [];

    for (const r of runs) {
      if (r.count >= 3) {
        ranges.push({
          start: r.start,
          end: r.end,
          count: r.count,
        });
      } else {
        pecahan.push(...r.items);
      }
    }

    kuponDetail = {
      total_fisik_aktif: totalFisik,
      items: couponsDb,
      ranges,
      pecahan,
      format_mode: 'range_and_singles',
    };
  }

  return {
    identity_id: identityId,
    nama_pemilik: identity.nama_pemilik,
    alamat: identity.alamat || '',
    kecamatan: identity.kecamatan || '',
    kota: identity.kota || '',
    kode_pos: identity.kode_pos || '',
    provinsi: identity.provinsi || '',
    bulan,
    bulan_label: bulanLabel(bulan),
    bulan_transaksi: bulanTotal.transaksi,
    bulan_belanja_poin: isMonthSuspended ? 0 : bulanTotal.poin,
    bulan_poin: isMonthSuspended ? 0 : (bulanTotal.poin + wasteBulanPoin),
    gross_bulan_poin: grossBulanPoin,
    gross_waste_bulan_poin: grossWasteBulanPoin,
    devaluasi_waste_bulan_poin: devaluasiWasteBulanPoin,
    bulan_bonus_poin: 0,
    bulan_kupon: isMonthSuspended ? 0 : bulanTotal.kupon,
    kumulatif_poin: netKumulatifPoin,
    kumulatif_kupon: netKumulatifKupon,
    transaksi_terakhir: kumulatifRow?.transaksi_terakhir ?? null,
    outlets: outletSummaries,
    histori,
    is_suspended: isMonthSuspended,
    suspend_type: isMonthSuspended ? activeType : null,
    suspend_dari: activeDari,
    suspend_sampai: activeSampai,
    suspend_reason: isMonthSuspended ? activeReason : null,
    suspend_note: suspendNote,
    has_devaluasi: hasDevaluasi,
    devaluasi_bulan_poin: totalDevaluasiBulanPoin,
    devaluasi_bulan_kupon: totalDevaluasiBulanKupon,
    sebelumnya_kumulatif_poin: sebelumnyaKumulatifPoin,
    sebelumnya_kumulatif_kupon: sebelumnyaKumulatifKupon,
    total_devaluasi_kumulatif_poin: totalDevaluasiKumulatifPoin,
    total_devaluasi_kumulatif_kupon: totalDevaluasiKumulatifKupon,
    // Waste Purchasing metrics
    waste_bulan_kg: wasteBulanKg,
    waste_bulan_rupiah: wasteBulanRupiah,
    waste_bulan_poin: wasteBulanPoin,
    waste_kumulatif_kg: wasteKumulatifKg,
    waste_kumulatif_rupiah: wasteKumulatifRupiah,
    waste_kumulatif_poin: wasteKumulatifPoin,
    outlets_waste: outletsWaste,
    // Nilai Penghematan Customer
    hemat_trx_count: hematTrxCount,
    saving_parkir_per_trx: savingParkirPerTrx,
    saving_kurir_per_trx: savingKurirPerTrx,
    total_hemat_parkir: totalHematParkir,
    total_hemat_kurir: totalHematKurir,
    total_nilai_penghematan: totalNilaiPenghematan,
    kupon_detail: kuponDetail,
  };
}

export { PERIODE_MONTHS };
