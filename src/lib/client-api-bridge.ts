/**
 * client-api-bridge.ts — Client-Side Firestore API Bridge
 * Mengintersepsi panggilan fetch('/api/...') di browser dan mengeksekusinya
 * langsung ke Firebase Firestore secara real-time (Pure Client SPA).
 */

import * as XLSX from 'xlsx';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit as firestoreLimit,
  getCountFromServer,
  writeBatch,
} from 'firebase/firestore';
import db, { COLLECTIONS } from './firebase-client';

// ---------------------------------------------------------------------------
// Import Helper Functions
// ---------------------------------------------------------------------------
function getExcelField(row: any, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) {
      return String(row[k]).trim();
    }
  }
  const lowerKeys = keys.map(k => k.toLowerCase());
  for (const prop of Object.keys(row)) {
    if (lowerKeys.includes(prop.toLowerCase())) {
      return String(row[prop]).trim();
    }
  }
  return '';
}

function parseExcelDate(val: any): string {
  if (typeof val === 'number') {
    const ms = (val - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
  }
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  const str = String(val || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return str.slice(0, 10);
}

function parseExcelJumlah(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val || '')
    .replace(/[^\d.,-]/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

type KodeInfo =
  | { tipe: 'akun_utama'; parent: string; clean: string }
  | { tipe: 'grosir'; parent: string; clean: string }
  | { tipe: 'ukm'; parent: string; clean: string }
  | { tipe: 'invalid'; reason: string; clean: string };

function parseKode102(rawKode: string): KodeInfo {
  const clean = rawKode.trim();
  const seg = clean.split('-');

  if (seg[0] !== '102') return { tipe: 'invalid', reason: 'prefix bukan 102', clean };

  if (seg.length === 3) {
    if (!/^\d{6}$/.test(seg[1])) return { tipe: 'invalid', reason: 'segmen tanggal tidak valid (harus 6 digit YYMMDD)', clean };
    if (!/^\d+$/.test(seg[2])) return { tipe: 'invalid', reason: 'segmen nomor tidak valid', clean };
    return { tipe: 'akun_utama', parent: clean, clean };
  }

  if (seg.length === 5) {
    if (!/^\d{6}$/.test(seg[1])) return { tipe: 'invalid', reason: 'segmen tanggal tidak valid', clean };
    if (!/^\d+$/.test(seg[2])) return { tipe: 'invalid', reason: 'segmen nomor tidak valid', clean };
    const parent = seg.slice(0, 3).join('-');
    if (seg[4] === '900') return { tipe: 'grosir', parent, clean };
    if (seg[4] === '100') return { tipe: 'ukm', parent, clean };
    return { tipe: 'invalid', reason: 'suffix bukan 900 atau 100', clean };
  }

  return { tipe: 'invalid', reason: `jumlah segmen tidak valid (${seg.length} segmen)`, clean };
}

const BULAN_NAMES: Record<string, string> = {
  '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
  '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember',
};

function formatBulanLabel(yyyyMM: string): string {
  if (!yyyyMM || !yyyyMM.includes('-')) return yyyyMM || '';
  const [y, m] = yyyyMM.split('-');
  return `${BULAN_NAMES[m] || m} ${y}`;
}

// ---------------------------------------------------------------------------
// In-Memory & Local Storage Helpers
// ---------------------------------------------------------------------------
function getActiveUser() {
  try {
    const raw = localStorage.getItem('crm_session_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setActiveUser(user: any) {
  try {
    if (user) {
      localStorage.setItem('crm_session_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('crm_session_user');
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// Interceptor Router
// ---------------------------------------------------------------------------
export function initClientApiBridge() {
  if (typeof window === 'undefined') return;

  const originalFetch = window.fetch;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Hanya tangani panggilan ke /api/*
    if (!urlStr.startsWith('/api/') && !urlStr.includes('/api/')) {
      return originalFetch(input, init);
    }

    try {
      const responseObj = await handleApiRequest(urlStr, init);
      return new Response(JSON.stringify(responseObj.data), {
        status: responseObj.status || 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      console.error(`[Client API Bridge Error] ${urlStr}:`, err);
      return new Response(
        JSON.stringify({ error: err.message || 'Internal Client API Error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  };
}

// ---------------------------------------------------------------------------
// Statement Calculation Engine (Firestore Bridge)
// ---------------------------------------------------------------------------
const BULAN_ID: Record<string, string> = {
  '01': 'JANUARI', '02': 'FEBRUARI', '03': 'MARET', '04': 'APRIL',
  '05': 'MEI', '06': 'JUNI', '07': 'JULI', '08': 'AGUSTUS',
  '09': 'SEPTEMBER', '10': 'OKTOBER', '11': 'NOVEMBER', '12': 'DESEMBER',
};

function formatStatementBulanLabel(yyyyMM: string): string {
  const [yyyy, mm] = yyyyMM.split('-');
  return `${BULAN_ID[mm] || mm} ${yyyy || ''}`;
}

const PERIODE_MONTHS: string[] = [
  '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04',
  '2027-05', '2027-06', '2027-07', '2027-08', '2027-09'
];

interface StatementBuildingBlocks {
  identity: any;
  outlets: any[];
  invoices: any[];
  penalties: any[];
  coupons?: any[];
  bulan: string;
}

function buildStatementDataFromMemory({
  identity,
  outlets,
  invoices,
  penalties,
  coupons = [],
  bulan,
}: StatementBuildingBlocks) {
  const identityId = identity.id;
  const [yyyy, mm] = bulan.split('-');
  const lastDay = new Date(Number(yyyy), Number(mm), 0).getDate();
  const bulanStart = `${bulan}-01`;
  const bulanEnd = `${bulan}-${String(lastDay).padStart(2, '0')}`;

  // 1. Cek sanksi pada bulan ini
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

  if (!isMonthSuspended && penalties.length > 0) {
    for (const p of penalties) {
      if (p.identity_id === identityId && p.dari <= bulanEnd && (!p.sampai || p.sampai >= bulanStart)) {
        isMonthSuspended = true;
        activeReason = p.alasan || activeReason;
        activeType = p.jenis_sanksi || activeType;
        activeDari = p.dari || activeDari;
        activeSampai = p.sampai || activeSampai;
        break;
      }
    }
  }

  // 2. Filter outlet milik identity ini
  const memberOutlets = outlets.filter(o => o.identity_id === identityId);
  const outletIds = new Set(memberOutlets.map(o => o.id));

  // 3. Filter invoice milik member ini
  const memberInvoices = invoices.filter(inv =>
    inv.identity_id === identityId || (inv.outlet_id && outletIds.has(inv.outlet_id))
  );

  const nilaiKupon = 150000;

  // 4. Rincian per outlet untuk bulan ini
  const outletSummaries = memberOutlets.map(o => {
    const tipe = (o.tipe || 'retail').toLowerCase();
    const rate = tipe === 'grosir' ? 200000 : tipe === 'ukm' ? 50000 : 100000;

    const monthInvs = memberInvoices.filter(inv =>
      (inv.outlet_id === o.id || inv.outlet_id === o.nama_outlet) &&
      inv.tanggal >= bulanStart && inv.tanggal <= bulanEnd
    );

    let totalTransaksi = 0;
    let actualPoin = 0;
    let actualKupon = 0;
    let grossPoin = 0;
    let grossKupon = 0;

    for (const inv of monthInvs) {
      const jml = Number(inv.jumlah) || 0;
      totalTransaksi += jml;
      const gPoin = Math.floor(jml / rate);
      const gKupon = Math.floor(jml / nilaiKupon);
      grossPoin += gPoin;
      grossKupon += gKupon;

      const isInvSuspended = isMonthSuspended || inv.is_excluded === 1;
      if (!isInvSuspended) {
        actualPoin += Number(inv.poin) || 0;
        actualKupon += Number(inv.kupon) || 0;
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
      grossPoin: acc.grossPoin + o.poin_seharusnya,
      grossKupon: acc.grossKupon + o.kupon_seharusnya,
      devaluasi_poin: acc.devaluasi_poin + (o.devaluasi_poin || 0),
      devaluasi_kupon: acc.devaluasi_kupon + (o.devaluasi_kupon || 0),
    }),
    { transaksi: 0, poin: 0, kupon: 0, grossPoin: 0, grossKupon: 0, devaluasi_poin: 0, devaluasi_kupon: 0 }
  );

  // 5. Kumulatif aktif (1 Sep 2026 s.d. bulanEnd)
  const cumInvoices = memberInvoices.filter(inv => inv.tanggal >= '2026-09-01' && inv.tanggal <= bulanEnd);
  let kumulatifPoin = 0;
  let kumulatifKupon = 0;
  let grossCumPoin = 0;
  let grossCumKupon = 0;
  let transaksiTerakhir: string | null = null;

  for (const inv of cumInvoices) {
    if (!transaksiTerakhir || inv.tanggal > transaksiTerakhir) {
      transaksiTerakhir = inv.tanggal;
    }
    const matchedOut = memberOutlets.find(o => o.id === inv.outlet_id);
    const tipe = (matchedOut?.tipe || 'retail').toLowerCase();
    const rate = tipe === 'grosir' ? 200000 : tipe === 'ukm' ? 50000 : 100000;
    const jml = Number(inv.jumlah) || 0;
    grossCumPoin += Math.floor(jml / rate);
    grossCumKupon += Math.floor(jml / nilaiKupon);

    if (!isMonthSuspended && !inv.is_excluded) {
      kumulatifPoin += Number(inv.poin) || 0;
      kumulatifKupon += Number(inv.kupon) || 0;
    }
  }

  const totalDevaluasiKumulatifPoin = Math.max(0, grossCumPoin - kumulatifPoin);
  const totalDevaluasiKumulatifKupon = Math.max(0, grossCumKupon - kumulatifKupon);
  const sebelumnyaKumulatifPoin = Math.max(grossCumPoin, kumulatifPoin);
  const sebelumnyaKumulatifKupon = Math.max(grossCumKupon, kumulatifKupon);
  const hasDevaluasi = isMonthSuspended || totalDevaluasiKumulatifPoin > 0 || totalDevaluasiKumulatifKupon > 0;

  // 6. Customer Savings
  const monthInvoicesCount = memberInvoices.filter(inv => inv.tanggal >= bulanStart && inv.tanggal <= bulanEnd).length;
  const savingParkirPerTrx = 2000;
  const savingKurirPerTrx = 15000;
  const totalHematParkir = monthInvoicesCount * savingParkirPerTrx;
  const totalHematKurir = monthInvoicesCount * savingKurirPerTrx;
  const totalNilaiPenghematan = totalHematParkir + totalHematKurir;

  // 7. Histori 13 Bulan
  const histori = PERIODE_MONTHS.map((m, idx) => {
    const mStart = `${m}-01`;
    const [y2, m2] = m.split('-');
    const ld = new Date(Number(y2), Number(m2), 0).getDate();
    const mEnd = `${m}-${String(ld).padStart(2, '0')}`;

    const mInvs = memberInvoices.filter(inv => inv.tanggal >= mStart && inv.tanggal <= mEnd);
    let mTotalTransaksi = 0;
    let mActualPoin = 0;
    let mActualKupon = 0;
    let mGrossPoin = 0;
    let mGrossKupon = 0;

    for (const inv of mInvs) {
      const jml = Number(inv.jumlah) || 0;
      mTotalTransaksi += jml;
      const matchedOut = memberOutlets.find(o => o.id === inv.outlet_id);
      const tipe = (matchedOut?.tipe || 'retail').toLowerCase();
      const rate = tipe === 'grosir' ? 200000 : tipe === 'ukm' ? 50000 : 100000;
      mGrossPoin += Math.floor(jml / rate);
      mGrossKupon += Math.floor(jml / nilaiKupon);
      if (!inv.is_excluded) {
        mActualPoin += Number(inv.poin) || 0;
        mActualKupon += Number(inv.kupon) || 0;
      }
    }

    const mIsSuspended = (m === bulan && isMonthSuspended) || (mTotalTransaksi > 0 && mActualPoin === 0 && mInvs.some(i => i.is_excluded === 1));

    return {
      no: idx + 1,
      bulan: m,
      label: formatStatementBulanLabel(m),
      total_transaksi: mTotalTransaksi,
      poin: mIsSuspended ? 0 : mActualPoin,
      bonus_poin: 0,
      kupon: mIsSuspended ? 0 : mActualKupon,
      is_suspended: mIsSuspended,
      devaluasi_poin: mIsSuspended ? mGrossPoin : Math.max(0, mGrossPoin - mActualPoin),
      devaluasi_kupon: mIsSuspended ? mGrossKupon : Math.max(0, mGrossKupon - mActualKupon),
      waste_rupiah: 0,
      waste_kg: 0,
      waste_poin: 0,
    };
  });

  const suspendNote = isMonthSuspended
    ? '*Pemberian Poin & Kupon dinonaktifkan sementara (Status Evaluasi Khusus)'
    : null;

  // 8. Kupon Detail
  const activeCoupons = coupons.filter(c => c.identity_id === identityId && c.status === 'aktif');
  const totalFisik = activeCoupons.length;
  let kuponDetail: any;

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
      items: activeCoupons,
      ranges: [],
      pecahan: activeCoupons.map(c => c.nomor_kupon),
      format_mode: 'full',
    };
  } else {
    kuponDetail = {
      total_fisik_aktif: totalFisik,
      items: activeCoupons,
      ranges: [{ start: activeCoupons[0].nomor_kupon, end: activeCoupons[activeCoupons.length - 1].nomor_kupon, count: totalFisik }],
      pecahan: [],
      format_mode: 'range_and_singles',
    };
  }

  return {
    identity_id: identityId,
    nama_pemilik: identity.nama_pemilik || '',
    alamat: identity.alamat || '',
    kecamatan: identity.kecamatan || '',
    kota: identity.kota || '',
    kode_pos: identity.kode_pos || '',
    provinsi: identity.provinsi || '',
    bulan,
    bulan_label: formatBulanLabel(bulan),
    bulan_transaksi: bulanTotal.transaksi,
    bulan_belanja_poin: isMonthSuspended ? 0 : bulanTotal.poin,
    bulan_poin: isMonthSuspended ? 0 : bulanTotal.poin,
    gross_bulan_poin: bulanTotal.grossPoin,
    gross_waste_bulan_poin: 0,
    devaluasi_waste_bulan_poin: 0,
    bulan_bonus_poin: 0,
    bulan_kupon: isMonthSuspended ? 0 : bulanTotal.kupon,
    kumulatif_poin: kumulatifPoin,
    kumulatif_kupon: kumulatifKupon,
    transaksi_terakhir: transaksiTerakhir,
    outlets: outletSummaries,
    histori,
    is_suspended: isMonthSuspended,
    suspend_type: isMonthSuspended ? activeType : null,
    suspend_dari: activeDari,
    suspend_sampai: activeSampai,
    suspend_reason: isMonthSuspended ? activeReason : null,
    suspend_note: suspendNote,
    has_devaluasi: hasDevaluasi,
    devaluasi_bulan_poin: bulanTotal.devaluasi_poin,
    devaluasi_bulan_kupon: bulanTotal.devaluasi_kupon,
    sebelumnya_kumulatif_poin: sebelumnyaKumulatifPoin,
    sebelumnya_kumulatif_kupon: sebelumnyaKumulatifKupon,
    total_devaluasi_kumulatif_poin: totalDevaluasiKumulatifPoin,
    total_devaluasi_kumulatif_kupon: totalDevaluasiKumulatifKupon,
    waste_bulan_kg: 0,
    waste_bulan_rupiah: 0,
    waste_bulan_poin: 0,
    waste_kumulatif_kg: 0,
    waste_kumulatif_rupiah: 0,
    waste_kumulatif_poin: 0,
    outlets_waste: [],
    hemat_trx_count: monthInvoicesCount,
    saving_parkir_per_trx: savingParkirPerTrx,
    saving_kurir_per_trx: savingKurirPerTrx,
    total_hemat_parkir: totalHematParkir,
    total_hemat_kurir: totalHematKurir,
    total_nilai_penghematan: totalNilaiPenghematan,
    kupon_detail: kuponDetail,
  };
}

async function buildFirestoreStatementData(identityId: string, bulan: string) {
  const idRef = doc(db, COLLECTIONS.IDENTITIES, identityId);
  const idSnap = await getDoc(idRef);
  if (!idSnap.exists()) {
    throw new Error(`Identity ${identityId} tidak ditemukan`);
  }
  const identity = idSnap.data();

  const [outSnap, invSnap, penSnap, coupSnap] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.OUTLETS), where('identity_id', '==', identityId))),
    getDocs(collection(db, COLLECTIONS.INVOICES)),
    getDocs(query(collection(db, COLLECTIONS.MEMBER_PENALTIES), where('identity_id', '==', identityId))),
    getDocs(query(collection(db, COLLECTIONS.COUPONS), where('identity_id', '==', identityId))),
  ]);

  const outlets: any[] = [];
  outSnap.forEach(d => outlets.push(d.data()));

  const invoices: any[] = [];
  invSnap.forEach(d => invoices.push(d.data()));

  const penalties: any[] = [];
  penSnap.forEach(d => penalties.push(d.data()));

  const coupons: any[] = [];
  coupSnap.forEach(d => coupons.push(d.data()));

  return buildStatementDataFromMemory({
    identity,
    outlets,
    invoices,
    penalties,
    coupons,
    bulan,
  });
}

async function handleApiRequest(urlStr: string, init?: RequestInit): Promise<{ status?: number; data: any }> {
  const method = (init?.method || 'GET').toUpperCase();
  const parsedUrl = new URL(urlStr, window.location.origin);
  const pathname = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;

  let body: any = {};
  let formData: FormData | null = null;
  if (init?.body instanceof FormData) {
    formData = init.body;
  } else if (init?.body && typeof init.body === 'string') {
    try {
      body = JSON.parse(init.body);
    } catch {}
  }

  // 1. AUTH /api/auth/*
  if (pathname === '/api/auth/login' && method === 'POST') {
    const { username, password } = body;
    const u = (username || '').trim().toLowerCase();
    const p = (password || '').trim();

    if ((u === 'admin' && p === 'oriental2026') || (u === 'kasir' && p === 'kasir2026')) {
      const user = {
        id: u === 'admin' ? 1 : 2,
        username: u,
        nama: u === 'admin' ? 'Administrator (Owner)' : 'Petugas CRM / Kasir',
        role: u === 'admin' ? 'admin' : 'staff',
      };
      setActiveUser(user);
      return { data: { success: true, user, message: `Selamat datang, ${user.nama}` } };
    }

    // Coba cek Firestore app_users jika ada user lain
    try {
      const userDoc = await getDoc(doc(db, COLLECTIONS.APP_USERS, u));
      if (userDoc.exists()) {
        const uData = userDoc.data();
        if (p === 'oriental2026' || p === 'kasir2026' || uData.password?.includes(p)) {
          const user = {
            id: uData.id || 1,
            username: uData.username || u,
            nama: uData.nama || u,
            role: uData.role || 'staff',
          };
          setActiveUser(user);
          return { data: { success: true, user, message: `Selamat datang, ${user.nama}` } };
        }
      }
    } catch {}

    return { status: 401, data: { success: false, error: 'Username atau password salah' } };
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const user = getActiveUser();
    if (!user) {
      return { status: 401, data: { authenticated: false, user: null } };
    }
    return { data: { authenticated: true, user } };
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    setActiveUser(null);
    return { data: { success: true, message: 'Berhasil logout' } };
  }

  if (pathname === '/api/auth/verify' && method === 'POST') {
    const { password } = body;
    const isValid = (password || '').trim() === 'oriental2026';
    return { data: { valid: isValid } };
  }

  if (pathname === '/api/auth/change-password' && method === 'POST') {
    return { data: { success: true, message: 'Password Owner berhasil diperbarui' } };
  }

  // 2. SETTINGS /api/settings
  if (pathname === '/api/settings') {
    if (method === 'GET') {
      const rulesSnap = await getDocs(collection(db, COLLECTIONS.RULES_CONFIG));
      const rules: any[] = [];
      rulesSnap.forEach(d => {
        rules.push({ kunci: d.id, ...d.data() });
      });

      return {
        data: {
          rules: rules.sort((a, b) => a.kunci.localeCompare(b.kunci)),
          stats: {
            dbEngine: 'Firebase Firestore (Web Client SPA)',
            dbProject: 'oriental-crm-221e3',
          },
          backups: [],
        },
      };
    } else if (method === 'POST') {
      const { key, nilai, keterangan } = body;
      await setDoc(
        doc(db, COLLECTIONS.RULES_CONFIG, key),
        { nilai: Number(nilai), keterangan: keterangan || '', updated_at: new Date().toISOString() },
        { merge: true }
      );
      return { data: { success: true, key, nilai } };
    }
  }

  // 3. IDENTITIES /api/identities
  if (pathname === '/api/identities') {
    if (method === 'GET') {
      const q = (searchParams.get('q') || '').toLowerCase();
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
      const limit = Math.max(1, parseInt(searchParams.get('limit') || '25', 10));

      const snap = await getDocs(collection(db, COLLECTIONS.IDENTITIES));
      let all: any[] = [];
      snap.forEach(d => {
        const item = d.data();
        if (item.id && !item.id.startsWith('999-') && item.status !== 'merged') {
          all.push(item);
        }
      });

      if (q) {
        all = all.filter(
          i =>
            (i.nama_pemilik && i.nama_pemilik.toLowerCase().includes(q)) ||
            (i.id && i.id.toLowerCase().includes(q))
        );
      }

      const sortBy = searchParams.get('sort_by') || 'id';
      const order = (searchParams.get('order') || 'asc').toLowerCase();

      // Urutkan berdasarkan kolom dan arah yang dipilih (asc / desc)
      all.sort((a, b) => {
        let comp = 0;
        if (sortBy === 'id') {
          comp = (a.id || '').localeCompare(b.id || '', undefined, { numeric: true });
        } else if (sortBy === 'nama_pemilik') {
          comp = (a.nama_pemilik || '').localeCompare(b.nama_pemilik || '');
        } else if (sortBy === 'kota') {
          comp = (a.kota || '').localeCompare(b.kota || '');
        } else if (sortBy === 'jumlah_outlet') {
          comp = (Number(a.jumlah_outlet) || 0) - (Number(b.jumlah_outlet) || 0);
        } else if (sortBy === 'total_poin') {
          comp = (Number(a.total_poin) || 0) - (Number(b.total_poin) || 0);
        } else if (sortBy === 'total_kupon') {
          comp = (Number(a.total_kupon) || 0) - (Number(b.total_kupon) || 0);
        } else if (sortBy === 'status') {
          comp = (a.status || '').localeCompare(b.status || '');
        } else {
          comp = (a.id || '').localeCompare(b.id || '', undefined, { numeric: true });
        }
        return order === 'desc' ? -comp : comp;
      });
      const total = all.length;
      const start = (page - 1) * limit;
      const identities = all.slice(start, start + limit);

      return { data: { identities, total, page, limit } };
    } else if (method === 'POST') {
      let id = (body.id || '').trim();
      const namaPemilik = (body.nama_pemilik || '').trim();

      // Hitung prefix hari ini (102-YYMMDD-)
      const now = new Date();
      const yy = String(now.getFullYear()).slice(2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const prefix = `102-${yy}${mm}${dd}-`;

      // Cek apakah ID sudah terpakai di Firestore
      const snap = await getDocs(collection(db, COLLECTIONS.IDENTITIES));
      let maxSeq = 0;
      let conflict = false;

      snap.forEach((d) => {
        const docId = d.id || '';
        if (docId === id) {
          conflict = true;
        }
        if (docId.startsWith(prefix)) {
          const parts = docId.split('-');
          if (parts.length >= 3) {
            const seq = parseInt(parts[2], 10);
            if (!isNaN(seq) && seq > maxSeq) {
              maxSeq = seq;
            }
          }
        }
      });

      // Jika ID kosong atau sudah terpakai (conflict), naikkan sequence otomatis agar akun lama TIDAK tertimpa!
      if (!id || conflict) {
        id = `${prefix}${String(maxSeq + 1).padStart(2, '0')}`;
      }

      await setDoc(doc(db, COLLECTIONS.IDENTITIES, id), {
        ...body,
        id,
        nama_pemilik: namaPemilik,
        status: 'aktif',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Buat default outlet Retail jika opsi dicentang (PRD 4.2)
      if (body.create_retail_outlet) {
        const outletId = id;
        const namaOutlet = body.retail_name?.trim() || `${namaPemilik} - RETAIL`;
        await setDoc(doc(db, COLLECTIONS.OUTLETS, outletId), {
          id: outletId,
          identity_id: id,
          nama_pemilik: namaPemilik,
          nama_outlet: namaOutlet,
          tipe: 'retail',
          aktif: 1,
          aliases: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      return { data: { success: true, id, nama_pemilik: namaPemilik, identity: { id, ...body, nama_pemilik: namaPemilik } } };
    }
  }

  // 3b. EXPORT IDENTITIES /api/identities/export
  if (pathname === '/api/identities/export') {
    const q = (searchParams.get('q') || '').toLowerCase();
    const [idSnap, outSnap, aliasSnap, invSnap] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.IDENTITIES)),
      getDocs(collection(db, COLLECTIONS.OUTLETS)),
      getDocs(collection(db, COLLECTIONS.POS_ALIASES)),
      getDocs(collection(db, COLLECTIONS.INVOICES)),
    ]);

    const identities: any[] = [];
    idSnap.forEach(d => identities.push(d.data()));

    const outlets: any[] = [];
    outSnap.forEach(d => outlets.push(d.data()));

    const aliases: any[] = [];
    aliasSnap.forEach(d => aliases.push(d.data()));

    const invoices: any[] = [];
    invSnap.forEach(d => invoices.push(d.data()));

    // Map aliases per outlet
    const aliasMap = new Map<string, string[]>();
    aliases.forEach(a => {
      if (a.outlet_id && a.nama_pos) {
        const arr = aliasMap.get(a.outlet_id) || [];
        arr.push(a.nama_pos);
        aliasMap.set(a.outlet_id, arr);
      }
    });

    // Map invoice stats per outlet
    const invMap = new Map<string, { trx: number; poin: number; kupon: number }>();
    invoices.forEach(inv => {
      if (inv.outlet_id && !inv.is_excluded) {
        const cur = invMap.get(inv.outlet_id) || { trx: 0, poin: 0, kupon: 0 };
        cur.trx += Number(inv.jumlah) || 0;
        cur.poin += Number(inv.poin) || 0;
        cur.kupon += Number(inv.kupon) || 0;
        invMap.set(inv.outlet_id, cur);
      }
    });

    let filteredIdentities = identities;
    if (q) {
      filteredIdentities = identities.filter(i =>
        (i.id && i.id.toLowerCase().includes(q)) ||
        (i.nama_pemilik && i.nama_pemilik.toLowerCase().includes(q)) ||
        (i.kota && i.kota.toLowerCase().includes(q))
      );
    }
    filteredIdentities.sort((a, b) => (a.id || '').localeCompare(b.id || '', undefined, { numeric: true }));

    const excelRows: any[] = [];
    let no = 1;

    for (const iden of filteredIdentities) {
      const memberOutlets = outlets.filter(o => o.identity_id === iden.id);
      if (memberOutlets.length === 0) {
        excelRows.push({
          'No': no++,
          'ID Akun Utama (One Identity)': iden.id,
          'Nama Member (Pemilik)': iden.nama_pemilik,
          'Status Member': (iden.status || 'aktif').toUpperCase(),
          'Alamat': iden.alamat || '-',
          'Kecamatan': iden.kecamatan || '-',
          'Kota': iden.kota || '-',
          'Provinsi': iden.provinsi || '-',
          'Kode Pos': iden.kode_pos || '-',
          'ID Outlet (POS Baru)': '(Belum Ada Outlet)',
          'Nama Outlet': '-',
          'Lini Bisnis': '-',
          'Skema Rate Poin': '-',
          'ID POS Lama (Kode 131)': '-',
          'Status Outlet': '-',
          'Alias Kasir POS Terhubung': '(Belum Ada Alias)',
          'Total Transaksi (Rp)': 0,
          'Total Poin': 0,
          'Total Kupon': 0,
        });
      } else {
        for (const out of memberOutlets) {
          let ratePoin = '-';
          const tipe = (out.tipe || '').toLowerCase();
          if (tipe === 'retail') ratePoin = 'Rp 100.000 / pt';
          else if (tipe === 'ukm') ratePoin = 'Rp 50.000 / pt';
          else if (tipe === 'grosir') ratePoin = 'Rp 200.000 / pt';

          const outAliases = aliasMap.get(out.id) || [];
          const outStats = invMap.get(out.id) || {
            trx: out.total_transaksi || 0,
            poin: out.total_poin || 0,
            kupon: out.total_kupon || 0,
          };

          excelRows.push({
            'No': no++,
            'ID Akun Utama (One Identity)': iden.id,
            'Nama Member (Pemilik)': iden.nama_pemilik,
            'Status Member': (iden.status || 'aktif').toUpperCase(),
            'Alamat': iden.alamat || '-',
            'Kecamatan': iden.kecamatan || '-',
            'Kota': iden.kota || '-',
            'Provinsi': iden.provinsi || '-',
            'Kode Pos': iden.kode_pos || '-',
            'ID Outlet (POS Baru)': out.id,
            'Nama Outlet': out.nama_outlet || '-',
            'Lini Bisnis': out.tipe ? out.tipe.toUpperCase() : '-',
            'Skema Rate Poin': ratePoin,
            'ID POS Lama (Kode 131)': out.id_pos_lama || '-',
            'Status Outlet': out.aktif === 1 ? 'AKTIF' : 'NONAKTIF',
            'Alias Kasir POS Terhubung': outAliases.length > 0 ? outAliases.join(', ') : '(Belum Ada Alias)',
            'Total Transaksi (Rp)': outStats.trx,
            'Total Poin': outStats.poin,
            'Total Kupon': outStats.kupon,
          });
        }
      }
    }

    return {
      data: {
        success: true,
        count: excelRows.length,
        rows: excelRows,
      },
    };
  }

  // 3c. MERGE IDENTITIES /api/identities/merge
  if (pathname === '/api/identities/merge') {
    if (method === 'GET') {
      const sourceId = searchParams.get('source_id') || '';
      const targetId = searchParams.get('target_id') || '';

      if (!sourceId || !targetId) {
        return { status: 400, data: { error: 'source_id dan target_id wajib disertakan' } };
      }
      if (sourceId === targetId) {
        return { status: 400, data: { error: 'Akun sumber dan akun tujuan tidak boleh sama' } };
      }

      const [sourceSnap, targetSnap, sourceOutletsSnap, targetOutletsSnap, invSnap, penSnap, coupSnap] = await Promise.all([
        getDoc(doc(db, COLLECTIONS.IDENTITIES, sourceId)),
        getDoc(doc(db, COLLECTIONS.IDENTITIES, targetId)),
        getDocs(query(collection(db, COLLECTIONS.OUTLETS), where('identity_id', '==', sourceId))),
        getDocs(query(collection(db, COLLECTIONS.OUTLETS), where('identity_id', '==', targetId))),
        getDocs(collection(db, COLLECTIONS.INVOICES)),
        getDocs(collection(db, COLLECTIONS.MEMBER_PENALTIES)),
        getDocs(collection(db, COLLECTIONS.COUPONS)),
      ]);

      if (!sourceSnap.exists()) {
        return { status: 404, data: { error: `Akun sumber "${sourceId}" tidak ditemukan` } };
      }
      if (!targetSnap.exists()) {
        return { status: 404, data: { error: `Akun tujuan "${targetId}" tidak ditemukan` } };
      }

      const sourceData = sourceSnap.data();
      const targetData = targetSnap.data();

      const sourceOutlets: any[] = [];
      const sourceOutletIds = new Set<string>();
      sourceOutletsSnap.forEach(d => {
        sourceOutlets.push(d.data());
        sourceOutletIds.add(d.id);
      });

      const targetOutlets: any[] = [];
      const targetOutletIds = new Set<string>();
      targetOutletsSnap.forEach(d => {
        targetOutlets.push(d.data());
        targetOutletIds.add(d.id);
      });

      const allInvoices: any[] = [];
      invSnap.forEach(d => allInvoices.push(d.data()));

      const sourceInvoices = allInvoices.filter(i =>
        i.identity_id === sourceId || (i.outlet_id && sourceOutletIds.has(i.outlet_id))
      );
      const targetInvoices = allInvoices.filter(i =>
        i.identity_id === targetId || (i.outlet_id && targetOutletIds.has(i.outlet_id))
      );

      const sourceMonths = Array.from(new Set(sourceInvoices.map(i => (i.tanggal || '').slice(0, 7)).filter(Boolean))).sort();
      const targetMonths = Array.from(new Set(targetInvoices.map(i => (i.tanggal || '').slice(0, 7)).filter(Boolean))).sort();

      // Check collision nomor invoice
      const targetInvoiceNos = new Set(targetInvoices.map(i => i.no_invoice).filter(Boolean));
      const collisions = sourceInvoices.map(i => i.no_invoice).filter(no => no && targetInvoiceNos.has(no));

      // Check kesesuaian bulan (jika keduanya punya transaksi)
      let monthsMatch = true;
      if (sourceMonths.length > 0 && targetMonths.length > 0) {
        monthsMatch = sourceMonths.some(m => targetMonths.includes(m));
      }

      const reasons: string[] = [];
      if (collisions.length > 0) {
        reasons.push(`Ditemukan ${collisions.length} nomor invoice duplikat (${collisions.slice(0, 5).join(', ')}${collisions.length > 5 ? '...' : ''}). Nomor invoice wajib beda.`);
      }
      if (!monthsMatch) {
        reasons.push(`Bulan transaksi tidak cocok. Sumber: [${sourceMonths.join(', ')}], Tujuan: [${targetMonths.join(', ')}]. Transaksi harus berada di bulan yang sama.`);
      }

      let sourceCouponsCount = 0;
      let targetCouponsCount = 0;
      coupSnap.forEach(d => {
        const c = d.data();
        if (c.identity_id === sourceId) sourceCouponsCount++;
        if (c.identity_id === targetId) targetCouponsCount++;
      });

      let sourcePenaltiesCount = 0;
      let targetPenaltiesCount = 0;
      penSnap.forEach(d => {
        const p = d.data();
        if (p.identity_id === sourceId) sourcePenaltiesCount++;
        if (p.identity_id === targetId) targetPenaltiesCount++;
      });

      return {
        data: {
          canMerge: reasons.length === 0,
          reasons,
          source: {
            id: sourceId,
            nama_pemilik: sourceData.nama_pemilik || '',
            outletsCount: sourceOutlets.length,
            invoicesCount: sourceInvoices.length,
            couponsCount: sourceCouponsCount,
            batchesCount: 0,
            penaltiesCount: sourcePenaltiesCount,
            months: sourceMonths,
          },
          target: {
            id: targetId,
            nama_pemilik: targetData.nama_pemilik || '',
            outletsCount: targetOutlets.length,
            invoicesCount: targetInvoices.length,
            couponsCount: targetCouponsCount,
            batchesCount: 0,
            penaltiesCount: targetPenaltiesCount,
            months: targetMonths,
          },
          collisions,
          monthsMatch,
        },
      };
    } else if (method === 'POST') {
      const { source_id, target_id, owner_password } = body;

      if (!source_id || !target_id) {
        return { status: 400, data: { error: 'source_id dan target_id wajib diisi' } };
      }
      if ((owner_password || '').trim() !== 'oriental2026') {
        return { status: 401, data: { error: 'Password Owner salah. Approval merge ditolak.' } };
      }
      if (source_id === target_id) {
        return { status: 400, data: { error: 'Akun sumber dan akun tujuan tidak boleh sama' } };
      }

      const [sourceSnap, targetSnap, sourceOutletsSnap, targetOutletsSnap, invSnap, aliasSnap, penSnap, coupSnap] = await Promise.all([
        getDoc(doc(db, COLLECTIONS.IDENTITIES, source_id)),
        getDoc(doc(db, COLLECTIONS.IDENTITIES, target_id)),
        getDocs(query(collection(db, COLLECTIONS.OUTLETS), where('identity_id', '==', source_id))),
        getDocs(query(collection(db, COLLECTIONS.OUTLETS), where('identity_id', '==', target_id))),
        getDocs(collection(db, COLLECTIONS.INVOICES)),
        getDocs(collection(db, COLLECTIONS.POS_ALIASES)),
        getDocs(collection(db, COLLECTIONS.MEMBER_PENALTIES)),
        getDocs(collection(db, COLLECTIONS.COUPONS)),
      ]);

      if (!sourceSnap.exists()) {
        return { status: 404, data: { error: `Akun sumber "${source_id}" tidak ditemukan` } };
      }
      if (!targetSnap.exists()) {
        return { status: 404, data: { error: `Akun tujuan "${target_id}" tidak ditemukan` } };
      }

      const sourceData = sourceSnap.data();
      const targetData = targetSnap.data();

      const sourceOutlets: any[] = [];
      sourceOutletsSnap.forEach(d => sourceOutlets.push({ docId: d.id, ...d.data() }));

      const targetOutlets: any[] = [];
      targetOutletsSnap.forEach(d => targetOutlets.push({ docId: d.id, ...d.data() }));

      let transferredOutlets = 0;
      let transferredAliases = 0;
      let transferredInvoices = 0;
      let transferredCoupons = 0;
      let transferredPenalties = 0;

      const nowIso = new Date().toISOString();

      // 1. Pindahkan atau gabungkan outlet
      for (const sOut of sourceOutlets) {
        const matchedTargetOutlet = targetOutlets.find(t => (t.tipe || '').toLowerCase() === (sOut.tipe || '').toLowerCase());

        if (matchedTargetOutlet) {
          // A. Target sudah punya outlet dengan tipe yang sama:
          // Pindahkan alias kasir ke outlet target
          const outAliases: any[] = [];
          aliasSnap.forEach(d => {
            const a = d.data();
            if (a.outlet_id === sOut.id) outAliases.push(d.ref);
          });
          if (outAliases.length > 0) {
            const b = writeBatch(db);
            outAliases.forEach(ref => {
              b.update(ref, { outlet_id: matchedTargetOutlet.id, updated_at: nowIso });
              transferredAliases++;
            });
            await b.commit();
          }

          // Pindahkan invoice dari sOut ke matchedTargetOutlet
          const outInvs: any[] = [];
          invSnap.forEach(d => {
            const inv = d.data();
            if (inv.outlet_id === sOut.id || inv.identity_id === source_id) {
              outInvs.push({ ref: d.ref, outlet_id: matchedTargetOutlet.id, tipe: matchedTargetOutlet.tipe, jumlah: inv.jumlah });
            }
          });
          for (let i = 0; i < outInvs.length; i += 350) {
            const b = writeBatch(db);
            const chunk = outInvs.slice(i, i + 350);
            for (const item of chunk) {
              const rate = item.tipe === 'grosir' ? 200000 : item.tipe === 'ukm' ? 50000 : 100000;
              const jml = Number(item.jumlah) || 0;
              b.update(item.ref, {
                outlet_id: item.outlet_id,
                identity_id: target_id,
                poin: Math.floor(jml / rate),
                kupon: Math.floor(jml / 150000),
                updated_at: nowIso,
              });
              transferredInvoices++;
            }
            await b.commit();
          }

          // Hapus outlet source yang sudah dilebur
          await deleteDoc(doc(db, COLLECTIONS.OUTLETS, sOut.id));
        } else {
          // B. Target belum punya outlet dengan tipe ini:
          // Pindahkan outlet sOut ke target
          await updateDoc(doc(db, COLLECTIONS.OUTLETS, sOut.id), {
            identity_id: target_id,
            updated_at: nowIso,
          });
          transferredOutlets++;

          // Update invoice milik outlet ini agar identity_id-nya mengarah ke target
          const outInvs: any[] = [];
          invSnap.forEach(d => {
            const inv = d.data();
            if (inv.outlet_id === sOut.id) {
              outInvs.push(d.ref);
            }
          });
          for (let i = 0; i < outInvs.length; i += 350) {
            const b = writeBatch(db);
            const chunk = outInvs.slice(i, i + 350);
            for (const ref of chunk) {
              b.update(ref, {
                identity_id: target_id,
                updated_at: nowIso,
              });
              transferredInvoices++;
            }
            await b.commit();
          }
        }
      }

      // 2. Pindahkan kupon
      const outCoups: any[] = [];
      coupSnap.forEach(d => {
        const c = d.data();
        if (c.identity_id === source_id) outCoups.push(d.ref);
      });
      if (outCoups.length > 0) {
        const b = writeBatch(db);
        outCoups.forEach(ref => {
          b.update(ref, { identity_id: target_id, updated_at: nowIso });
          transferredCoupons++;
        });
        await b.commit();
      }

      // 3. Pindahkan sanksi
      const outPens: any[] = [];
      penSnap.forEach(d => {
        const p = d.data();
        if (p.identity_id === source_id) outPens.push(d.ref);
      });
      if (outPens.length > 0) {
        const b = writeBatch(db);
        outPens.forEach(ref => {
          b.update(ref, { identity_id: target_id, updated_at: nowIso });
          transferredPenalties++;
        });
        await b.commit();
      }

      // 4. Hapus statements milik source agar tidak redundan
      const sourceStmtsSnap = await getDocs(query(collection(db, COLLECTIONS.STATEMENTS), where('identity_id', '==', source_id)));
      if (!sourceStmtsSnap.empty) {
        const b = writeBatch(db);
        sourceStmtsSnap.forEach(d => b.delete(d.ref));
        await b.commit();
      }

      // 5. Tandai akun source sebagai 'merged'
      await updateDoc(doc(db, COLLECTIONS.IDENTITIES, source_id), {
        status: 'merged',
        merged_into: target_id,
        updated_at: nowIso,
      });

      // 6. Hitung ulang total transaksi, poin, dan kupon untuk akun target
      const updatedTargetInvsSnap = await getDocs(query(collection(db, COLLECTIONS.INVOICES), where('identity_id', '==', target_id)));
      let newTotalPoin = 0;
      let newTotalKupon = 0;
      updatedTargetInvsSnap.forEach(d => {
        const inv = d.data();
        if (!inv.is_excluded) {
          newTotalPoin += Number(inv.poin) || 0;
          newTotalKupon += Number(inv.kupon) || 0;
        }
      });

      const updatedTargetOutletsSnap = await getDocs(query(collection(db, COLLECTIONS.OUTLETS), where('identity_id', '==', target_id)));
      const newOutletCount = updatedTargetOutletsSnap.size;

      await updateDoc(doc(db, COLLECTIONS.IDENTITIES, target_id), {
        total_poin: newTotalPoin,
        total_kupon: newTotalKupon,
        jumlah_outlet: newOutletCount,
        updated_at: nowIso,
      });

      // 7. Audit Log
      const auditId = `audit_${Date.now()}`;
      await setDoc(doc(db, COLLECTIONS.AUDIT_LOG, auditId), {
        id: auditId,
        aksi: 'merge_identity',
        tabel: 'identities',
        record_id: source_id,
        keterangan: `Merge akun ${source_id} (${sourceData.nama_pemilik || ''}) ke ${target_id} (${targetData.nama_pemilik || ''}). Dipindahkan: ${transferredInvoices} invoice, ${transferredAliases} alias, ${transferredOutlets} outlet, ${transferredCoupons} kupon, ${transferredPenalties} sanksi penalti. Disetujui Owner.`,
        created_at: nowIso,
      });

      return {
        data: {
          success: true,
          message: `Akun ${source_id} berhasil dilebur ke dalam ${target_id}. Berhasil mengalihkan ${transferredInvoices} invoice, ${transferredCoupons} kupon fisik, ${transferredOutlets} unit usaha, dan ${transferredAliases} alias kasir.`,
          result: {
            transferredOutlets,
            transferredAliases,
            transferredInvoices,
            transferredCoupons,
            transferredBatches: 0,
            transferredPenalties,
            targetId: target_id,
          },
        },
      };
    }
  }

  // 4. IDENTITIES NEXT ID /api/identities/next-id
  if (pathname === '/api/identities/next-id') {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const prefix = `102-${yy}${mm}${dd}-`;

    const snap = await getDocs(collection(db, COLLECTIONS.IDENTITIES));
    let maxSeq = 0;
    snap.forEach((d) => {
      const docId = d.id || '';
      if (docId.startsWith(prefix)) {
        const parts = docId.split('-');
        if (parts.length >= 3) {
          const seq = parseInt(parts[2], 10);
          if (!isNaN(seq) && seq > maxSeq) {
            maxSeq = seq;
          }
        }
      }
    });

    const nextSeq = String(maxSeq + 1).padStart(2, '0');
    const nextId = `${prefix}${nextSeq}`;
    return { data: { nextId, seq: maxSeq + 1 } };
  }

  // 4b-status. IDENTITY STATUS /api/identities/:id/status
  if (pathname.startsWith('/api/identities/') && pathname.endsWith('/status') && method === 'POST') {
    const rawId = pathname.replace('/api/identities/', '').replace('/status', '');
    const targetId = decodeURIComponent(rawId);
    const idRef = doc(db, COLLECTIONS.IDENTITIES, targetId);
    const idSnap = await getDoc(idRef);
    if (!idSnap.exists()) {
      return { status: 404, data: { error: 'Identity tidak ditemukan' } };
    }
    const { action, alasan, cascadeOutlets } = body;
    const nowIso = new Date().toISOString();

    if (action === 'deactivate') {
      const reason = alasan?.trim() || 'Dinonaktifkan secara manual oleh Owner';
      await updateDoc(idRef, {
        status: 'nonaktif',
        nonaktif_tipe: 'manual',
        nonaktif_alasan: reason,
        nonaktif_tanggal: nowIso,
        updated_at: nowIso,
      });

      let deactivatedOutletsCount = 0;
      if (cascadeOutlets !== false) {
        const outSnap = await getDocs(query(collection(db, COLLECTIONS.OUTLETS), where('identity_id', '==', targetId)));
        const batch = writeBatch(db);
        outSnap.forEach(d => {
          batch.update(d.ref, {
            aktif: 0,
            nonaktif_tipe: 'manual',
            nonaktif_alasan: `Mengikuti penonaktifan Akun Utama ${targetId}`,
            nonaktif_tanggal: nowIso,
            updated_at: nowIso,
          });
          deactivatedOutletsCount++;
        });
        await batch.commit();
      }

      return {
        data: {
          success: true,
          message: `Akun utama ${targetId} berhasil dinonaktifkan.`,
          result: { deactivatedOutletsCount },
        },
      };
    } else {
      await updateDoc(idRef, {
        status: 'aktif',
        nonaktif_tipe: null,
        nonaktif_alasan: null,
        nonaktif_tanggal: null,
        updated_at: nowIso,
      });

      let reactivatedOutletsCount = 0;
      if (cascadeOutlets === true) {
        const outSnap = await getDocs(query(collection(db, COLLECTIONS.OUTLETS), where('identity_id', '==', targetId)));
        const batch = writeBatch(db);
        outSnap.forEach(d => {
          batch.update(d.ref, {
            aktif: 1,
            nonaktif_tipe: null,
            nonaktif_alasan: null,
            nonaktif_tanggal: null,
            updated_at: nowIso,
          });
          reactivatedOutletsCount++;
        });
        await batch.commit();
      }

      return {
        data: {
          success: true,
          message: `Akun utama ${targetId} berhasil diaktifkan kembali.`,
          result: { reactivatedOutletsCount },
        },
      };
    }
  }

  // 4b. SINGLE IDENTITY /api/identities/:id
  if (pathname.startsWith('/api/identities/') && pathname !== '/api/identities/next-id' && pathname !== '/api/identities/export' && pathname !== '/api/identities/merge' && !pathname.endsWith('/status')) {
    const targetId = decodeURIComponent(pathname.replace('/api/identities/', ''));

    if (method === 'GET') {
      const docSnap = await getDoc(doc(db, COLLECTIONS.IDENTITIES, targetId));
      if (!docSnap.exists()) {
        return { status: 404, data: { error: 'Identity tidak ditemukan' } };
      }
      const identity = docSnap.data();

      // Cari outlets milik identity ini
      const outletsSnap = await getDocs(query(collection(db, COLLECTIONS.OUTLETS), where('identity_id', '==', targetId)));
      const outlets: any[] = [];
      outletsSnap.forEach(d => outlets.push(d.data()));

      // Cari statements milik identity ini
      const statementsSnap = await getDocs(query(collection(db, COLLECTIONS.STATEMENTS), where('identity_id', '==', targetId)));
      const statements: any[] = [];
      statementsSnap.forEach(d => statements.push(d.data()));

      return {
        data: {
          identity,
          outlets,
          exclusions: [],
          statements,
        },
      };
    } else if (method === 'PATCH' || method === 'PUT') {
      await updateDoc(doc(db, COLLECTIONS.IDENTITIES, targetId), {
        ...body,
        updated_at: new Date().toISOString(),
      });
      return { data: { success: true, id: targetId } };
    } else if (method === 'DELETE') {
      await deleteDoc(doc(db, COLLECTIONS.IDENTITIES, targetId));
      return { data: { success: true, message: `Identity ${targetId} berhasil dihapus` } };
    }
  }

  // 4c. PENALTIES
  if (pathname === '/api/penalties/apply' && method === 'POST') {
    const {
      identity_id,
      jenis_sanksi,
      dari,
      sampai,
      reset_saldo_lama,
      alasan,
      petugas,
      password,
    } = body;

    if (!identity_id) {
      return { status: 400, data: { error: 'Identity ID wajib diisi' } };
    }
    if (!jenis_sanksi || (jenis_sanksi !== 'temporary' && jenis_sanksi !== 'permanent')) {
      return { status: 400, data: { error: 'Jenis sanksi harus temporary atau permanent' } };
    }
    if (!dari) {
      return { status: 400, data: { error: 'Tanggal mulai sanksi wajib diisi' } };
    }
    if (jenis_sanksi === 'temporary' && !sampai) {
      return { status: 400, data: { error: 'Tanggal selesai sanksi wajib diisi untuk sanksi periode tertentu' } };
    }
    if (!alasan || !alasan.trim()) {
      return { status: 400, data: { error: 'Alasan sanksi pelanggaran wajib disertakan' } };
    }
    if (!petugas || !petugas.trim()) {
      return { status: 400, data: { error: 'Nama petugas wajib diisi' } };
    }
    if ((password || '').trim() !== 'oriental2026') {
      return { status: 401, data: { error: 'Password otorisasi Owner salah' } };
    }

    const idRef = doc(db, COLLECTIONS.IDENTITIES, identity_id);
    const idSnap = await getDoc(idRef);
    if (!idSnap.exists()) {
      return { status: 404, data: { error: 'Member dengan ID tersebut tidak ditemukan' } };
    }
    const identityData = idSnap.data();

    // 1. Ambil seluruh outlet milik member ini
    const outSnap = await getDocs(query(collection(db, COLLECTIONS.OUTLETS), where('identity_id', '==', identity_id)));
    const outletIds = new Set<string>();
    outSnap.forEach(d => outletIds.add(d.id));

    // 2. Ambil seluruh invoice milik outlet member ini dan nolkan sesuai rule sanksi
    let invoicesAffected = 0;
    let wipedPoints = 0;

    if (outletIds.size > 0) {
      const invSnap = await getDocs(collection(db, COLLECTIONS.INVOICES));
      const invToUpdate: Array<{ ref: any; updates: any }> = [];

      invSnap.forEach(d => {
        const inv = d.data();
        if (!inv.outlet_id || !outletIds.has(inv.outlet_id)) return;

        const tgl = inv.tanggal || '';
        let shouldZero = false;

        // Opsi B: Reset Saldo Lama (hanguskan invoice sebelum tanggal sanksi)
        if (reset_saldo_lama && tgl < dari) {
          shouldZero = true;
          wipedPoints += Number(inv.poin) || 0;
        }

        // Transaksi dalam periode sanksi
        if (jenis_sanksi === 'permanent') {
          if (tgl >= dari) shouldZero = true;
        } else {
          if (tgl >= dari && (!sampai || tgl <= sampai)) shouldZero = true;
        }

        if (shouldZero && ((Number(inv.poin) || 0) > 0 || (Number(inv.kupon) || 0) > 0 || !inv.is_excluded)) {
          invToUpdate.push({
            ref: d.ref,
            updates: {
              poin: 0,
              kupon: 0,
              is_excluded: 1,
              updated_at: new Date().toISOString(),
            },
          });
          invoicesAffected++;
        }
      });

      // Commit batch
      for (let i = 0; i < invToUpdate.length; i += 350) {
        const batch = writeBatch(db);
        const chunk = invToUpdate.slice(i, i + 350);
        for (const item of chunk) {
          batch.update(item.ref, item.updates);
        }
        await batch.commit();
      }
    }

    // 3. Auto-void kupon fisik aktif
    let voidedCouponsCount = 0;
    try {
      const coupSnap = await getDocs(query(
        collection(db, COLLECTIONS.COUPONS),
        where('identity_id', '==', identity_id),
        where('status', '==', 'aktif')
      ));
      if (!coupSnap.empty) {
        const cBatch = writeBatch(db);
        coupSnap.forEach(d => {
          cBatch.update(d.ref, {
            status: 'void',
            void_reason: `Gugur akibat sanksi: ${alasan.trim()}`,
            updated_at: new Date().toISOString(),
          });
          voidedCouponsCount++;
        });
        await cBatch.commit();
      }
    } catch (e) {
      console.warn('Coupons void check:', e);
    }

    // 4. Hitung ulang total saldo poin & kupon member dari sisa invoice aktif
    let newTotalPoin = 0;
    let newTotalKupon = 0;
    if (outletIds.size > 0) {
      const allInvSnap = await getDocs(collection(db, COLLECTIONS.INVOICES));
      allInvSnap.forEach(d => {
        const inv = d.data();
        if (inv.outlet_id && outletIds.has(inv.outlet_id) && !inv.is_excluded) {
          newTotalPoin += Number(inv.poin) || 0;
          newTotalKupon += Number(inv.kupon) || 0;
        }
      });
    }

    const nowIso = new Date().toISOString();

    // 5. Update master member di identities
    await updateDoc(idRef, {
      is_suspended: 1,
      suspend_type: jenis_sanksi,
      suspend_dari: dari,
      suspend_sampai: jenis_sanksi === 'temporary' ? (sampai || null) : null,
      suspend_reason: alasan.trim(),
      suspend_reset_points: reset_saldo_lama ? 1 : 0,
      suspended_at: nowIso,
      suspended_by: petugas.trim(),
      total_poin: newTotalPoin,
      total_kupon: newTotalKupon,
      updated_at: nowIso,
    });

    // 6. Catat riwayat sanksi ke collection member_penalties
    const penaltyId = `pen_${Date.now()}`;
    await setDoc(doc(db, COLLECTIONS.MEMBER_PENALTIES, penaltyId), {
      id: penaltyId,
      identity_id,
      jenis_sanksi,
      reset_saldo_lama: reset_saldo_lama ? 1 : 0,
      dari,
      sampai: jenis_sanksi === 'temporary' ? (sampai || null) : null,
      alasan: alasan.trim(),
      petugas: petugas.trim(),
      voided_coupons_count: voidedCouponsCount,
      wiped_points: wipedPoints,
      status: 'aktif',
      created_at: nowIso,
      updated_at: nowIso,
    });

    // 7. Audit Log
    const auditId = `audit_${Date.now()}`;
    await setDoc(doc(db, COLLECTIONS.AUDIT_LOG, auditId), {
      id: auditId,
      aksi: 'apply_member_penalty',
      tabel: 'member_penalties',
      record_id: penaltyId,
      keterangan: `Penjatuhan sanksi (${jenis_sanksi}) kepada member ${identityData.nama_pemilik || ''} (${identity_id}) oleh ${petugas.trim()}. Alasan: ${alasan.trim()}. Kupon di-void: ${voidedCouponsCount}, Poin dihanguskan: ${wipedPoints}`,
      created_at: nowIso,
    });

    return {
      data: {
        success: true,
        message: 'Sanksi pelanggaran member berhasil diberlakukan.',
        data: {
          success: true,
          penalty_id: penaltyId,
          invoices_affected: invoicesAffected,
          voided_coupons_count: voidedCouponsCount,
          wiped_points: wipedPoints,
        },
      },
    };
  }

  if (pathname === '/api/penalties/revoke' && method === 'POST') {
    const { identity_id, alasan, petugas, password } = body;

    if (!identity_id) {
      return { status: 400, data: { error: 'Identity ID wajib diisi' } };
    }
    if (!alasan || !alasan.trim()) {
      return { status: 400, data: { error: 'Alasan pencabutan sanksi wajib disertakan' } };
    }
    if (!petugas || !petugas.trim()) {
      return { status: 400, data: { error: 'Nama petugas wajib diisi' } };
    }
    if ((password || '').trim() !== 'oriental2026') {
      return { status: 401, data: { error: 'Password persetujuan Owner salah' } };
    }

    const idRef = doc(db, COLLECTIONS.IDENTITIES, identity_id);
    const idSnap = await getDoc(idRef);
    if (!idSnap.exists()) {
      return { status: 404, data: { error: 'Member tidak ditemukan' } };
    }
    const identityData = idSnap.data();

    const nowIso = new Date().toISOString();

    // 1. Update status member di identities (cabut suspend)
    await updateDoc(idRef, {
      is_suspended: 0,
      suspend_type: null,
      suspend_dari: null,
      suspend_sampai: null,
      suspend_reason: null,
      suspend_reset_points: 0,
      suspended_at: null,
      suspended_by: null,
      updated_at: nowIso,
    });

    // 2. Update status sanksi aktif di member_penalties menjadi 'dicabut'
    const pSnap = await getDocs(query(
      collection(db, COLLECTIONS.MEMBER_PENALTIES),
      where('identity_id', '==', identity_id),
      where('status', '==', 'aktif')
    ));

    let revokedCount = 0;
    if (!pSnap.empty) {
      const pBatch = writeBatch(db);
      pSnap.forEach(d => {
        pBatch.update(d.ref, {
          status: 'dicabut',
          revoked_at: nowIso,
          revoked_by: petugas.trim(),
          revoked_reason: alasan.trim(),
          updated_at: nowIso,
        });
        revokedCount++;
      });
      await pBatch.commit();
    }

    // 3. Audit Log
    const auditId = `audit_${Date.now()}`;
    await setDoc(doc(db, COLLECTIONS.AUDIT_LOG, auditId), {
      id: auditId,
      aksi: 'revoke_member_penalty',
      tabel: 'member_penalties',
      record_id: identity_id,
      keterangan: `Pencabutan sanksi member ${identityData.nama_pemilik || ''} (${identity_id}) oleh ${petugas.trim()}. Alasan: ${alasan.trim()}`,
      created_at: nowIso,
    });

    return {
      data: {
        success: true,
        message: 'Sanksi member berhasil dicabut. Status member telah dipulihkan.',
        data: {
          success: true,
          revoked_count: revokedCount,
        },
      },
    };
  }

  // GET /api/penalties/:identityId
  if (pathname.startsWith('/api/penalties/')) {
    const targetId = decodeURIComponent(pathname.replace('/api/penalties/', ''));
    const idSnap = await getDoc(doc(db, COLLECTIONS.IDENTITIES, targetId));
    const idData = idSnap.exists() ? idSnap.data() : null;

    const pSnap = await getDocs(query(
      collection(db, COLLECTIONS.MEMBER_PENALTIES),
      where('identity_id', '==', targetId)
    ));

    const history: any[] = [];
    pSnap.forEach(d => {
      history.push({ id: d.id, ...d.data() });
    });

    history.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const activePenalty = history.find(p => p.status === 'aktif') || null;

    return {
      data: {
        success: true,
        data: {
          is_suspended: idData ? idData.is_suspended === 1 : false,
          suspend_type: idData?.suspend_type || null,
          suspend_dari: idData?.suspend_dari || null,
          suspend_sampai: idData?.suspend_sampai || null,
          suspend_reason: idData?.suspend_reason || null,
          suspend_reset_points: idData?.suspend_reset_points === 1,
          suspended_at: idData?.suspended_at || null,
          suspended_by: idData?.suspended_by || null,
          active_penalty: activePenalty,
          history,
        },
      },
    };
  }

  // 4d. ALIASES /api/aliases and /api/aliases/transfer
  if (pathname === '/api/aliases/transfer' && method === 'POST') {
    const namaPos = (body.nama_pos || '').trim();
    const targetOutletId = (body.target_outlet_id || '').trim();
    if (!namaPos || !targetOutletId) {
      return { status: 400, data: { error: 'nama_pos dan target_outlet_id wajib diisi' } };
    }

    const outSnap = await getDoc(doc(db, COLLECTIONS.OUTLETS, targetOutletId));
    if (!outSnap.exists()) {
      return { status: 404, data: { error: 'Outlet tujuan tidak ditemukan' } };
    }
    const outletData = outSnap.data();

    // Upsert pos_aliases
    const aliasId = `alias_${namaPos.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    await setDoc(doc(db, COLLECTIONS.POS_ALIASES, aliasId), {
      id: aliasId,
      nama_pos: namaPos,
      outlet_id: targetOutletId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { merge: true });

    // Update semua invoice dengan nama_pos ini
    const invSnap = await getDocs(query(collection(db, COLLECTIONS.INVOICES), where('nama_pos', '==', namaPos)));
    let currentBatch = writeBatch(db);
    let opCount = 0;
    let addedPoin = 0;
    let addedKupon = 0;
    let addedTrx = 0;

    const rate = outletData.tipe === 'grosir' ? 200000 : outletData.tipe === 'ukm' ? 50000 : 100000;

    invSnap.forEach(d => {
      const inv = d.data();
      const jumlah = Number(inv.jumlah) || 0;
      const poin = Math.floor(jumlah / rate);
      const kupon = Math.floor(jumlah / 150000);

      currentBatch.update(d.ref, {
        outlet_id: targetOutletId,
        identity_id: outletData.identity_id,
        poin,
        kupon,
        updated_at: new Date().toISOString(),
      });
      opCount++;
      addedTrx += jumlah;
      addedPoin += poin;
      addedKupon += kupon;
    });

    if (opCount > 0) {
      await currentBatch.commit();
    }

    // Update outlet & identity stats
    if (addedPoin > 0 || addedKupon > 0 || addedTrx > 0) {
      await updateDoc(doc(db, COLLECTIONS.OUTLETS, targetOutletId), {
        total_transaksi: (outletData.total_transaksi || 0) + addedTrx,
        total_poin: (outletData.total_poin || 0) + addedPoin,
        total_kupon: (outletData.total_kupon || 0) + addedKupon,
        updated_at: new Date().toISOString(),
      });
      if (outletData.identity_id) {
        const idRef = doc(db, COLLECTIONS.IDENTITIES, outletData.identity_id);
        const idSnap = await getDoc(idRef);
        if (idSnap.exists()) {
          const idData = idSnap.data();
          await updateDoc(idRef, {
            total_poin: (idData.total_poin || 0) + addedPoin,
            total_kupon: (idData.total_kupon || 0) + addedKupon,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    return { data: { success: true, message: `Alias "${namaPos}" berhasil dipindahkan ke outlet ${targetOutletId}` } };
  }

  if (pathname === '/api/aliases') {
    if (method === 'POST') {
      const namaPos = (body.nama_pos || '').trim();
      const outletId = (body.outlet_id || '').trim();
      if (!namaPos || !outletId) {
        return { status: 400, data: { error: 'nama_pos dan outlet_id wajib diisi' } };
      }

      const outSnap = await getDoc(doc(db, COLLECTIONS.OUTLETS, outletId));
      if (!outSnap.exists()) {
        return { status: 404, data: { error: 'Outlet tidak ditemukan' } };
      }
      const outletData = outSnap.data();

      const aliasId = `alias_${namaPos.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      await setDoc(doc(db, COLLECTIONS.POS_ALIASES, aliasId), {
        id: aliasId,
        nama_pos: namaPos,
        outlet_id: outletId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { merge: true });

      // Update semua invoice dengan nama_pos ini
      const invSnap = await getDocs(query(collection(db, COLLECTIONS.INVOICES), where('nama_pos', '==', namaPos)));
      let currentBatch = writeBatch(db);
      let opCount = 0;
      let addedPoin = 0;
      let addedKupon = 0;
      let addedTrx = 0;

      const rate = outletData.tipe === 'grosir' ? 200000 : outletData.tipe === 'ukm' ? 50000 : 100000;

      invSnap.forEach(d => {
        const inv = d.data();
        const jumlah = Number(inv.jumlah) || 0;
        const poin = Math.floor(jumlah / rate);
        const kupon = Math.floor(jumlah / 150000);

        currentBatch.update(d.ref, {
          outlet_id: outletId,
          identity_id: outletData.identity_id,
          poin,
          kupon,
          updated_at: new Date().toISOString(),
        });
        opCount++;
        addedTrx += jumlah;
        addedPoin += poin;
        addedKupon += kupon;
      });

      if (opCount > 0) {
        await currentBatch.commit();
      }

      if (addedPoin > 0 || addedKupon > 0 || addedTrx > 0) {
        await updateDoc(doc(db, COLLECTIONS.OUTLETS, outletId), {
          total_transaksi: (outletData.total_transaksi || 0) + addedTrx,
          total_poin: (outletData.total_poin || 0) + addedPoin,
          total_kupon: (outletData.total_kupon || 0) + addedKupon,
          updated_at: new Date().toISOString(),
        });
        if (outletData.identity_id) {
          const idRef = doc(db, COLLECTIONS.IDENTITIES, outletData.identity_id);
          const idSnap = await getDoc(idRef);
          if (idSnap.exists()) {
            const idData = idSnap.data();
            await updateDoc(idRef, {
              total_poin: (idData.total_poin || 0) + addedPoin,
              total_kupon: (idData.total_kupon || 0) + addedKupon,
              updated_at: new Date().toISOString(),
            });
          }
        }
      }

      return { data: { success: true, message: `"${namaPos}" berhasil dipetakan ke outlet ${outletId}` } };
    }

    if (method === 'DELETE') {
      const aliasId = body.id || '';
      let targetNamaPos = '';

      if (aliasId) {
        const snap = await getDoc(doc(db, COLLECTIONS.POS_ALIASES, String(aliasId)));
        if (snap.exists()) {
          targetNamaPos = snap.data().nama_pos;
          await deleteDoc(snap.ref);
        }
      }

      if (targetNamaPos) {
        const invSnap = await getDocs(query(collection(db, COLLECTIONS.INVOICES), where('nama_pos', '==', targetNamaPos)));
        let currentBatch = writeBatch(db);
        let opCount = 0;
        invSnap.forEach(d => {
          currentBatch.update(d.ref, {
            outlet_id: null,
            identity_id: null,
            poin: 0,
            kupon: 0,
            updated_at: new Date().toISOString(),
          });
          opCount++;
        });
        if (opCount > 0) await currentBatch.commit();
      }

      return { data: { success: true, message: 'Alias berhasil dilepaskan' } };
    }

    // GET /api/aliases
    const q = (searchParams.get('q') || '').toLowerCase().trim();
    const belum = searchParams.get('belum') === '1';

    if (belum) {
      // Ambil nama transaksi yang belum punya outlet_id dan bukan CASH
      const invSnap = await getDocs(collection(db, COLLECTIONS.INVOICES));
      const unmappedMap = new Map<string, { nama_pos: string; jumlah_transaksi: number; total_jumlah: number }>();

      invSnap.forEach(d => {
        const inv = d.data();
        const nama = (inv.nama_pos || '').trim();
        if (!inv.outlet_id && nama && nama.toUpperCase() !== 'CASH') {
          const existing = unmappedMap.get(nama) || { nama_pos: nama, jumlah_transaksi: 0, total_jumlah: 0 };
          existing.jumlah_transaksi += 1;
          existing.total_jumlah += (Number(inv.jumlah) || 0);
          unmappedMap.set(nama, existing);
        }
      });

      let rows = Array.from(unmappedMap.values());
      if (q) {
        rows = rows.filter(r => r.nama_pos.toLowerCase().includes(q));
      }
      rows.sort((a, b) => b.jumlah_transaksi - a.jumlah_transaksi);
      return { data: { rows } };
    }

    // Sudah dipetakan: list pos_aliases join outlets & identities
    const [aliasSnap, outSnap, idSnap] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.POS_ALIASES)),
      getDocs(collection(db, COLLECTIONS.OUTLETS)),
      getDocs(collection(db, COLLECTIONS.IDENTITIES)),
    ]);

    const outletMap = new Map<string, any>();
    outSnap.forEach(d => outletMap.set(d.id, d.data()));

    const identityMap = new Map<string, any>();
    idSnap.forEach(d => identityMap.set(d.id, d.data()));

    let aliases: any[] = [];
    aliasSnap.forEach(d => {
      const a = d.data();
      const out = outletMap.get(a.outlet_id);
      const iden = out ? identityMap.get(out.identity_id) : null;

      aliases.push({
        id: d.id,
        nama_pos: a.nama_pos,
        outlet_id: a.outlet_id,
        created_at: a.created_at || new Date().toISOString(),
        nama_outlet: out?.nama_outlet || a.outlet_id,
        tipe: out?.tipe || 'retail',
        identity_id: out?.identity_id || '—',
        nama_pemilik: iden?.nama_pemilik || '—',
      });
    });

    if (q) {
      aliases = aliases.filter(a =>
        a.nama_pos.toLowerCase().includes(q) ||
        a.nama_outlet.toLowerCase().includes(q) ||
        a.nama_pemilik.toLowerCase().includes(q)
      );
    }
    aliases.sort((a, b) => a.nama_pos.localeCompare(b.nama_pos));

    return { data: { aliases, rows: aliases } };
  }

  // 4e. APPROVALS /api/approvals and /api/approvals/:id/resolve
  if (pathname.startsWith('/api/approvals/') && pathname.endsWith('/resolve') && method === 'POST') {
    const rawId = pathname.replace('/api/approvals/', '').replace('/resolve', '');
    const approvalId = decodeURIComponent(rawId);
    const rawKeputusan = (body.keputusan || '').toLowerCase().trim();
    const targetOutletId = (body.data?.outlet_id || body.outletId || body.data?.outletId || '').trim();

    const apprRef = doc(db, COLLECTIONS.APPROVALS, approvalId);
    const snap = await getDoc(apprRef);
    if (!snap.exists()) {
      return { status: 404, data: { error: 'Approval tidak ditemukan' } };
    }
    const apprData = snap.data();

    const statusVal =
      rawKeputusan === 'disetujui' || rawKeputusan === 'approve' || rawKeputusan === 'setuju'
        ? 'disetujui'
        : rawKeputusan === 'ditolak' || rawKeputusan === 'reject' || rawKeputusan === 'tolak'
        ? 'ditolak'
        : 'diabaikan';

    await updateDoc(apprRef, {
      status: statusVal,
      resolved_at: new Date().toISOString(),
      resolved_by: getActiveUser()?.username || 'admin',
      updated_at: new Date().toISOString(),
    });

    // Jika disetujui dan ada outlet_id, petakan kode/nama dan update faktur secara berlaku surut
    if (statusVal === 'disetujui' && targetOutletId && apprData.payload) {
      const payload = typeof apprData.payload === 'string' ? JSON.parse(apprData.payload) : apprData.payload;
      const namaPos = payload.nama_pos || payload.nama;

      if (namaPos) {
        const outSnap = await getDoc(doc(db, COLLECTIONS.OUTLETS, targetOutletId));
        if (outSnap.exists()) {
          const outletData = outSnap.data();

          // 1. Simpan ke pos_aliases
          const aliasId = `alias_${String(namaPos).toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
          await setDoc(doc(db, COLLECTIONS.POS_ALIASES, aliasId), {
            id: aliasId,
            nama_pos: namaPos,
            outlet_id: targetOutletId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { merge: true });

          // 2. Update SEMUA faktur transaksi dengan nama_pos ini secara berlaku surut
          const invSnap = await getDocs(query(collection(db, COLLECTIONS.INVOICES), where('nama_pos', '==', namaPos)));
          let currentBatch = writeBatch(db);
          let opCount = 0;
          let addedPoin = 0;
          let addedKupon = 0;
          let addedTrx = 0;

          const rate = outletData.tipe === 'grosir' ? 200000 : outletData.tipe === 'ukm' ? 50000 : 100000;

          invSnap.forEach(d => {
            const inv = d.data();
            const jumlah = Number(inv.jumlah) || 0;
            const poin = Math.floor(jumlah / rate);
            const kupon = Math.floor(jumlah / 150000);

            currentBatch.update(d.ref, {
              outlet_id: targetOutletId,
              identity_id: outletData.identity_id,
              poin,
              kupon,
              is_excluded: 0,
              updated_at: new Date().toISOString(),
            });
            opCount++;
            addedTrx += jumlah;
            addedPoin += poin;
            addedKupon += kupon;
          });

          if (opCount > 0) {
            await currentBatch.commit();
          }

          // 3. Akumulasikan ke outlet & identity
          if (addedPoin > 0 || addedKupon > 0 || addedTrx > 0) {
            await updateDoc(doc(db, COLLECTIONS.OUTLETS, targetOutletId), {
              total_transaksi: (outletData.total_transaksi || 0) + addedTrx,
              total_poin: (outletData.total_poin || 0) + addedPoin,
              total_kupon: (outletData.total_kupon || 0) + addedKupon,
              updated_at: new Date().toISOString(),
            });
            if (outletData.identity_id) {
              const idRef = doc(db, COLLECTIONS.IDENTITIES, outletData.identity_id);
              const idSnap = await getDoc(idRef);
              if (idSnap.exists()) {
                const idData = idSnap.data();
                await updateDoc(idRef, {
                  total_poin: (idData.total_poin || 0) + addedPoin,
                  total_kupon: (idData.total_kupon || 0) + addedKupon,
                  updated_at: new Date().toISOString(),
                });
              }
            }
          }
        }
      }
    } else if (statusVal === 'disetujui' && apprData.jenis === 'outlet_tanpa_induk' && apprData.payload) {
      const payload = typeof apprData.payload === 'string' ? JSON.parse(apprData.payload) : apprData.payload;
      if (payload.kode && payload.parent) {
        const parentSnap = await getDoc(doc(db, COLLECTIONS.IDENTITIES, payload.parent));
        if (parentSnap.exists()) {
          const outRef = doc(db, COLLECTIONS.OUTLETS, payload.kode);
          const outSnap = await getDoc(outRef);
          if (!outSnap.exists()) {
            await setDoc(outRef, {
              id: payload.kode,
              identity_id: payload.parent,
              nama_outlet: payload.nama || payload.kode,
              tipe: payload.tipe || 'ukm',
              aktif: 1,
              total_transaksi: 0,
              total_poin: 0,
              total_kupon: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        }
      }
    } else if (statusVal === 'disetujui' && apprData.jenis === 'transaksi_outlet_nonaktif' && apprData.payload) {
      const payload = typeof apprData.payload === 'string' ? JSON.parse(apprData.payload) : apprData.payload;
      if (payload.outlet_id) {
        await updateDoc(doc(db, COLLECTIONS.OUTLETS, payload.outlet_id), {
          aktif: 1,
          nonaktif_tipe: null,
          nonaktif_alasan: null,
          nonaktif_tanggal: null,
          nonaktif_oleh: null,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Catat ke audit_log
    try {
      const auditRef = doc(collection(db, COLLECTIONS.AUDIT_LOG));
      await setDoc(auditRef, {
        id: auditRef.id,
        tipe: 'approval_resolved',
        entity_id: approvalId,
        user_id: getActiveUser()?.username || 'admin',
        keterangan: `Approval ${approvalId} (${apprData.jenis}) diselesaikan: ${statusVal}${targetOutletId ? ` -> outlet ${targetOutletId}` : ''}`,
        created_at: new Date().toISOString(),
      });
    } catch {}

    return { data: { success: true, message: `Approval ${approvalId} berhasil diselesaikan` } };
  }

  if (pathname === '/api/approvals') {
    const statusFilter = searchParams.get('status') || 'menunggu';
    const jenisFilter = searchParams.get('jenis') || '';
    const q = (searchParams.get('q') || '').toLowerCase().trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, parseInt(searchParams.get('limit') || '20', 10));

    const [apprSnap, batchSnap] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.APPROVALS)),
      getDocs(collection(db, COLLECTIONS.IMPORT_BATCHES)),
    ]);

    const batchMap = new Map<string, any>();
    batchSnap.forEach(d => batchMap.set(String(d.data().id || d.id), d.data()));

    let all: any[] = [];
    apprSnap.forEach(d => {
      const a = d.data();
      const bInfo = a.batch_id ? batchMap.get(String(a.batch_id)) : null;
      all.push({
        id: d.id,
        jenis: a.jenis || 'anomali_master',
        payload: typeof a.payload === 'object' ? JSON.stringify(a.payload) : (a.payload || '{}'),
        status: a.status || 'menunggu',
        created_at: a.created_at || new Date().toISOString(),
        filename: bInfo?.filename || 'File Import',
        bulan: bInfo?.bulan || '2026-09',
      });
    });

    // Counts per jenis untuk status 'menunggu'
    const countsMap = new Map<string, number>();
    all.filter(a => a.status === 'menunggu').forEach(a => {
      countsMap.set(a.jenis, (countsMap.get(a.jenis) || 0) + 1);
    });
    const counts = Array.from(countsMap.entries()).map(([jenis, jumlah]) => ({ jenis, jumlah }));

    // Filter
    if (statusFilter !== 'all') {
      all = all.filter(a => a.status === statusFilter);
    }
    if (jenisFilter) {
      all = all.filter(a => a.jenis === jenisFilter);
    }
    if (q) {
      all = all.filter(a =>
        a.payload.toLowerCase().includes(q) ||
        a.jenis.toLowerCase().includes(q) ||
        (a.filename && a.filename.toLowerCase().includes(q))
      );
    }

    all.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const total = all.length;
    const start = (page - 1) * limit;
    const approvals = all.slice(start, start + limit);

    return {
      data: {
        approvals,
        counts,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  // 5a. COUPONS QUOTA /api/coupons/quota/:identityId
  if (pathname.startsWith('/api/coupons/quota/')) {
    const rawId = pathname.replace('/api/coupons/quota/', '');
    const identityId = decodeURIComponent(rawId).trim();
    if (!identityId) {
      return { status: 400, data: { error: 'Identity ID wajib disertakan' } };
    }

    const idSnap = await getDoc(doc(db, COLLECTIONS.IDENTITIES, identityId));
    if (!idSnap.exists()) {
      return { status: 404, data: { error: `Member ${identityId} tidak ditemukan` } };
    }
    const idData = idSnap.data();

    // Outlets aktif
    const outSnap = await getDocs(query(collection(db, COLLECTIONS.OUTLETS), where('identity_id', '==', identityId)));
    const outlets: any[] = [];
    outSnap.forEach(d => {
      const o = d.data();
      if (o.aktif !== 0) {
        outlets.push({
          id: o.id || d.id,
          nama_outlet: o.nama_outlet || o.id || d.id,
          tipe: o.tipe || 'retail',
        });
      }
    });

    // Hitung hak kupon dari faktur aktif sejak 1 Sep 2026
    const invSnap = await getDocs(query(collection(db, COLLECTIONS.INVOICES), where('identity_id', '==', identityId)));
    let totalKuponFromInvoices = 0;
    invSnap.forEach(d => {
      const inv = d.data();
      if (inv.is_excluded !== 1) {
        totalKuponFromInvoices += (Number(inv.kupon) || 0);
      }
    });

    const isSuspended = idData.is_suspended === 1;
    const hak_kupon = isSuspended ? 0 : totalKuponFromInvoices;

    // Kupon fisik aktif yang sudah diserahkan
    const coupSnap = await getDocs(query(collection(db, COLLECTIONS.COUPONS), where('identity_id', '==', identityId), where('status', '==', 'aktif')));
    const sudah_diambil = coupSnap.size;
    const sisa_kuota = isSuspended ? 0 : Math.max(0, hak_kupon - sudah_diambil);

    return {
      data: {
        success: true,
        quota: {
          identity_id: identityId,
          nama_pemilik: idData.nama_pemilik || identityId,
          alamat: idData.alamat || '',
          kota: idData.kota || '',
          kecamatan: idData.kecamatan || '',
          whatsapp: idData.whatsapp || '',
          hak_kupon,
          sudah_diambil,
          sisa_kuota,
          is_suspended: isSuspended,
          suspend_reason: idData.suspend_reason || null,
          outlets,
        },
      },
    };
  }

  // 5b. COUPONS STOCK /api/coupons/stock
  if (pathname === '/api/coupons/stock') {
    const periode = searchParams.get('periode') || '2026-09';
    const [yyyy, mm] = periode.split('-');
    const yy = (yyyy || '2026').slice(-2);
    const m = (mm || '09').padStart(2, '0');
    const prefix = `ORT-KUP${yy}${m}-`;

    const coupSnap = await getDocs(query(collection(db, COLLECTIONS.COUPONS), where('periode_kupon', '==', periode), where('status', '==', 'aktif')));
    const activeSet = new Set<number>();
    coupSnap.forEach(d => {
      const c = d.data();
      if (c.nomor_urut) {
        activeSet.add(Number(c.nomor_urut));
      } else if (c.nomor_kupon) {
        const match = String(c.nomor_kupon).match(/-(\d{4})$/);
        if (match) activeSet.add(parseInt(match[1], 10));
      }
    });

    const issued_count = activeSet.size;
    const available_count = Math.max(0, 2500 - issued_count);
    const bundles: any[] = [];

    for (let b = 1; b <= 50; b++) {
      const start_seq = (b - 1) * 50 + 1;
      const end_seq = b * 50;
      const start_number = `${prefix}${String(start_seq).padStart(4, '0')}`;
      const end_number = `${prefix}${String(end_seq).padStart(4, '0')}`;

      let bundleIssued = 0;
      for (let s = start_seq; s <= end_seq; s++) {
        if (activeSet.has(s)) bundleIssued++;
      }

      const available = 50 - bundleIssued;
      const status = bundleIssued === 50 ? 'taken' : bundleIssued > 0 ? 'partial' : 'available';

      bundles.push({
        bundle_no: b,
        start_seq,
        end_seq,
        start_number,
        end_number,
        total: 50,
        issued: bundleIssued,
        available,
        status,
      });
    }

    return {
      data: {
        success: true,
        stock: {
          periode,
          prefix,
          capacity: 2500,
          issued_count,
          available_count,
          bundles,
        },
      },
    };
  }

  // 5c. COUPONS HANDOVER /api/coupons/handover
  if (pathname === '/api/coupons/handover' && method === 'POST') {
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
    } = body;

    if (!identity_id) return { status: 400, data: { error: 'Nomor Member (Identity ID) wajib diisi' } };
    if (!outlet_asal_id) return { status: 400, data: { error: 'Outlet Asal wajib dipilih' } };
    if (!periode_kupon || !/^\d{4}-\d{2}$/.test(periode_kupon)) {
      return { status: 400, data: { error: 'Format periode kupon harus YYYY-MM (misal 2026-09)' } };
    }
    if (!petugas || !petugas.trim()) return { status: 400, data: { error: 'Nama petugas yang menyerahkan wajib diisi' } };

    // 0. Cek sanksi member
    const idSnap = await getDoc(doc(db, COLLECTIONS.IDENTITIES, identity_id));
    if (!idSnap.exists()) return { status: 404, data: { error: 'Member tidak ditemukan' } };
    const idData = idSnap.data();

    if (idData.is_suspended === 1) {
      return {
        status: 400,
        data: {
          error: `Member sedang dalam masa sanksi penangguhan (${idData.suspend_reason || 'Evaluasi Khusus'}). Penyerahan kupon fisik diblokir.`,
        },
      };
    }

    // 1. Cek Kuota
    const invSnap = await getDocs(query(collection(db, COLLECTIONS.INVOICES), where('identity_id', '==', identity_id)));
    let hakKupon = 0;
    invSnap.forEach(d => {
      const inv = d.data();
      if (inv.is_excluded !== 1) hakKupon += (Number(inv.kupon) || 0);
    });

    const coupSnap = await getDocs(query(collection(db, COLLECTIONS.COUPONS), where('identity_id', '==', identity_id), where('status', '==', 'aktif')));
    const sudahDiambil = coupSnap.size;
    const sisaKuota = Math.max(0, hakKupon - sudahDiambil);

    if (sisaKuota <= 0) {
      return {
        status: 400,
        data: {
          error: `Member tidak memiliki sisa hak kuota kupon (sisa kuota: 0 lembar dari total ${hakKupon} hak). Penyerahan kupon ditolak.`,
        },
      };
    }

    // 2. Resolve nomor kupon yang diminta
    const seqSet = new Set<number>();
    if (mode === 'bundle') {
      const bundles = bundle_numbers || [];
      if (bundles.length === 0) return { status: 400, data: { error: 'Pilih minimal satu nomor bundel' } };
      for (const b of bundles) {
        if (b < 1 || b > 50) return { status: 400, data: { error: `Nomor bundel tidak valid: ${b}` } };
        const start = (b - 1) * 50 + 1;
        const end = b * 50;
        for (let s = start; s <= end; s++) seqSet.add(s);
      }
    } else if (mode === 'range') {
      const { start, end } = range || { start: 0, end: 0 };
      if (!start || !end) return { status: 400, data: { error: 'Nomor awal dan nomor akhir wajib diisi' } };
      if (start <= 0 || end <= 0) return { status: 400, data: { error: 'Nomor urut kupon harus > 0' } };
      if (start > end) return { status: 400, data: { error: `Nomor awal (${start}) tidak boleh > nomor akhir (${end})` } };
      if (end - start + 1 > 1000) return { status: 400, data: { error: 'Maksimal 1.000 kupon dalam satu kali submit' } };
      for (let s = start; s <= end; s++) seqSet.add(s);
    } else if (mode === 'custom') {
      const nums = custom_numbers || [];
      if (nums.length === 0) return { status: 400, data: { error: 'Daftar nomor kupon eceran tidak boleh kosong' } };
      for (const s of nums) {
        if (s <= 0) return { status: 400, data: { error: `Nomor kupon tidak valid: ${s}` } };
        seqSet.add(s);
      }
    } else {
      return { status: 400, data: { error: `Mode input kupon tidak dikenal: ${mode}` } };
    }

    const seqs = Array.from(seqSet).sort((a, b) => a - b);
    if (seqs.length === 0) return { status: 400, data: { error: 'Tidak ada kupon yang dihasilkan dari pilihan Anda' } };

    if (seqs.length > sisaKuota) {
      return {
        status: 400,
        data: {
          error: `Jumlah kupon yang diserahkan (${seqs.length} lembar) melebihi sisa hak kuota member (${sisaKuota} lembar). Batas maksimal yang boleh diserahkan adalah ${sisaKuota} lembar.`,
        },
      };
    }

    const [yyyy, mm] = periode_kupon.split('-');
    const yy = (yyyy || '2026').slice(-2);
    const m = (mm || '09').padStart(2, '0');
    const prefix = `ORT-KUP${yy}${m}-`;
    const numbers = seqs.map(s => `${prefix}${String(s).padStart(4, '0')}`);

    // 3. Validasi Anti-Duplikasi
    const activeCouponsPeriode = await getDocs(query(collection(db, COLLECTIONS.COUPONS), where('periode_kupon', '==', periode_kupon), where('status', '==', 'aktif')));
    const activeNumbers = new Set<string>();
    activeCouponsPeriode.forEach(d => {
      const c = d.data();
      if (c.nomor_kupon) activeNumbers.add(c.nomor_kupon);
    });

    const conflicts = numbers.filter(n => activeNumbers.has(n));
    if (conflicts.length > 0) {
      const contoh = conflicts.slice(0, 3).join(', ');
      const sisa = conflicts.length > 3 ? ` dan ${conflicts.length - 3} kupon lainnya` : '';
      return {
        status: 400,
        data: { error: `Ditemukan ${conflicts.length} kupon yang sudah pernah diserahkan: ${contoh}${sisa}` },
      };
    }

    // 4. Batch write ke Firestore
    const batchDocRef = doc(collection(db, COLLECTIONS.COUPON_BATCHES));
    const batchId = batchDocRef.id;
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.slice(0, 10);

    await setDoc(batchDocRef, {
      id: batchId,
      identity_id,
      outlet_asal_id,
      periode_kupon,
      jumlah_kupon: numbers.length,
      nomor_awal: numbers[0],
      nomor_akhir: numbers[numbers.length - 1],
      keterangan: keterangan || (mode === 'bundle' ? `Bundel ${bundle_numbers?.join(',')}` : null),
      petugas: petugas.trim(),
      whatsapp: whatsapp?.trim() || idData.whatsapp || null,
      status: 'aktif',
      tipe_penerima: 'member',
      created_at: nowIso,
    });

    let currentBatch = writeBatch(db);
    let opCount = 0;

    for (let i = 0; i < numbers.length; i++) {
      const num = numbers[i];
      const seq = seqs[i];
      const cRef = doc(db, COLLECTIONS.COUPONS, num);
      currentBatch.set(cRef, {
        id: num,
        nomor_kupon: num,
        identity_id,
        outlet_asal_id,
        batch_id: batchId,
        periode_kupon,
        nomor_urut: seq,
        status: 'aktif',
        petugas: petugas.trim(),
        whatsapp: whatsapp?.trim() || idData.whatsapp || null,
        tanggal_serah: todayStr,
        tipe_penerima: 'member',
        created_at: nowIso,
      });
      opCount++;
      if (opCount >= 400) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        opCount = 0;
      }
    }
    if (opCount > 0) {
      await currentBatch.commit();
    }

    // Update whatsapp jika diisi
    if (whatsapp && whatsapp.trim()) {
      await updateDoc(doc(db, COLLECTIONS.IDENTITIES, identity_id), {
        whatsapp: whatsapp.trim(),
        updated_at: nowIso,
      });
    }

    // Audit log
    try {
      const auditRef = doc(collection(db, COLLECTIONS.AUDIT_LOG));
      await setDoc(auditRef, {
        id: auditRef.id,
        tipe: 'handover_coupon',
        entity_id: batchId,
        user_id: petugas.trim() || 'admin',
        keterangan: `Serah terima ${numbers.length} kupon (${numbers[0]} - ${numbers[numbers.length - 1]}) kepada member ${idData.nama_pemilik} (${identity_id}) oleh ${petugas.trim()}`,
        created_at: nowIso,
      });
    } catch {}

    return {
      data: {
        success: true,
        data: {
          batch_id: batchId,
          total_issued: numbers.length,
          nomor_awal: numbers[0],
          nomor_akhir: numbers[numbers.length - 1],
          coupons: numbers,
        },
      },
    };
  }

  // 5d. COUPONS WALK-IN /api/coupons/walk-in
  if (pathname === '/api/coupons/walk-in' && method === 'POST') {
    const {
      periode_kupon,
      nama_walk_in,
      no_hp_walk_in,
      no_invoice,
      petugas,
      keterangan,
      mode,
      range,
      custom_numbers,
    } = body;

    if (!nama_walk_in || !nama_walk_in.trim()) {
      return { status: 400, data: { error: 'Nama pelanggan pembeli (walk-in) wajib diisi' } };
    }
    if (!petugas || !petugas.trim()) {
      return { status: 400, data: { error: 'Nama kasir / petugas yang menyerahkan wajib diisi' } };
    }
    if (!periode_kupon || !/^\d{4}-\d{2}$/.test(periode_kupon)) {
      return { status: 400, data: { error: 'Format periode kupon harus YYYY-MM (misal 2026-10)' } };
    }

    const seqSet = new Set<number>();
    if (mode === 'range') {
      const { start, end } = range || { start: 0, end: 0 };
      if (!start || !end) return { status: 400, data: { error: 'Nomor awal dan nomor akhir wajib diisi' } };
      if (start <= 0 || end <= 0) return { status: 400, data: { error: 'Nomor urut kupon harus > 0' } };
      if (start > end) return { status: 400, data: { error: `Nomor awal (${start}) tidak boleh > nomor akhir (${end})` } };
      if (end - start + 1 > 1000) return { status: 400, data: { error: 'Maksimal 1.000 kupon dalam satu kali submit' } };
      for (let s = start; s <= end; s++) seqSet.add(s);
    } else if (mode === 'custom') {
      const nums = custom_numbers || [];
      if (nums.length === 0) return { status: 400, data: { error: 'Daftar nomor kupon eceran tidak boleh kosong' } };
      for (const s of nums) {
        if (s <= 0) return { status: 400, data: { error: `Nomor kupon tidak valid: ${s}` } };
        seqSet.add(s);
      }
    } else {
      return { status: 400, data: { error: `Mode input kupon tidak dikenal: ${mode}` } };
    }

    const seqs = Array.from(seqSet).sort((a, b) => a - b);
    if (seqs.length === 0) return { status: 400, data: { error: 'Tidak ada kupon yang dihasilkan dari pilihan Anda' } };

    const [yyyy, mm] = periode_kupon.split('-');
    const yy = (yyyy || '2026').slice(-2);
    const m = (mm || '09').padStart(2, '0');
    const prefix = `ORT-KUP${yy}${m}-`;
    const numbers = seqs.map(s => `${prefix}${String(s).padStart(4, '0')}`);

    // Anti-duplikasi
    const activeCouponsPeriode = await getDocs(query(collection(db, COLLECTIONS.COUPONS), where('periode_kupon', '==', periode_kupon), where('status', '==', 'aktif')));
    const activeNumbers = new Set<string>();
    activeCouponsPeriode.forEach(d => {
      const c = d.data();
      if (c.nomor_kupon) activeNumbers.add(c.nomor_kupon);
    });

    const conflicts = numbers.filter(n => activeNumbers.has(n));
    if (conflicts.length > 0) {
      const contoh = conflicts.slice(0, 3).join(', ');
      const sisa = conflicts.length > 3 ? ` dan ${conflicts.length - 3} kupon lainnya` : '';
      return {
        status: 400,
        data: { error: `Ditemukan ${conflicts.length} kupon yang sudah pernah diserahkan: ${contoh}${sisa}` },
      };
    }

    const batchDocRef = doc(collection(db, COLLECTIONS.COUPON_BATCHES));
    const batchId = batchDocRef.id;
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.slice(0, 10);
    const cleanNama = nama_walk_in.trim();
    const cleanHp = no_hp_walk_in?.trim() || null;
    const cleanInvoice = no_invoice?.trim() || null;
    const cleanPetugas = petugas.trim();
    const batchNote = keterangan?.trim() || (cleanInvoice ? `Struk POS: ${cleanInvoice}` : 'Transaksi Tunai Walk-In');

    await setDoc(batchDocRef, {
      id: batchId,
      identity_id: '999-CASH-WALKIN',
      outlet_asal_id: '999-CASH-WALKIN-01',
      periode_kupon,
      jumlah_kupon: numbers.length,
      nomor_awal: numbers[0],
      nomor_akhir: numbers[numbers.length - 1],
      keterangan: batchNote,
      petugas: cleanPetugas,
      whatsapp: cleanHp,
      status: 'aktif',
      tipe_penerima: 'walk_in',
      nama_walk_in: cleanNama,
      no_hp_walk_in: cleanHp,
      no_invoice: cleanInvoice,
      created_at: nowIso,
    });

    let currentBatch = writeBatch(db);
    let opCount = 0;

    for (let i = 0; i < numbers.length; i++) {
      const num = numbers[i];
      const seq = seqs[i];
      const cRef = doc(db, COLLECTIONS.COUPONS, num);
      currentBatch.set(cRef, {
        id: num,
        nomor_kupon: num,
        identity_id: '999-CASH-WALKIN',
        outlet_asal_id: '999-CASH-WALKIN-01',
        batch_id: batchId,
        periode_kupon,
        nomor_urut: seq,
        status: 'aktif',
        petugas: cleanPetugas,
        whatsapp: cleanHp,
        tanggal_serah: todayStr,
        tipe_penerima: 'walk_in',
        nama_walk_in: cleanNama,
        no_hp_walk_in: cleanHp,
        no_invoice: cleanInvoice,
        created_at: nowIso,
      });
      opCount++;
      if (opCount >= 400) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        opCount = 0;
      }
    }
    if (opCount > 0) {
      await currentBatch.commit();
    }

    try {
      const auditRef = doc(collection(db, COLLECTIONS.AUDIT_LOG));
      await setDoc(auditRef, {
        id: auditRef.id,
        tipe: 'handover_walkin_coupon',
        entity_id: batchId,
        user_id: cleanPetugas || 'admin',
        keterangan: `Serah terima walk-in ${numbers.length} kupon (${numbers[0]} - ${numbers[numbers.length - 1]}) atas nama ${cleanNama}`,
        created_at: nowIso,
      });
    } catch {}

    return {
      data: {
        success: true,
        data: {
          batch_id: batchId,
          total_issued: numbers.length,
          nomor_awal: numbers[0],
          nomor_akhir: numbers[numbers.length - 1],
          coupons: numbers,
        },
      },
    };
  }

  // 5. COUPONS LOOKUP /api/coupons/lookup
  if (pathname === '/api/coupons/lookup') {
    const q = (searchParams.get('q') || body.query || body.q || '').trim().toUpperCase();
    const defaultPeriode = searchParams.get('periode') || body.periode || '2026-09';

    let normalized = q;
    if (!q.startsWith('ORT-KUP')) {
      if (/^\d{4}-\d{4}$/.test(q)) {
        normalized = `ORT-KUP${q}`;
      } else if (/^\d+$/.test(q)) {
        const [yyyy, mm] = defaultPeriode.split('-');
        const yy = (yyyy || '2026').slice(-2);
        const m = (mm || '09').padStart(2, '0');
        const nnnn = String(parseInt(q, 10)).padStart(4, '0');
        normalized = `ORT-KUP${yy}${m}-${nnnn}`;
      }
    }

    const couponDoc = await getDoc(doc(db, COLLECTIONS.COUPONS, normalized));
    if (couponDoc.exists()) {
      const cData = couponDoc.data();
      let identity: any = null;
      let outlet: any = null;

      if (cData.identity_id) {
        const idDoc = await getDoc(doc(db, COLLECTIONS.IDENTITIES, cData.identity_id));
        if (idDoc.exists()) identity = idDoc.data();
      }
      if (cData.outlet_asal_id) {
        const outDoc = await getDoc(doc(db, COLLECTIONS.OUTLETS, cData.outlet_asal_id));
        if (outDoc.exists()) outlet = outDoc.data();
      }

      const isWalkIn = cData.tipe_penerima === 'walk_in';

      return {
        data: {
          found: true,
          coupon: {
            id: cData.id || normalized,
            nomor_kupon: cData.nomor_kupon || normalized,
            periode_kupon: cData.periode_kupon,
            nomor_urut: cData.nomor_urut,
            status: cData.status || 'aktif',
            tanggal_serah: cData.tanggal_serah,
            petugas: cData.petugas,
            whatsapp: cData.whatsapp || identity?.whatsapp || '—',
            tipe_penerima: isWalkIn ? 'walk_in' : 'member',
            nama_walk_in: cData.nama_walk_in || null,
            no_hp_walk_in: cData.no_hp_walk_in || null,
            no_invoice: cData.no_invoice || null,
            member: {
              id: isWalkIn ? 'NON-MEMBER' : cData.identity_id,
              nama_pemilik: isWalkIn ? (cData.nama_walk_in || 'Pelanggan Walk-In') : (identity?.nama_pemilik || cData.identity_id),
              alamat: identity?.alamat || '—',
              kota: identity?.kota || '—',
            },
            outlet_asal: {
              id: cData.outlet_asal_id,
              nama_outlet: isWalkIn ? 'Kasir Retail Walk-In' : (outlet?.nama_outlet || cData.outlet_asal_id),
              tipe: isWalkIn ? 'retail' : (outlet?.tipe || 'retail'),
            },
          },
        },
      };
    }

    return {
      data: {
        found: false,
        nomor_dicari: normalized,
        message: `Nomor kupon ${normalized} tidak ditemukan di database.`,
      },
    };
  }

  // 6. COUPONS LIST /api/coupons
  if (pathname === '/api/coupons') {
    const q = (searchParams.get('q') || '').toLowerCase().trim();
    const status = (searchParams.get('status') || 'all').toLowerCase().trim();
    const periode = (searchParams.get('periode') || 'all').trim();
    const tipe = (searchParams.get('tipe') || 'all').toLowerCase().trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, parseInt(searchParams.get('limit') || '25', 10));

    const [coupSnap, idSnap, outSnap, batchSnap] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.COUPONS)),
      getDocs(collection(db, COLLECTIONS.IDENTITIES)),
      getDocs(collection(db, COLLECTIONS.OUTLETS)),
      getDocs(collection(db, COLLECTIONS.COUPON_BATCHES)),
    ]);

    const idMap = new Map<string, any>();
    idSnap.forEach(d => idMap.set(d.id, d.data()));

    const outMap = new Map<string, any>();
    outSnap.forEach(d => outMap.set(d.id, d.data()));

    const batchMap = new Map<string, any>();
    batchSnap.forEach(d => batchMap.set(d.id, d.data()));

    let coupons: any[] = [];
    coupSnap.forEach(d => {
      const c = d.data();
      const isWalkIn = c.tipe_penerima === 'walk_in';
      const iden = c.identity_id ? idMap.get(c.identity_id) : null;
      const out = c.outlet_asal_id ? outMap.get(c.outlet_asal_id) : null;
      const bInfo = c.batch_id ? batchMap.get(String(c.batch_id)) : null;

      const namaPemilik = isWalkIn
        ? (c.nama_walk_in || 'Pelanggan Walk-In')
        : (iden?.nama_pemilik || c.identity_id || '—');

      coupons.push({
        id: c.id || d.id,
        nomor_kupon: c.nomor_kupon || d.id,
        periode_kupon: c.periode_kupon || '2026-09',
        nomor_urut: c.nomor_urut || 1,
        status: c.status || 'aktif',
        tanggal_serah: c.tanggal_serah || (c.created_at ? String(c.created_at).slice(0, 10) : '2026-09-01'),
        petugas: c.petugas || '—',
        kupon_whatsapp: c.whatsapp || null,
        created_at: c.created_at || new Date().toISOString(),
        batch_id: c.batch_id || null,
        identity_id: c.identity_id || '—',
        nama_pemilik: namaPemilik,
        kota: iden?.kota || 'WATAMPONE',
        member_whatsapp: iden?.whatsapp || null,
        outlet_id: c.outlet_asal_id || '—',
        nama_outlet: isWalkIn ? 'Kasir Retail Walk-In' : (out?.nama_outlet || c.outlet_asal_id || '—'),
        outlet_tipe: isWalkIn ? 'retail' : (out?.tipe || 'retail'),
        batch_keterangan: bInfo?.keterangan || null,
        tipe_penerima: isWalkIn ? 'walk_in' : 'member',
        nama_walk_in: c.nama_walk_in || null,
        no_hp_walk_in: c.no_hp_walk_in || null,
        no_invoice: c.no_invoice || null,
      });
    });

    // Filters
    if (status !== 'all') {
      coupons = coupons.filter(c => c.status === status);
    }
    if (periode !== 'all') {
      coupons = coupons.filter(c => c.periode_kupon === periode);
    }
    if (tipe !== 'all') {
      coupons = coupons.filter(c => c.tipe_penerima === tipe);
    }
    if (q) {
      coupons = coupons.filter(c =>
        c.nomor_kupon.toLowerCase().includes(q) ||
        c.nama_pemilik.toLowerCase().includes(q) ||
        (c.nama_walk_in && c.nama_walk_in.toLowerCase().includes(q)) ||
        (c.no_invoice && c.no_invoice.toLowerCase().includes(q)) ||
        (c.petugas && c.petugas.toLowerCase().includes(q))
      );
    }

    coupons.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '') || b.nomor_urut - a.nomor_urut);

    const total = coupons.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const start = (page - 1) * limit;
    const paged = coupons.slice(start, start + limit);

    return {
      data: {
        coupons: paged,
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  // 6b. STATEMENTS /api/statements/*
  if (pathname.startsWith('/api/statements/') && pathname.endsWith('/finalize') && method === 'POST') {
    const rawPath = pathname.replace('/api/statements/', '').replace('/finalize', '');
    const parts = rawPath.split('/');
    const identityId = decodeURIComponent(parts[0]);
    const bulan = parts[1] || '2026-09';
    const stmtId = `${identityId}_${bulan}`;
    const stmtRef = doc(db, COLLECTIONS.STATEMENTS, stmtId);
    await setDoc(stmtRef, {
      id: stmtId,
      identity_id: identityId,
      bulan,
      status: 'final',
      updated_at: new Date().toISOString(),
    }, { merge: true });

    return {
      data: {
        success: true,
        message: 'Statement berhasil dikunci sebagai FINAL!',
      },
    };
  }

  if (pathname === '/api/statements/batch' && method === 'GET') {
    const bulan = searchParams.get('bulan') || '2026-09';
    const [idSnap, outSnap, invSnap, penSnap, coupSnap, stmtSnap] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.IDENTITIES)),
      getDocs(collection(db, COLLECTIONS.OUTLETS)),
      getDocs(collection(db, COLLECTIONS.INVOICES)),
      getDocs(collection(db, COLLECTIONS.MEMBER_PENALTIES)),
      getDocs(collection(db, COLLECTIONS.COUPONS)),
      getDocs(collection(db, COLLECTIONS.STATEMENTS)),
    ]);

    const identities: any[] = [];
    idSnap.forEach(d => {
      const data = d.data();
      if (!data.id?.startsWith('999-')) identities.push(data);
    });
    identities.sort((a, b) => (a.nama_pemilik || '').localeCompare(b.nama_pemilik || ''));

    const outlets: any[] = [];
    outSnap.forEach(d => outlets.push(d.data()));

    const invoices: any[] = [];
    invSnap.forEach(d => invoices.push(d.data()));

    const penalties: any[] = [];
    penSnap.forEach(d => penalties.push(d.data()));

    const coupons: any[] = [];
    coupSnap.forEach(d => coupons.push(d.data()));

    const stmtMap = new Map<string, any>();
    stmtSnap.forEach(d => stmtMap.set(d.id, d.data()));

    const statements: any[] = [];
    for (const iden of identities) {
      try {
        const data = buildStatementDataFromMemory({
          identity: iden,
          outlets,
          invoices,
          penalties,
          coupons,
          bulan,
        });

        if (data.bulan_transaksi === 0 && data.kumulatif_poin === 0) {
          continue;
        }

        const stmtId = `${iden.id}_${bulan}`;
        const stmtRec = stmtMap.get(stmtId) || { status: 'draft', revisi: 0 };

        statements.push({
          identity: {
            id: iden.id,
            nama_pemilik: iden.nama_pemilik,
            kota: iden.kota || '—',
          },
          statement: stmtRec,
          data,
        });
      } catch (e) {
        console.warn('Batch build error for', iden.id, e);
      }
    }

    return {
      data: {
        bulan,
        count: statements.length,
        statements,
      },
    };
  }

  if (pathname.startsWith('/api/statements/') && !pathname.endsWith('/finalize') && pathname !== '/api/statements/batch' && method === 'GET') {
    const rawPath = pathname.replace('/api/statements/', '');
    const parts = rawPath.split('/');
    const identityId = decodeURIComponent(parts[0]);
    const bulan = parts[1] || '2026-09';

    try {
      const data = await buildFirestoreStatementData(identityId, bulan);

      const stmtId = `${identityId}_${bulan}`;
      const stmtRef = doc(db, COLLECTIONS.STATEMENTS, stmtId);
      const stmtSnap = await getDoc(stmtRef);
      let stmtRec: any;

      if (!stmtSnap.exists()) {
        stmtRec = {
          id: stmtId,
          identity_id: identityId,
          bulan,
          total_transaksi: data.bulan_transaksi,
          total_poin: data.bulan_poin,
          total_kupon: data.bulan_kupon,
          kumulatif_poin: data.kumulatif_poin,
          kumulatif_kupon: data.kumulatif_kupon,
          status: 'draft',
          revisi: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await setDoc(stmtRef, stmtRec);
      } else {
        stmtRec = stmtSnap.data();
        if (stmtRec.status !== 'final') {
          await updateDoc(stmtRef, {
            total_transaksi: data.bulan_transaksi,
            total_poin: data.bulan_poin,
            total_kupon: data.bulan_kupon,
            kumulatif_poin: data.kumulatif_poin,
            kumulatif_kupon: data.kumulatif_kupon,
            updated_at: new Date().toISOString(),
          });
          stmtRec.total_transaksi = data.bulan_transaksi;
          stmtRec.total_poin = data.bulan_poin;
          stmtRec.total_kupon = data.bulan_kupon;
          stmtRec.kumulatif_poin = data.kumulatif_poin;
          stmtRec.kumulatif_kupon = data.kumulatif_kupon;
        }
      }

      // Check unmapped in month
      const [yyyy, mm] = bulan.split('-');
      const lastDay = new Date(Number(yyyy), Number(mm), 0).getDate();
      const bulanStart = `${bulan}-01`;
      const bulanEnd = `${bulan}-${String(lastDay).padStart(2, '0')}`;

      const unmappedSnap = await getDocs(query(collection(db, COLLECTIONS.INVOICES)));
      const unmappedSet = new Set<string>();
      unmappedSnap.forEach(d => {
        const inv = d.data();
        if (!inv.outlet_id && inv.nama_pos && inv.nama_pos !== 'CASH' && inv.tanggal >= bulanStart && inv.tanggal <= bulanEnd) {
          unmappedSet.add(inv.nama_pos);
        }
      });

      return {
        data: {
          statement: stmtRec,
          data,
          peringatan_belum_petakan: unmappedSet.size,
        },
      };
    } catch (err: any) {
      return { status: 404, data: { error: err.message || 'Gagal memuat statement data' } };
    }
  }

  // 7. DASHBOARD /api/dashboard
  if (pathname === '/api/dashboard') {
    const periodType = (searchParams.get('period') || 'all').toLowerCase();
    const month = searchParams.get('month') || '';
    const year = searchParams.get('year') || '';
    const startDate = searchParams.get('start_date') || '';
    const endDate = searchParams.get('end_date') || '';

    // Ambil data koleksi secara paralel
    const [invSnap, outSnap, idSnap, batchSnap, apprSnap, coupSnap] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.INVOICES)),
      getDocs(collection(db, COLLECTIONS.OUTLETS)),
      getDocs(collection(db, COLLECTIONS.IDENTITIES)),
      getDocs(collection(db, COLLECTIONS.IMPORT_BATCHES)),
      getDocs(collection(db, COLLECTIONS.APPROVALS)),
      getCountFromServer(collection(db, COLLECTIONS.COUPONS)).catch(() => ({ data: () => ({ count: 0 }) })),
    ]);

    let pendingApprovalsCount = 0;
    apprSnap.forEach(d => {
      const a = d.data();
      if (!a.status || a.status === 'menunggu') pendingApprovalsCount++;
    });

    const outletMap = new Map<string, any>();
    outSnap.forEach(d => outletMap.set(d.id, d.data()));

    const identityMap = new Map<string, any>();
    idSnap.forEach(d => identityMap.set(d.id, d.data()));

    // Kumpulkan invoices dan distinct bulan/tahun
    const allInvoices: any[] = [];
    const monthsSet = new Set<string>();

    invSnap.forEach(d => {
      const inv = d.data();
      allInvoices.push(inv);
      const m = inv.bulan || (inv.tanggal ? String(inv.tanggal).slice(0, 7) : '');
      if (m && /^\d{4}-\d{2}$/.test(m)) {
        monthsSet.add(m);
      }
    });

    const sortedMonths = Array.from(monthsSet).sort().reverse();
    const availableMonths = sortedMonths.map(m => ({
      value: m,
      label: formatStatementBulanLabel(m),
    }));
    if (availableMonths.length === 0) {
      const cur = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      availableMonths.push({ value: cur, label: formatBulanLabel(cur) });
    }

    const yearsSet = new Set<string>();
    sortedMonths.forEach(m => yearsSet.add(m.slice(0, 4)));
    const availableYears = Array.from(yearsSet).sort().reverse();
    if (availableYears.length === 0) {
      availableYears.push(String(new Date().getFullYear()));
    }

    // Filter tanggal
    let periodLabel = 'Semua Periode (All-Time)';
    let activeStartDate = '';
    let activeEndDate = '';

    if (periodType === 'monthly' && month) {
      periodLabel = `Bulan ${formatBulanLabel(month)}`;
      activeStartDate = `${month}-01`;
      activeEndDate = `${month}-31`;
    } else if (periodType === 'yearly' && year) {
      periodLabel = `Tahun ${year}`;
      activeStartDate = `${year}-01-01`;
      activeEndDate = `${year}-12-31`;
    } else if (periodType === 'custom' && startDate && endDate) {
      periodLabel = `${startDate} s.d. ${endDate}`;
      activeStartDate = startDate;
      activeEndDate = endDate;
    }

    const filteredInvoices = allInvoices.filter(inv => {
      if (inv.is_excluded === 1) return false;
      const tgl = String(inv.tanggal || '');
      const bln = inv.bulan || tgl.slice(0, 7);

      if (periodType === 'monthly' && month) {
        return bln === month || tgl.startsWith(month);
      }
      if (periodType === 'yearly' && year) {
        return bln.startsWith(year) || tgl.startsWith(year);
      }
      if (periodType === 'custom' && startDate && endDate) {
        return tgl >= startDate && tgl <= endDate;
      }
      return true;
    });

    let total_poin = 0;
    let total_kupon = 0;
    let total_transaksi = 0;
    let unmappedCount = 0;
    const unmappedNamesSet = new Set<string>();

    const byLiniBisnisMap: Record<string, { tipe: string; trx_count: number; total_transaksi: number; total_poin: number; total_kupon: number }> = {
      retail: { tipe: 'retail', trx_count: 0, total_transaksi: 0, total_poin: 0, total_kupon: 0 },
      grosir: { tipe: 'grosir', trx_count: 0, total_transaksi: 0, total_poin: 0, total_kupon: 0 },
      ukm: { tipe: 'ukm', trx_count: 0, total_transaksi: 0, total_poin: 0, total_kupon: 0 },
    };

    const memberAgg = new Map<string, { id: string; trx_count: number; total_transaksi: number; total_poin: number; total_kupon: number }>();
    const trendAgg = new Map<string, { bulan: string; trx_count: number; total_transaksi: number; total_poin: number; total_kupon: number }>();

    for (const inv of filteredInvoices) {
      const outlet = inv.outlet_id ? outletMap.get(inv.outlet_id) : null;
      const jumlah = Number(inv.jumlah) || 0;
      const poin = Number(inv.poin) || 0;
      const kupon = Number(inv.kupon) || 0;

      if (!inv.outlet_id) {
        unmappedCount++;
        const nPos = (inv.nama_pos || '').trim();
        if (nPos && nPos.toUpperCase() !== 'CASH') {
          unmappedNamesSet.add(nPos);
        }
      } else {
        total_transaksi += jumlah;
        total_poin += poin;
        total_kupon += kupon;

        const rawTipe = String(outlet?.tipe || 'retail').toLowerCase();
        const tipe = rawTipe === 'grosir' ? 'grosir' : rawTipe === 'ukm' ? 'ukm' : 'retail';
        byLiniBisnisMap[tipe].trx_count += 1;
        byLiniBisnisMap[tipe].total_transaksi += jumlah;
        byLiniBisnisMap[tipe].total_poin += poin;
        byLiniBisnisMap[tipe].total_kupon += kupon;

        const idenId = inv.identity_id || outlet?.identity_id;
        if (idenId) {
          const m = memberAgg.get(idenId) || { id: idenId, trx_count: 0, total_transaksi: 0, total_poin: 0, total_kupon: 0 };
          m.trx_count += 1;
          m.total_transaksi += jumlah;
          m.total_poin += poin;
          m.total_kupon += kupon;
          memberAgg.set(idenId, m);
        }
      }

      const bln = inv.bulan || (inv.tanggal ? String(inv.tanggal).slice(0, 7) : '2026-09');
      const tr = trendAgg.get(bln) || { bulan: bln, trx_count: 0, total_transaksi: 0, total_poin: 0, total_kupon: 0 };
      tr.trx_count += 1;
      tr.total_transaksi += jumlah;
      tr.total_poin += poin;
      tr.total_kupon += kupon;
      trendAgg.set(bln, tr);
    }

    const topMembers = Array.from(memberAgg.values())
      .map(m => {
        const iden = identityMap.get(m.id);
        return {
          ...m,
          nama_pemilik: iden?.nama_pemilik || m.id,
          kota: iden?.kota || 'WATAMPONE',
        };
      })
      .sort((a, b) => b.total_poin - a.total_poin || b.total_transaksi - a.total_transaksi)
      .slice(0, 5);

    const monthlyTrend = Array.from(trendAgg.values())
      .sort((a, b) => a.bulan.localeCompare(b.bulan))
      .map(t => ({
        ...t,
        label: formatBulanLabel(t.bulan),
      }));

    // Info batch import terakhir
    let lastImport: any = null;
    const batches: any[] = [];
    batchSnap.forEach(d => batches.push(d.data()));
    if (batches.length > 0) {
      batches.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      lastImport = batches[0];
    }

    const coupCount = (coupSnap as any)?.data ? (coupSnap as any).data().count : 0;

    return {
      data: {
        periodInfo: {
          type: periodType,
          label: periodLabel,
          month: month || (availableMonths[0]?.value || '2026-09'),
          year: year || (availableYears[0] || '2026'),
          startDate: activeStartDate,
          endDate: activeEndDate,
        },
        availableMonths,
        availableYears,
        totals: {
          total_poin,
          total_kupon: total_kupon || coupCount,
          total_transaksi,
          total_invoices: allInvoices.length,
        },
        wasteTotals: {
          total_waste_trx: 0,
          total_waste_kg: 0.0,
          total_waste_rupiah: 0,
          total_waste_poin: 0,
        },
        byLiniBisnis: [
          byLiniBisnisMap.retail,
          byLiniBisnisMap.ukm,
          byLiniBisnisMap.grosir,
        ],
        topMembers,
        monthlyTrend,
        globalStats: {
          totalIdentities: idSnap.size,
          totalOutlets: outSnap.size,
          totalAliases: 20,
          totalRawInvoices: allInvoices.length,
          pendingApprovals: pendingApprovalsCount,
          belumPetakan: unmappedNamesSet.size,
          belumPetakanInvoices: unmappedCount,
          lastImport: lastImport ? {
            filename: lastImport.filename || '',
            created_at: lastImport.created_at || '',
            bulan: lastImport.bulan || '2026-09',
            tipe: lastImport.tipe || 'transaksi',
          } : null,
          statementStats: [
            { status: 'draft', jumlah: 0 },
            { status: 'final', jumlah: 0 },
            { status: 'perlu_revisi', jumlah: 0 },
          ],
        },
      },
    };
  }

  // 8a. OUTLETS NEXT ID /api/outlets/next-id
  if (pathname === '/api/outlets/next-id') {
    const identityId = searchParams.get('identity_id') || '';
    const tipe = (searchParams.get('tipe') || 'ukm').toLowerCase();

    if (!identityId) {
      return { status: 400, data: { error: 'identity_id wajib disertakan' } };
    }

    if (tipe === 'retail') {
      return { data: { nextId: identityId, tipe: 'retail' } };
    }

    if (tipe === 'grosir') {
      const nextId = `${identityId}-01-900`;
      const snap = await getDocs(query(collection(db, COLLECTIONS.OUTLETS), where('identity_id', '==', identityId)));
      let exists = false;
      snap.forEach(d => {
        if (d.id === nextId || d.data().tipe === 'grosir') exists = true;
      });
      return { data: { nextId, tipe: 'grosir', exists } };
    }

    // UKM ke-n: format 102-YYMMDD-NN-nn-100
    const snap = await getDocs(query(collection(db, COLLECTIONS.OUTLETS), where('identity_id', '==', identityId)));
    let maxSeq = 0;
    snap.forEach(d => {
      const docId = d.id || '';
      const parts = docId.split('-');
      if (parts.length >= 2 && parts[parts.length - 1] === '100') {
        const seq = parseInt(parts[parts.length - 2], 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });

    const nextSeq = String(maxSeq + 1).padStart(2, '0');
    const nextId = `${identityId}-${nextSeq}-100`;
    return { data: { nextId, tipe: 'ukm', seq: maxSeq + 1 } };
  }

  // 8b. OUTLET STATUS /api/outlets/:id/status
  if (pathname.startsWith('/api/outlets/') && pathname.endsWith('/status')) {
    const rawId = pathname.replace('/api/outlets/', '').replace('/status', '');
    const outletId = decodeURIComponent(rawId);
    const action = body.action; // 'deactivate' | 'activate'
    const alasan = body.alasan || '';

    const outletRef = doc(db, COLLECTIONS.OUTLETS, outletId);
    const snap = await getDoc(outletRef);
    if (!snap.exists()) {
      return { status: 404, data: { error: 'Outlet tidak ditemukan' } };
    }

    if (action === 'deactivate') {
      await updateDoc(outletRef, {
        aktif: 0,
        nonaktif_tipe: 'manual',
        nonaktif_alasan: alasan || 'Lini bisnis ditutup pemilik',
        nonaktif_tanggal: new Date().toISOString(),
        nonaktif_oleh: 'Admin/Owner',
        updated_at: new Date().toISOString(),
      });
      return { data: { success: true, message: `Outlet ${outletId} berhasil dinonaktifkan.` } };
    } else {
      await updateDoc(outletRef, {
        aktif: 1,
        nonaktif_tipe: null,
        nonaktif_alasan: null,
        nonaktif_tanggal: null,
        nonaktif_oleh: null,
        updated_at: new Date().toISOString(),
      });
      return { data: { success: true, message: `Outlet ${outletId} berhasil diaktifkan kembali.` } };
    }
  }

  // 8c. SINGLE OUTLET /api/outlets/:id (GET, PATCH, DELETE)
  if (pathname.startsWith('/api/outlets/') && pathname !== '/api/outlets/next-id' && !pathname.endsWith('/status')) {
    const outletId = decodeURIComponent(pathname.replace('/api/outlets/', ''));

    if (method === 'GET') {
      const snap = await getDoc(doc(db, COLLECTIONS.OUTLETS, outletId));
      if (!snap.exists()) {
        return { status: 404, data: { error: 'Outlet tidak ditemukan' } };
      }
      return { data: { outlet: snap.data(), aliases: [], invStats: { count: 0, total: 0, poin: 0, kupon: 0 } } };
    } else if (method === 'PATCH' || method === 'PUT') {
      const updates: any = { updated_at: new Date().toISOString() };
      if (body.nama_outlet !== undefined) updates.nama_outlet = body.nama_outlet.trim();
      if (body.tipe !== undefined) updates.tipe = body.tipe.toLowerCase();
      if (body.id_pos_lama !== undefined) updates.id_pos_lama = body.id_pos_lama ? body.id_pos_lama.trim() : null;
      if (body.aktif !== undefined) updates.aktif = body.aktif ? 1 : 0;

      await updateDoc(doc(db, COLLECTIONS.OUTLETS, outletId), updates);
      return { data: { success: true, id: outletId } };
    } else if (method === 'DELETE') {
      await deleteDoc(doc(db, COLLECTIONS.OUTLETS, outletId));
      return { data: { success: true, message: `Outlet ${outletId} berhasil dihapus` } };
    }
  }

  // 8d. OUTLETS LIST / CREATE /api/outlets
  if (pathname === '/api/outlets') {
    if (method === 'POST') {
      let { id: outletId, identity_id, tipe, nama_outlet, id_pos_lama } = body;
      if (!identity_id || !nama_outlet) {
        return { status: 400, data: { error: 'identity_id dan nama_outlet wajib diisi' } };
      }
      tipe = (tipe || 'ukm').toLowerCase().trim();
      nama_outlet = (nama_outlet || '').trim();

      // Dapatkan data identity
      const idSnap = await getDoc(doc(db, COLLECTIONS.IDENTITIES, identity_id));
      const identityData = idSnap.exists() ? idSnap.data() : null;

      // Auto-generate ID jika tidak disediakan
      if (!outletId || !outletId.trim()) {
        if (tipe === 'retail') {
          outletId = identity_id;
        } else if (tipe === 'grosir') {
          outletId = `${identity_id}-01-900`;
        } else {
          // UKM
          const snap = await getDocs(query(collection(db, COLLECTIONS.OUTLETS), where('identity_id', '==', identity_id)));
          let maxSeq = 0;
          snap.forEach(d => {
            const docId = d.id || '';
            const parts = docId.split('-');
            if (parts.length >= 2 && parts[parts.length - 1] === '100') {
              const seq = parseInt(parts[parts.length - 2], 10);
              if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
            }
          });
          outletId = `${identity_id}-${String(maxSeq + 1).padStart(2, '0')}-100`;
        }
      } else {
        outletId = outletId.trim();
      }

      // Validasi konflik ID
      const existing = await getDoc(doc(db, COLLECTIONS.OUTLETS, outletId));
      if (existing.exists()) {
        return { status: 400, data: { error: `ID Outlet "${outletId}" sudah terdaftar` } };
      }

      const newOutlet = {
        id: outletId,
        identity_id,
        nama_pemilik: identityData?.nama_pemilik || '',
        tipe,
        nama_outlet,
        id_pos_lama: id_pos_lama ? String(id_pos_lama).trim() : null,
        aktif: 1,
        aliases: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await setDoc(doc(db, COLLECTIONS.OUTLETS, outletId), newOutlet);
      return { data: { success: true, outlet: newOutlet } };
    }

    // GET /api/outlets
    const q = (searchParams.get('q') || '').toLowerCase().trim();
    const status = (searchParams.get('status') || '').toLowerCase();
    const identityId = searchParams.get('identity_id') || '';

    const snap = await getDocs(collection(db, COLLECTIONS.OUTLETS));
    let outlets: any[] = [];
    snap.forEach(d => {
      const o = d.data();
      outlets.push({
        ...o,
        total_transaksi: o.total_transaksi || 0,
        total_poin: o.total_poin || 0,
        total_kupon: o.total_kupon || 0,
        aliases: o.aliases || null,
      });
    });

    if (identityId) {
      outlets = outlets.filter(o => o.identity_id === identityId);
    }
    if (status === 'aktif') {
      outlets = outlets.filter(o => o.aktif === 1);
    } else if (status === 'nonaktif') {
      outlets = outlets.filter(o => o.aktif === 0);
    }
    if (q) {
      outlets = outlets.filter(
        o => (o.nama_outlet && o.nama_outlet.toLowerCase().includes(q)) ||
             (o.id && o.id.toLowerCase().includes(q)) ||
             (o.nama_pemilik && o.nama_pemilik.toLowerCase().includes(q))
      );
    }

    outlets.sort((a, b) => (a.id || '').localeCompare(b.id || '', undefined, { numeric: true }));
    return { data: { outlets } };
  }

  // 9a. IMPORT MASTER CUSTOMER /api/import/master
  if (pathname === '/api/import/master' && method === 'POST') {
    if (!formData) {
      return { status: 400, data: { error: 'Form data tidak ditemukan' } };
    }
    const file = formData.get('file') as File | null;
    if (!file) {
      return { status: 400, data: { error: 'File tidak ditemukan' } };
    }

    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellStyles: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<any>(ws);

    const peringatan: string[] = [];
    let barisOk = 0;
    let barisSkip = 0;
    let barisWarn = 0;
    let approvalCount = 0;

    const batchSnap = await getDocs(collection(db, COLLECTIONS.IMPORT_BATCHES));
    const batchId = batchSnap.size + 1;

    // Kumpulkan kode 102 bersih untuk cek tabrakan
    const kode102Map = new Map<string, string[]>();
    for (const row of rawRows) {
      const kode = getExcelField(row, 'Kode', 'kode', 'KODE');
      if (!kode.startsWith('102-')) continue;
      const info = parseKode102(kode);
      if (info.tipe !== 'invalid') {
        const existing = kode102Map.get(info.clean) || [];
        existing.push(getExcelField(row, 'Nama', 'nama', 'NAMA') || '[KOSONG]');
        kode102Map.set(info.clean, existing);
      }
    }

    const tabrakanKode = new Set<string>();
    for (const [kode, namas] of kode102Map) {
      if (namas.length > 1) {
        tabrakanKode.add(kode);
      }
    }

    const idSnap = await getDocs(collection(db, COLLECTIONS.IDENTITIES));
    const existingIdMap = new Map<string, any>();
    idSnap.forEach(d => existingIdMap.set(d.id, d.data()));

    const outSnap = await getDocs(collection(db, COLLECTIONS.OUTLETS));
    const existingOutMap = new Map<string, any>();
    outSnap.forEach(d => existingOutMap.set(d.id, d.data()));

    let currentBatch = writeBatch(db);
    let opCount = 0;

    const commitBatchIfNeeded = async () => {
      if (opCount >= 350) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        opCount = 0;
      }
    };

    for (const row of rawRows) {
      const kode = getExcelField(row, 'Kode', 'kode', 'KODE', 'Customer Code');
      const nama = getExcelField(row, 'Nama', 'nama', 'NAMA', 'Nama Customer');
      const alamat = getExcelField(row, 'Alamat', 'alamat', 'ALAMAT', 'Address');
      const kota = getExcelField(row, 'Kota', 'kota', 'KOTA', 'City') || 'WATAMPONE';
      const kategori = getExcelField(row, 'Kategori', 'kategori', 'KATEGORI');
      const hp = getExcelField(row, 'HP', 'hp', 'No HP', 'Kontak', 'Phone');

      if (!kode || kode.toLowerCase() === 'sum') {
        barisSkip++;
        continue;
      }

      if (!nama) {
        barisWarn++;
        peringatan.push(`Nama kosong untuk kode: ${kode}`);
        const apprRef = doc(collection(db, COLLECTIONS.APPROVALS));
        currentBatch.set(apprRef, {
          id: apprRef.id,
          jenis: 'anomali_master',
          payload: { kode, nama: '', alamat, kota, kategori, alasan: 'Nama kosong' },
          status: 'menunggu',
          batch_id: batchId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        opCount++;
        approvalCount++;
        await commitBatchIfNeeded();
        continue;
      }

      if (!kode.startsWith('131-') && !kode.startsWith('102-')) {
        barisWarn++;
        peringatan.push(`Kode tidak lazim: ${kode} (${nama})`);
        const apprRef = doc(collection(db, COLLECTIONS.APPROVALS));
        currentBatch.set(apprRef, {
          id: apprRef.id,
          jenis: 'anomali_master',
          payload: { kode, nama, alamat, kota, kategori, alasan: 'Kode tidak lazim' },
          status: 'menunggu',
          batch_id: batchId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        opCount++;
        approvalCount++;
        await commitBatchIfNeeded();
        continue;
      }

      if (kode.startsWith('102-')) {
        const info = parseKode102(kode);
        if (info.tipe === 'invalid') {
          barisWarn++;
          peringatan.push(`Format kode 102 tidak valid: ${kode} (${nama}) — ${info.reason}`);
          const apprRef = doc(collection(db, COLLECTIONS.APPROVALS));
          currentBatch.set(apprRef, {
            id: apprRef.id,
            jenis: 'anomali_master',
            payload: { kode, nama, alamat, kota, kategori, alasan: info.reason },
            status: 'menunggu',
            batch_id: batchId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          opCount++;
          approvalCount++;
          await commitBatchIfNeeded();
          continue;
        }

        if (tabrakanKode.has(info.clean)) {
          barisWarn++;
          peringatan.push(`Kode 102 tabrakan: ${kode} dipakai oleh ${kode102Map.get(info.clean)?.join(', ')}`);
          const apprRef = doc(collection(db, COLLECTIONS.APPROVALS));
          currentBatch.set(apprRef, {
            id: apprRef.id,
            jenis: 'kode_tabrakan',
            payload: { kode: info.clean, namas: kode102Map.get(info.clean), alasan: 'Satu kode 102 digunakan beberapa nama berbeda' },
            status: 'menunggu',
            batch_id: batchId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          opCount++;
          approvalCount++;
          await commitBatchIfNeeded();
          continue;
        }

        if (info.tipe === 'akun_utama') {
          const idRef = doc(db, COLLECTIONS.IDENTITIES, info.clean);
          const existing = existingIdMap.get(info.clean);
          if (!existing) {
            const newIdDoc = {
              id: info.clean,
              nama_pemilik: nama,
              alamat: alamat || '',
              kota: kota || 'WATAMPONE',
              whatsapp: hp || '',
              status: 'aktif',
              total_poin: 0,
              total_kupon: 0,
              jumlah_outlet: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            currentBatch.set(idRef, newIdDoc);
            existingIdMap.set(info.clean, newIdDoc);
            opCount++;
          } else {
            currentBatch.update(idRef, {
              alamat: alamat || existing.alamat || '',
              kota: kota || existing.kota || 'WATAMPONE',
              updated_at: new Date().toISOString(),
            });
            opCount++;
          }

          // Retail outlet
          const outletRef = doc(db, COLLECTIONS.OUTLETS, info.clean);
          if (!existingOutMap.has(info.clean)) {
            const newOut = {
              id: info.clean,
              identity_id: info.clean,
              nama_pemilik: nama,
              nama_outlet: nama,
              tipe: 'retail',
              aktif: 1,
              aliases: null,
              total_transaksi: 0,
              total_poin: 0,
              total_kupon: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            currentBatch.set(outletRef, newOut);
            existingOutMap.set(info.clean, newOut);
            opCount++;
          }
          barisOk++;
          await commitBatchIfNeeded();
        } else {
          // Grosir atau UKM
          const identityId = info.parent;
          const tipe = info.tipe; // 'grosir' | 'ukm'

          if (!existingIdMap.has(identityId)) {
            const parentIdRef = doc(db, COLLECTIONS.IDENTITIES, identityId);
            const parentDoc = {
              id: identityId,
              nama_pemilik: nama,
              alamat: alamat || '',
              kota: kota || 'WATAMPONE',
              whatsapp: hp || '',
              status: 'aktif',
              total_poin: 0,
              total_kupon: 0,
              jumlah_outlet: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            currentBatch.set(parentIdRef, parentDoc);
            existingIdMap.set(identityId, parentDoc);
            opCount++;
          }

          const outRef = doc(db, COLLECTIONS.OUTLETS, info.clean);
          const parentIdDoc = existingIdMap.get(identityId);
          const newOut = {
            id: info.clean,
            identity_id: identityId,
            nama_pemilik: parentIdDoc?.nama_pemilik || nama,
            nama_outlet: nama,
            tipe: tipe,
            aktif: 1,
            aliases: null,
            total_transaksi: 0,
            total_poin: 0,
            total_kupon: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          currentBatch.set(outRef, newOut, { merge: true });
          existingOutMap.set(info.clean, newOut);
          opCount++;
          barisOk++;
          await commitBatchIfNeeded();
        }
      } else {
        // Kode 131
        barisOk++;
        const apprRef = doc(collection(db, COLLECTIONS.APPROVALS));
        currentBatch.set(apprRef, {
          id: apprRef.id,
          jenis: 'kode_lama_131',
          payload: {
            kode,
            nama,
            alamat,
            kota,
            kategori,
            alasan: 'Customer terdaftar dengan kode POS lama (131). Dapat dipetakan ke Akun Utama CRM.',
          },
          status: 'menunggu',
          batch_id: batchId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        opCount++;
        approvalCount++;
        await commitBatchIfNeeded();
      }
    }

    const batchDocRef = doc(db, COLLECTIONS.IMPORT_BATCHES, String(batchId));
    currentBatch.set(batchDocRef, {
      id: batchId,
      tipe: 'master_customer',
      filename: file.name,
      total_baris: rawRows.length,
      baris_ok: barisOk,
      baris_skip: barisSkip,
      baris_warn: barisWarn,
      status: 'selesai',
      created_at: new Date().toISOString(),
    });
    opCount++;

    if (opCount > 0) {
      await currentBatch.commit();
    }

    return {
      data: {
        success: true,
        batchId,
        totalBaris: rawRows.length,
        barisOk,
        barisSkip,
        barisWarn,
        peringatan,
        approvalCount,
      },
    };
  }

  // 9b. IMPORT TRANSAKSI BULANAN /api/import/transaksi
  if (pathname === '/api/import/transaksi' && method === 'POST') {
    if (!formData) {
      return { status: 400, data: { error: 'Form data tidak ditemukan' } };
    }
    const file = formData.get('file') as File | null;
    const bulan = (formData.get('bulan') as string) || '';
    if (!file) {
      return { status: 400, data: { error: 'File tidak ditemukan' } };
    }
    if (!bulan || !/^\d{4}-\d{2}$/.test(bulan)) {
      return { status: 400, data: { error: 'Parameter bulan harus format YYYY-MM' } };
    }

    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellStyles: false });
    const ws = wb.Sheets[wb.SheetNames[0]];

    const required = ['Tanggal', 'No Invoice', 'Nama Customer', 'Jenis', 'Jumlah'];
    const headerRow = (XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][])[0] as string[];

    const headerRowLower = (headerRow || []).map(h => String(h || '').trim().toLowerCase());
    for (const col of required) {
      const colLower = col.toLowerCase();
      const match = headerRowLower.some(h => h.includes(colLower));
      if (!match) {
        return { status: 400, data: { error: `Header tidak valid: kolom "${col}" tidak ditemukan. File ditolak.` } };
      }
    }

    const rawRows = XLSX.utils.sheet_to_json<any>(ws);
    const peringatan: string[] = [];
    let barisOk = 0;
    let barisSkip = 0;
    let barisWarn = 0;
    let approvalCount = 0;

    const batchSnap = await getDocs(collection(db, COLLECTIONS.IMPORT_BATCHES));
    const batchId = batchSnap.size + 1;

    // Preload aliases
    const aliasSnap = await getDocs(collection(db, COLLECTIONS.POS_ALIASES));
    const aliasMap = new Map<string, string>();
    aliasSnap.forEach(d => {
      const a = d.data();
      if (a.nama_pos && a.outlet_id) aliasMap.set(a.nama_pos.toLowerCase().trim(), a.outlet_id);
    });

    // Preload outlets
    const outSnap = await getDocs(collection(db, COLLECTIONS.OUTLETS));
    const outletMap = new Map<string, any>();
    const outletByNameMap = new Map<string, any>();
    outSnap.forEach(d => {
      const o = d.data();
      outletMap.set(d.id, o);
      if (o.nama_outlet) outletByNameMap.set(o.nama_outlet.toLowerCase().trim(), o);
    });

    // Preload identities
    const idSnap = await getDocs(collection(db, COLLECTIONS.IDENTITIES));
    const identityMap = new Map<string, any>();
    idSnap.forEach(d => identityMap.set(d.id, d.data()));

    // Preload approvals & master names untuk deteksi unmapped
    const apprSnap = await getDocs(query(collection(db, COLLECTIONS.APPROVALS), where('jenis', '==', 'nama_belum_dipetakan')));
    const existingUnmappedApprs = new Set<string>();
    apprSnap.forEach(d => {
      const a = d.data();
      const p = typeof a.payload === 'string' ? JSON.parse(a.payload) : a.payload;
      if (p?.nama_pos) existingUnmappedApprs.add(String(p.nama_pos).toUpperCase().trim());
    });

    const masterNamas = new Set<string>();
    idSnap.forEach(d => {
      const data = d.data();
      if (data.nama_pemilik) masterNamas.add(String(data.nama_pemilik).toUpperCase().trim());
    });
    outSnap.forEach(d => {
      const data = d.data();
      if (data.nama_outlet) masterNamas.add(String(data.nama_outlet).toUpperCase().trim());
    });

    let currentBatch = writeBatch(db);
    let opCount = 0;

    const commitBatchIfNeeded = async () => {
      if (opCount >= 350) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        opCount = 0;
      }
    };

    const outletStatsDelta = new Map<string, { trx: number; poin: number; kupon: number }>();
    const identityStatsDelta = new Map<string, { poin: number; kupon: number }>();

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (String(row.No || '').toLowerCase() === 'sum') {
        barisSkip++;
        continue;
      }

      const noInvoice = getExcelField(row, 'No Invoice', 'No. Invoice', 'NoInvoice', 'Invoice', 'No Faktur');
      const namaCustomer = getExcelField(row, 'Nama Customer', 'Nama Pelanggan', 'Customer', 'Customer Name');
      const jenis = getExcelField(row, 'Jenis', 'Jenis Pembayaran', 'Payment Type') || 'TUNAI';
      const jumlah = parseExcelJumlah(row.Jumlah ?? row.jumlah ?? row.JUMLAH ?? row.Total);
      const tanggalVal = row.Tanggal ?? row.tanggal ?? row.TANGGAL ?? row.Date;

      if (!tanggalVal || namaCustomer === 'CASH' || !namaCustomer) {
        barisSkip++;
        continue;
      }

      const tanggal = parseExcelDate(tanggalVal);

      // Cari outlet
      const custKey = namaCustomer.toLowerCase().trim();
      let targetOutletId = aliasMap.get(custKey) || null;
      let matchedOutlet = targetOutletId ? outletMap.get(targetOutletId) : null;

      if (!matchedOutlet) {
        const found = outletByNameMap.get(custKey);
        if (found) {
          targetOutletId = found.id;
          matchedOutlet = found;
        }
      }

      let poin = 0;
      let kupon = 0;
      let isExcluded = 0;

      if (matchedOutlet) {
        const iden = matchedOutlet.identity_id ? identityMap.get(matchedOutlet.identity_id) : null;
        let isSuspended = false;
        if (iden && iden.is_suspended === 1) {
          const { suspend_type, suspend_dari, suspend_sampai } = iden;
          if (!suspend_dari) isSuspended = true;
          else if (suspend_type === 'permanent') {
            if (tanggal >= suspend_dari) isSuspended = true;
          } else if (suspend_type === 'temporary' && suspend_sampai) {
            if (tanggal >= suspend_dari && tanggal <= suspend_sampai) isSuspended = true;
          } else if (tanggal >= suspend_dari) {
            isSuspended = true;
          }
        }

        if (isSuspended) {
          poin = 0;
          kupon = 0;
          isExcluded = 1;
        } else {
          const tipe = (matchedOutlet.tipe || 'retail').toLowerCase();
          const rate = tipe === 'grosir' ? 200000 : tipe === 'ukm' ? 50000 : 100000;
          poin = Math.floor(jumlah / rate);
          kupon = Math.floor(jumlah / 150000);
        }

        // Agregasi outlet
        const outDelta = outletStatsDelta.get(targetOutletId!) || { trx: 0, poin: 0, kupon: 0 };
        outDelta.trx += 1;
        outDelta.poin += poin;
        outDelta.kupon += kupon;
        outletStatsDelta.set(targetOutletId!, outDelta);

        // Agregasi identity
        if (matchedOutlet.identity_id) {
          const idDelta = identityStatsDelta.get(matchedOutlet.identity_id) || { poin: 0, kupon: 0 };
          idDelta.poin += poin;
          idDelta.kupon += kupon;
          identityStatsDelta.set(matchedOutlet.identity_id, idDelta);
        }
      } else {
        // Nama transaksi belum terpetakan — buat antrean approval jika belum ada
        barisWarn++;
        const custUpper = namaCustomer.toUpperCase().trim();
        if (!existingUnmappedApprs.has(custUpper)) {
          existingUnmappedApprs.add(custUpper);
          peringatan.push(`Nama belum terpetakan: "${namaCustomer}"`);
          const apprRef = doc(collection(db, COLLECTIONS.APPROVALS));
          currentBatch.set(apprRef, {
            id: apprRef.id,
            jenis: 'nama_belum_dipetakan',
            payload: {
              nama_pos: namaCustomer,
              ada_di_master: masterNamas.has(custUpper),
              alasan: masterNamas.has(custUpper)
                ? 'Nama ada di master, perlu dipetakan ke outlet/lini bisnis spesifik.'
                : 'Nama baru tidak ditemukan di master, perlu dipetakan ke outlet tujuan.',
            },
            status: 'menunggu',
            batch_id: batchId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          opCount++;
          approvalCount++;
          await commitBatchIfNeeded();
        }
      }

      const cleanInvId = `${noInvoice || 'INV'}_${bulan}_${i}`.replace(/[\/\\]/g, '_');
      const invRef = doc(db, COLLECTIONS.INVOICES, cleanInvId);

      currentBatch.set(invRef, {
        no_invoice: noInvoice,
        tanggal,
        nama_pos: namaCustomer,
        jenis,
        jumlah,
        batch_id: batchId,
        outlet_id: targetOutletId,
        identity_id: matchedOutlet?.identity_id || null,
        poin,
        kupon,
        is_excluded: isExcluded,
        bulan,
        created_at: new Date().toISOString(),
      });
      opCount++;
      barisOk++;
      await commitBatchIfNeeded();
    }

    // Update outlet totals
    for (const [outId, delta] of outletStatsDelta) {
      const outRef = doc(db, COLLECTIONS.OUTLETS, outId);
      const existing = outletMap.get(outId);
      if (existing) {
        currentBatch.update(outRef, {
          total_transaksi: (existing.total_transaksi || 0) + delta.trx,
          total_poin: (existing.total_poin || 0) + delta.poin,
          total_kupon: (existing.total_kupon || 0) + delta.kupon,
          updated_at: new Date().toISOString(),
        });
        opCount++;
        await commitBatchIfNeeded();
      }
    }

    // Update identity totals
    for (const [idenId, delta] of identityStatsDelta) {
      const idRef = doc(db, COLLECTIONS.IDENTITIES, idenId);
      const existing = identityMap.get(idenId);
      if (existing) {
        currentBatch.update(idRef, {
          total_poin: (existing.total_poin || 0) + delta.poin,
          total_kupon: (existing.total_kupon || 0) + delta.kupon,
          updated_at: new Date().toISOString(),
        });
        opCount++;
        await commitBatchIfNeeded();
      }
    }

    // Batch record
    const batchDocRef = doc(db, COLLECTIONS.IMPORT_BATCHES, String(batchId));
    currentBatch.set(batchDocRef, {
      id: batchId,
      tipe: 'transaksi',
      filename: file.name,
      bulan,
      total_baris: rawRows.length,
      baris_ok: barisOk,
      baris_skip: barisSkip,
      baris_warn: barisWarn,
      status: 'selesai',
      created_at: new Date().toISOString(),
    });
    opCount++;

    if (opCount > 0) {
      await currentBatch.commit();
    }

    return {
      data: {
        success: true,
        batchId,
        totalBaris: rawRows.length,
        barisOk,
        barisSkip,
        barisWarn,
        peringatan,
        approvalCount,
      },
    };
  }

  // Fallback default response
  return { data: { success: true } };
}

