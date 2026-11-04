/**
 * firestore-service.ts — Cloud Firestore Data Access Service
 * Menyediakan antarmuka async untuk seluruh operasi data di Firebase Firestore.
 */

import firestore, { COLLECTIONS } from './firebase';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// In-Memory Caches untuk Menekan Latensi & Kuota Baca Firestore
// ---------------------------------------------------------------------------
interface CachedSession {
  user: {
    id: number;
    username: string;
    nama: string;
    role: 'admin' | 'staff';
  };
  expiresAt: string;
}

const sessionCache = new Map<string, { data: CachedSession; cachedAt: number }>();
let ownerPasswordCache: { hash: string; cachedAt: number } | null = null;
let rulesCache: { data: Record<string, number>; cachedAt: number } | null = null;

const CACHE_TTL_SESSION = 5 * 60 * 1000; // 5 menit
const CACHE_TTL_RULES = 60 * 1000;       // 1 menit
const CACHE_TTL_OWNER = 60 * 1000;       // 1 menit

// ---------------------------------------------------------------------------
// 1. Password Hashing & Verification
// ---------------------------------------------------------------------------
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${derivedKey}`;
}

export function verifyPasswordHash(plain: string, stored: string): { valid: boolean; needsUpgrade: boolean } {
  if (!stored || !plain) return { valid: false, needsUpgrade: false };

  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length === 3) {
      const salt = parts[1];
      const expectedKey = parts[2];
      try {
        const derivedKey = crypto.scryptSync(plain, salt, 64).toString('hex');
        const bufA = Buffer.from(derivedKey, 'hex');
        const bufB = Buffer.from(expectedKey, 'hex');
        if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
          return { valid: true, needsUpgrade: false };
        }
      } catch {
        return { valid: false, needsUpgrade: false };
      }
      return { valid: false, needsUpgrade: false };
    }
  }

  const matches = plain.trim() === stored.trim();
  return { valid: matches, needsUpgrade: matches };
}

// ---------------------------------------------------------------------------
// 2. Autentikasi Pengguna & Sesi (Firestore)
// ---------------------------------------------------------------------------
export interface AuthUser {
  id: number;
  username: string;
  nama: string;
  role: 'admin' | 'staff';
}

export async function authenticateUserFirestore(
  username: string,
  password: string
): Promise<{ user: AuthUser; token: string }> {
  const u = (username || '').trim().toLowerCase();
  const p = (password || '').trim();

  if (!u || !p) {
    throw new Error('Username dan password wajib diisi');
  }

  const userDoc = await firestore.collection(COLLECTIONS.APP_USERS).doc(u).get();
  if (!userDoc.exists) {
    throw new Error('Username tidak ditemukan');
  }

  const userData = userDoc.data()!;
  if (userData.aktif !== 1) {
    throw new Error('Akun sedang dinonaktifkan. Hubungi Administrator.');
  }

  // Khusus admin, bandingkan juga dengan system_auth
  let expectedPassword = userData.password;
  if (u === 'admin') {
    const authDoc = await firestore.collection('system_auth').doc('1').get();
    if (authDoc.exists) {
      expectedPassword = authDoc.data()?.password || expectedPassword;
    }
  }

  const { valid, needsUpgrade } = verifyPasswordHash(p, expectedPassword);
  if (!valid) {
    throw new Error(u === 'admin' ? 'Password Administrator / Owner salah' : 'Password salah');
  }

  // Auto-upgrade password jika masih format plaintext lama
  if (needsUpgrade) {
    const newHash = hashPassword(p);
    await firestore.collection(COLLECTIONS.APP_USERS).doc(u).update({ password: newHash });
    if (u === 'admin') {
      await firestore.collection('system_auth').doc('1').set({ password: newHash, updated_at: new Date().toISOString() }, { merge: true });
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 hari

  const authUser: AuthUser = {
    id: userData.id || (u === 'admin' ? 1 : 2),
    username: userData.username || u,
    nama: userData.nama || (u === 'admin' ? 'Administrator (Owner)' : 'Petugas CRM / Kasir'),
    role: userData.role || (u === 'admin' ? 'admin' : 'staff'),
  };

  // Simpan ke Firestore
  await firestore.collection(COLLECTIONS.APP_SESSIONS).doc(token).set({
    token,
    user_id: authUser.id,
    user: authUser,
    expires_at: expiresAt,
    created_at: now.toISOString(),
  });

  // Perbarui last_login di app_users
  await firestore.collection(COLLECTIONS.APP_USERS).doc(u).update({
    last_login: now.toISOString(),
  });

  // Simpan ke memory cache
  sessionCache.set(token, {
    data: { user: authUser, expiresAt },
    cachedAt: Date.now(),
  });

  return { user: authUser, token };
}

export async function validateSessionFirestore(token: string | null | undefined): Promise<AuthUser | null> {
  if (!token) return null;

  // 1. Cek memory cache terlebih dahulu (0ms response)
  const cached = sessionCache.get(token);
  const nowMs = Date.now();
  if (cached && nowMs - cached.cachedAt < CACHE_TTL_SESSION) {
    if (new Date(cached.data.expiresAt).getTime() > nowMs) {
      return cached.data.user;
    } else {
      sessionCache.delete(token);
      return null;
    }
  }

  // 2. Query Firestore
  try {
    const sessionDoc = await firestore.collection(COLLECTIONS.APP_SESSIONS).doc(token).get();
    if (!sessionDoc.exists) return null;

    const data = sessionDoc.data()!;
    const expiresAt = data.expires_at;
    if (new Date(expiresAt).getTime() <= nowMs) {
      // Sesi telah kedaluwarsa, hapus dari Firestore
      await firestore.collection(COLLECTIONS.APP_SESSIONS).doc(token).delete();
      return null;
    }

    let user: AuthUser;
    if (data.user) {
      user = data.user as AuthUser;
    } else {
      // Fallback jika belum tersimpan embedded
      const userSnap = await firestore
        .collection(COLLECTIONS.APP_USERS)
        .where('id', '==', data.user_id)
        .limit(1)
        .get();
      if (userSnap.empty) return null;
      const uData = userSnap.docs[0].data();
      user = {
        id: uData.id,
        username: uData.username,
        nama: uData.nama,
        role: uData.role,
      };
    }

    // Perbarui cache
    sessionCache.set(token, {
      data: { user, expiresAt },
      cachedAt: nowMs,
    });

    return user;
  } catch (err) {
    console.error('[Firestore] Gagal validasi sesi:', err);
    return null;
  }
}

export async function logoutUserFirestore(token: string | null | undefined): Promise<void> {
  if (!token) return;
  sessionCache.delete(token);
  try {
    await firestore.collection(COLLECTIONS.APP_SESSIONS).doc(token).delete();
  } catch (err) {
    console.error('[Firestore] Gagal logout sesi:', err);
  }
}

export async function verifyOwnerPasswordFirestore(password: string): Promise<boolean> {
  if (!password) return false;

  const now = Date.now();
  let storedHash = '';

  if (ownerPasswordCache && now - ownerPasswordCache.cachedAt < CACHE_TTL_OWNER) {
    storedHash = ownerPasswordCache.hash;
  } else {
    try {
      const doc = await firestore.collection('system_auth').doc('1').get();
      storedHash = doc.exists ? doc.data()?.password : '';
      if (storedHash) {
        ownerPasswordCache = { hash: storedHash, cachedAt: now };
      }
    } catch {
      return false;
    }
  }

  if (!storedHash) return false;
  const { valid } = verifyPasswordHash(password, storedHash);
  return valid;
}

export async function setOwnerPasswordFirestore(currentPassword: string, newPassword: string): Promise<void> {
  const isMatch = await verifyOwnerPasswordFirestore(currentPassword);
  if (!isMatch) {
    throw new Error('Password saat ini salah');
  }

  if (!newPassword || newPassword.trim().length < 4) {
    throw new Error('Password baru minimal 4 karakter');
  }

  const clean = newPassword.trim();
  const hashed = hashPassword(clean);
  const now = new Date().toISOString();

  // Simpan ke system_auth
  await firestore.collection('system_auth').doc('1').set({
    password: hashed,
    updated_at: now,
  }, { merge: true });

  // Sinkronkan ke app_users admin
  await firestore.collection(COLLECTIONS.APP_USERS).doc('admin').set({
    password: hashed,
    updated_at: now,
  }, { merge: true });

  // Reset cache
  ownerPasswordCache = { hash: hashed, cachedAt: Date.now() };

  // Catat audit log
  await recordAuditLogFirestore('update_password', 'system_auth', '1', 'Ubah Password Owner Universal di Firestore');
}

// ---------------------------------------------------------------------------
// 3. Settings & Rules Config (Firestore)
// ---------------------------------------------------------------------------
export async function getRulesConfigFirestore(): Promise<Record<string, number>> {
  const now = Date.now();
  if (rulesCache && now - rulesCache.cachedAt < CACHE_TTL_RULES) {
    return rulesCache.data;
  }

  const snapshot = await firestore.collection(COLLECTIONS.RULES_CONFIG).get();
  const result: Record<string, number> = {};

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data && typeof data.nilai === 'number') {
      result[doc.id] = data.nilai;
    }
  });

  rulesCache = { data: result, cachedAt: now };
  return result;
}

export async function getAllRulesRowsFirestore(): Promise<Array<{ kunci: string; nilai: number; keterangan?: string; updated_at?: string }>> {
  const snapshot = await firestore.collection(COLLECTIONS.RULES_CONFIG).get();
  const rows: Array<{ kunci: string; nilai: number; keterangan?: string; updated_at?: string }> = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    rows.push({
      kunci: doc.id,
      nilai: Number(data.nilai) || 0,
      keterangan: data.keterangan || '',
      updated_at: data.updated_at || '',
    });
  });

  rows.sort((a, b) => a.kunci.localeCompare(b.kunci));
  return rows;
}

export async function updateRuleConfigFirestore(
  kunci: string,
  nilai: number,
  keterangan?: string
): Promise<void> {
  const now = new Date().toISOString();
  await firestore.collection(COLLECTIONS.RULES_CONFIG).doc(kunci).set({
    nilai,
    keterangan: keterangan || '',
    updated_at: now,
    updated_by: 'admin',
  }, { merge: true });

  // Invalidate cache
  rulesCache = null;

  await recordAuditLogFirestore('update_rule', 'rules_config', kunci, `Update ${kunci} = ${nilai}`);
}

// ---------------------------------------------------------------------------
// 4. Audit Log (Firestore)
// ---------------------------------------------------------------------------
export async function recordAuditLogFirestore(
  aksi: string,
  tabel: string,
  recordId: string,
  keterangan: string
): Promise<void> {
  try {
    await firestore.collection(COLLECTIONS.AUDIT_LOG).add({
      aksi,
      tabel,
      record_id: recordId,
      keterangan,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Firestore] Gagal mencatat audit log:', err);
  }
}

// ---------------------------------------------------------------------------
// 5. System Stats (Firestore)
// ---------------------------------------------------------------------------
export async function getSystemStatsFirestore(): Promise<{
  identitiesCount: number;
  outletsCount: number;
  couponsCount: number;
  invoicesCount: number;
  auditCount: number;
  batchCount: number;
}> {
  const [identitiesSnap, outletsSnap, couponsSnap, invoicesSnap, auditSnap, batchSnap] = await Promise.all([
    firestore.collection(COLLECTIONS.IDENTITIES).count().get(),
    firestore.collection(COLLECTIONS.OUTLETS).count().get(),
    firestore.collection(COLLECTIONS.COUPONS).count().get(),
    firestore.collection(COLLECTIONS.INVOICES).count().get(),
    firestore.collection(COLLECTIONS.AUDIT_LOG).count().get(),
    firestore.collection(COLLECTIONS.IMPORT_BATCHES).count().get(),
  ]);

  return {
    identitiesCount: identitiesSnap.data().count,
    outletsCount: outletsSnap.data().count,
    couponsCount: couponsSnap.data().count,
    invoicesCount: invoicesSnap.data().count,
    auditCount: auditSnap.data().count,
    batchCount: batchSnap.data().count,
  };
}


// ---------------------------------------------------------------------------
// 6. Doorprize Coupon Lookup (Firestore)
// ---------------------------------------------------------------------------
export async function lookupCouponWinnerFirestore(query: string, defaultPeriode = '2026-09') {
  // Normalisasi query
  const clean = query.trim().toUpperCase();
  let normalized = clean;
  if (!clean.startsWith('ORT-KUP')) {
    if (/^\d{4}-\d{4}$/.test(clean)) {
      normalized = `ORT-KUP${clean}`;
    } else if (/^\d+$/.test(clean)) {
      const [yyyy, mm] = defaultPeriode.split('-');
      const yy = (yyyy || '2026').slice(-2);
      const m = (mm || '09').padStart(2, '0');
      const nnnn = String(parseInt(clean, 10)).padStart(4, '0');
      normalized = `ORT-KUP${yy}${m}-${nnnn}`;
    }
  }

  // 1. Cari berdasarkan nomor_kupon di Firestore
  let couponDocSnap = await firestore.collection(COLLECTIONS.COUPONS).doc(normalized).get();
  let couponData: any = couponDocSnap.exists ? couponDocSnap.data() : null;

  // Jika tidak ditemukan dengan doc ID, coba query field nomor_kupon
  if (!couponData) {
    const querySnap = await firestore
      .collection(COLLECTIONS.COUPONS)
      .where('nomor_kupon', '==', normalized)
      .limit(1)
      .get();
    if (!querySnap.empty) {
      couponData = querySnap.docs[0].data();
    }
  }

  // Jika belum ketemu dan query murni angka, coba query field nomor_urut
  if (!couponData && /^\d+$/.test(query.trim())) {
    const seq = parseInt(query.trim(), 10);
    const seqSnap = await firestore
      .collection(COLLECTIONS.COUPONS)
      .where('nomor_urut', '==', seq)
      .limit(1)
      .get();
    if (!seqSnap.empty) {
      couponData = seqSnap.docs[0].data();
    }
  }

  if (!couponData) {
    return {
      found: false,
      nomor_dicari: normalized,
      message: `Nomor kupon ${normalized} belum pernah diserahkan atau tidak terdaftar di Firestore.`,
    };
  }

  const isWalkIn = couponData.tipe_penerima === 'walk_in';

  // Ambil Identity & Outlet dari Firestore secara paralel
  const [identitySnap, outletSnap, batchSnap] = await Promise.all([
    couponData.identity_id
      ? firestore.collection(COLLECTIONS.IDENTITIES).doc(couponData.identity_id).get()
      : null,
    couponData.outlet_asal_id
      ? firestore.collection(COLLECTIONS.OUTLETS).doc(couponData.outlet_asal_id).get()
      : null,
    couponData.batch_id
      ? firestore.collection(COLLECTIONS.COUPON_BATCHES).doc(String(couponData.batch_id)).get()
      : null,
  ]);

  const identity = identitySnap && identitySnap.exists ? identitySnap.data() : null;
  const outlet = outletSnap && outletSnap.exists ? outletSnap.data() : null;
  const batch = batchSnap && batchSnap.exists ? batchSnap.data() : null;

  return {
    found: true,
    coupon: {
      id: couponData.id,
      nomor_kupon: couponData.nomor_kupon,
      periode_kupon: couponData.periode_kupon,
      nomor_urut: couponData.nomor_urut,
      status: couponData.status,
      void_reason: couponData.void_reason || null,
      tanggal_serah: couponData.tanggal_serah,
      petugas: couponData.petugas,
      whatsapp: isWalkIn
        ? (couponData.no_hp_walk_in || couponData.whatsapp || '—')
        : (couponData.whatsapp || identity?.whatsapp || '—'),
      tipe_penerima: isWalkIn ? 'walk_in' : 'member',
      nama_walk_in: couponData.nama_walk_in || null,
      no_hp_walk_in: couponData.no_hp_walk_in || null,
      no_invoice: couponData.no_invoice || null,
      member: isWalkIn
        ? {
            id: 'NON-MEMBER',
            nama_pemilik: couponData.nama_walk_in || 'Pelanggan Cash Walk-In',
            alamat: 'Pelanggan Umum (Belanja Tunai di Kasir)',
            kota: couponData.no_invoice ? `No. Struk: ${couponData.no_invoice}` : '—',
            kecamatan: '—',
            provinsi: '—',
          }
        : {
            id: couponData.identity_id,
            nama_pemilik: identity?.nama_pemilik || couponData.identity_id,
            alamat: identity?.alamat || '—',
            kota: identity?.kota || '—',
            kecamatan: identity?.kecamatan || '—',
            provinsi: identity?.provinsi || '—',
          },
      outlet_asal: {
        id: couponData.outlet_asal_id,
        nama_outlet: isWalkIn ? 'Kasir Retail Walk-In' : (outlet?.nama_outlet || couponData.outlet_asal_id),
        tipe: isWalkIn ? 'retail' : (outlet?.tipe || 'retail'),
      },
      batch: {
        id: couponData.batch_id,
        keterangan: isWalkIn
          ? (couponData.no_invoice ? `No. Struk: ${couponData.no_invoice}` : (batch?.keterangan || 'Serah Terima Walk-In'))
          : (batch?.keterangan || '—'),
      },
    },
  };
}
