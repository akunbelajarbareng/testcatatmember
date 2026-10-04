/**
 * calc.ts — Core Point & Coupon Calculation Engine
 * Implements PRD Section 5 rules exactly.
 */
import db from './db';

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
  suspend_reason?: string | null;
  suspend_note?: string | null;
}

export interface MonthlyHistory {
  no: number;
  bulan: string; // YYYY-MM
  label: string; // "SEPTEMBER 2026"
  total_transaksi: number;
  poin: number;
  bonus_poin: number;
  kupon: number;
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
      const isExcluded = exclusions.some(
        (ex) => inv.tanggal >= ex.dari && inv.tanggal <= ex.sampai
      );
      if (isExcluded) {
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

  // Outlet-outlet aktif
  const outletsDb = db
    .prepare(`SELECT o.id, o.nama_outlet, o.tipe FROM outlets o WHERE o.identity_id = ? AND o.aktif = 1`)
    .all(identityId) as { id: string; nama_outlet: string; tipe: OutletTipe }[];

  // Ringkasan per outlet untuk BULAN INI
  const outletSummaries: OutletSummary[] = outletsDb.map((o) => {
    const agg = db
      .prepare(`
        SELECT 
          COALESCE(SUM(jumlah), 0) AS total_transaksi,
          COALESCE(SUM(poin), 0)   AS poin,
          COALESCE(SUM(kupon), 0)  AS kupon
        FROM invoices
        WHERE outlet_id = ?
          AND tanggal >= ? AND tanggal <= ?
          AND is_excluded = 0
      `)
      .get(o.id, bulanStart, bulanEnd) as { total_transaksi: number; poin: number; kupon: number };

    return {
      outlet_id: o.id,
      nama_outlet: o.nama_outlet,
      tipe: o.tipe,
      identity_id: identityId,
      total_transaksi: agg.total_transaksi,
      poin: agg.poin,
      kupon: agg.kupon,
    };
  });

  const bulanTotal = outletSummaries.reduce(
    (acc, o) => ({
      transaksi: acc.transaksi + o.total_transaksi,
      poin: acc.poin + o.poin,
      kupon: acc.kupon + o.kupon,
    }),
    { transaksi: 0, poin: 0, kupon: 0 }
  );

  // Kumulatif seluruh transaksi aktif sejak program dimulai (1 Sep 2026) s.d. hari pengecekan / transaksi terakhir
  const kumulatif = db
    .prepare(`
      SELECT
        COALESCE(SUM(i.poin), 0)  AS kumulatif_poin,
        COALESCE(SUM(i.kupon), 0) AS kumulatif_kupon,
        MAX(i.tanggal)            AS transaksi_terakhir
      FROM invoices i
      JOIN outlets o ON i.outlet_id = o.id
      WHERE o.identity_id = ?
        AND i.tanggal >= '2026-09-01'
        AND i.is_excluded = 0
    `)
    .get(identityId) as { kumulatif_poin: number; kumulatif_kupon: number; transaksi_terakhir: string | null };

  // Histori 13 bulan
  const histori: MonthlyHistory[] = PERIODE_MONTHS.map((m, idx) => {
    const mStart = `${m}-01`;
    const [y2, m2] = m.split('-');
    const ld = new Date(Number(y2), Number(m2), 0).getDate();
    const mEnd = `${m}-${String(ld).padStart(2, '0')}`;

    const hAgg = db
      .prepare(`
        SELECT
          COALESCE(SUM(i.jumlah), 0) AS total_transaksi,
          COALESCE(SUM(i.poin), 0)   AS poin,
          COALESCE(SUM(i.kupon), 0)  AS kupon
        FROM invoices i
        JOIN outlets o ON i.outlet_id = o.id
        WHERE o.identity_id = ?
          AND i.tanggal >= ? AND i.tanggal <= ?
          AND i.is_excluded = 0
      `)
      .get(identityId, mStart, mEnd) as { total_transaksi: number; poin: number; kupon: number };

    return {
      no: idx + 1,
      bulan: m,
      label: bulanLabel(m),
      total_transaksi: hAgg.total_transaksi,
      poin: hAgg.poin,
      bonus_poin: 0,  // Fase berikutnya (PRD 5)
      kupon: hAgg.kupon,
    };
  });

  // Cek status sanksi / penangguhan member untuk bulan statement ini
  let isMonthSuspended = false;
  let activeReason = identity.suspend_reason || null;
  let activeType = identity.suspend_type || null;

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
      SELECT jenis_sanksi, alasan
      FROM member_penalties
      WHERE identity_id = ?
        AND dari <= ?
        AND (sampai IS NULL OR sampai >= ?)
      ORDER BY id DESC
      LIMIT 1
    `).get(identityId, bulanEnd, bulanStart) as { jenis_sanksi: 'temporary' | 'permanent'; alasan: string } | undefined;

    if (pastPenalty) {
      isMonthSuspended = true;
      activeReason = pastPenalty.alasan;
      activeType = pastPenalty.jenis_sanksi;
    }
  }

  const suspendNote = isMonthSuspended
    ? '*Pemberian Poin & Kupon dinonaktifkan sementara (Status Evaluasi Khusus)'
    : null;

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
    bulan_poin: bulanTotal.poin,
    bulan_bonus_poin: 0,
    bulan_kupon: bulanTotal.kupon,
    kumulatif_poin: kumulatif.kumulatif_poin,
    kumulatif_kupon: kumulatif.kumulatif_kupon,
    transaksi_terakhir: kumulatif.transaksi_terakhir,
    outlets: outletSummaries,
    histori,
    is_suspended: isMonthSuspended,
    suspend_type: isMonthSuspended ? activeType : null,
    suspend_reason: isMonthSuspended ? activeReason : null,
    suspend_note: suspendNote,
  };
}

export { PERIODE_MONTHS };
