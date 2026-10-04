/**
 * auth.ts — Universal Authentication, Users & Session System
 * Implements PRD Section 2 & 10: Owner Password & User Session Gate for Production/VPS
 * Features:
 * - Scrypt password hashing with transparent auto-upgrade from plaintext
 * - Rate limiting against brute-force attacks on login
 * - requireAuth helper for Route Handlers
 */
import db from './db';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

// Ensure system_auth, app_users, and app_sessions tables exist
db.exec(`
  CREATE TABLE IF NOT EXISTS system_auth (
    id         INTEGER PRIMARY KEY DEFAULT 1,
    password   TEXT    NOT NULL DEFAULT 'oriental2026',
    updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  );
  INSERT OR IGNORE INTO system_auth(id, password) VALUES (1, 'oriental2026');

  CREATE TABLE IF NOT EXISTS app_users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    nama       TEXT    NOT NULL,
    role       TEXT    NOT NULL DEFAULT 'staff', -- 'admin' | 'staff'
    aktif      INTEGER NOT NULL DEFAULT 1,
    last_login TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  );

  -- Seed initial users if empty
  INSERT OR IGNORE INTO app_users(id, username, password, nama, role, aktif)
  VALUES (1, 'admin', 'oriental2026', 'Administrator (Owner)', 'admin', 1);

  INSERT OR IGNORE INTO app_users(id, username, password, nama, role, aktif)
  VALUES (2, 'kasir', 'kasir2026', 'Petugas CRM / Kasir', 'staff', 1);

  CREATE TABLE IF NOT EXISTS app_sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    expires_at TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON app_sessions(user_id);
`);

export interface AuthUser {
  id: number;
  username: string;
  nama: string;
  role: 'admin' | 'staff';
}

// ---------------------------------------------------------------------------
// 1. Password Hashing (scrypt) & Verification
// ---------------------------------------------------------------------------

/**
 * Hash password menggunakan algoritma scrypt bawaan Node.js dengan random salt
 * Output format: "scrypt$<salt>$<derivedKey>"
 */
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${derivedKey}`;
}

/**
 * Verifikasi password plain terhadap string di DB.
 * Mendukung format hash scrypt DAN plaintext lama (backward-compatible).
 * Jika format masih plaintext namun cocok, kembalikan needsUpgrade: true.
 */
export function verifyPasswordHash(plain: string, stored: string): { valid: boolean; needsUpgrade: boolean } {
  if (!stored || !plain) return { valid: false, needsUpgrade: false };

  // Format hash scrypt
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

  // Format plaintext lama
  const matches = plain.trim() === stored.trim();
  return { valid: matches, needsUpgrade: matches };
}

// ---------------------------------------------------------------------------
// 2. Owner Password Operations
// ---------------------------------------------------------------------------

/**
 * Verifikasi password owner untuk tindakan administratif krusial.
 * Melakukan auto-upgrade ke scrypt hash jika masih tersimpan plaintext.
 */
export function verifyOwnerPassword(password: string): boolean {
  if (!password) return false;
  const row = db.prepare(`SELECT password FROM system_auth WHERE id = 1`).get() as { password: string } | undefined;
  const stored = row?.password || 'oriental2026';
  
  const { valid, needsUpgrade } = verifyPasswordHash(password, stored);
  if (valid && needsUpgrade) {
    const newHash = hashPassword(password);
    db.prepare(`UPDATE system_auth SET password = ?, updated_at = datetime('now','localtime') WHERE id = 1`).run(newHash);
    db.prepare(`UPDATE app_users SET password = ? WHERE username = 'admin'`).run(newHash);
  }
  return valid;
}

/**
 * Ubah password owner (disimpan dalam format scrypt hash)
 */
export function setOwnerPassword(currentPassword: string, newPassword: string): void {
  if (!verifyOwnerPassword(currentPassword)) {
    throw new Error('Password saat ini salah');
  }
  if (!newPassword || newPassword.trim().length < 4) {
    throw new Error('Password baru minimal 4 karakter');
  }

  const clean = newPassword.trim();
  const hashed = hashPassword(clean);

  db.prepare(`
    UPDATE system_auth
    SET password = ?, updated_at = datetime('now','localtime')
    WHERE id = 1
  `).run(hashed);

  // Sync to app_users admin as well
  db.prepare(`
    UPDATE app_users
    SET password = ?
    WHERE username = 'admin'
  `).run(hashed);

  db.prepare(`
    INSERT INTO audit_log(aksi, tabel, record_id, keterangan)
    VALUES (?, ?, ?, ?)
  `).run('update_password', 'system_auth', '1', 'Ubah Password Owner Universal (Hashed)');
}

// ---------------------------------------------------------------------------
// 3. Rate Limiting for Login
// ---------------------------------------------------------------------------

interface RateLimitRecord {
  attempts: number;
  blockedUntil: number; // timestamp ms
}

const loginAttempts = new Map<string, RateLimitRecord>();

/**
 * Cek apakah identifier (IP/username) sedang diblokir karena terlalu banyak percobaan salah
 */
export function checkLoginRateLimit(identifier: string): { allowed: boolean; waitMinutes?: number } {
  const now = Date.now();
  const record = loginAttempts.get(identifier);
  if (!record) return { allowed: true };

  if (record.blockedUntil > now) {
    const waitMinutes = Math.ceil((record.blockedUntil - now) / 60000);
    return { allowed: false, waitMinutes };
  }

  // Jika masa blokir sudah berakhir, hapus record
  if (record.blockedUntil > 0 && record.blockedUntil <= now) {
    loginAttempts.delete(identifier);
    return { allowed: true };
  }

  return { allowed: true };
}

/**
 * Catat percobaan login yang gagal. Maksimal 5 kali salah sebelum diblokir 15 menit.
 */
export function recordFailedLogin(identifier: string): { blocked: boolean; attemptsLeft: number } {
  const now = Date.now();
  const record = loginAttempts.get(identifier) || { attempts: 0, blockedUntil: 0 };
  record.attempts += 1;

  if (record.attempts >= 5) {
    record.blockedUntil = now + 15 * 60 * 1000; // 15 menit
    loginAttempts.set(identifier, record);
    return { blocked: true, attemptsLeft: 0 };
  }

  loginAttempts.set(identifier, record);
  return { blocked: false, attemptsLeft: Math.max(0, 5 - record.attempts) };
}

/**
 * Reset catatan percobaan setelah login berhasil
 */
export function resetLoginRateLimit(identifier: string): void {
  loginAttempts.delete(identifier);
}

// ---------------------------------------------------------------------------
// 4. Authenticate User & Session
// ---------------------------------------------------------------------------

/**
 * Autentikasi Login Pengguna (Admin / Kasir) dengan Hashed Password & Auto-Upgrade
 */
export function authenticateUser(username: string, password: string): { user: AuthUser; token: string } {
  const u = (username || '').trim().toLowerCase();
  const p = (password || '').trim();

  if (!u || !p) {
    throw new Error('Username dan password wajib diisi');
  }

  // Khusus admin, sinkronkan juga dengan password di system_auth
  if (u === 'admin') {
    const ownerAuth = db.prepare(`SELECT password FROM system_auth WHERE id = 1`).get() as { password: string } | undefined;
    const expected = ownerAuth?.password || 'oriental2026';
    
    const { valid, needsUpgrade } = verifyPasswordHash(p, expected);
    if (!valid) {
      throw new Error('Password Administrator / Owner salah');
    }

    const adminUser = db.prepare(`SELECT id, username, nama, role, aktif FROM app_users WHERE username = 'admin'`).get() as any;
    if (!adminUser || adminUser.aktif !== 1) {
      throw new Error('Akun Administrator nonaktif');
    }

    // Auto-upgrade ke hash scrypt jika masih plaintext
    if (needsUpgrade) {
      const hashed = hashPassword(p);
      db.prepare(`UPDATE system_auth SET password = ?, updated_at = datetime('now','localtime') WHERE id = 1`).run(hashed);
      db.prepare(`UPDATE app_users SET password = ? WHERE id = ?`).run(hashed, adminUser.id);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 hari

    db.prepare(`
      INSERT INTO app_sessions (token, user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(token, adminUser.id, expiresAt);

    db.prepare(`UPDATE app_users SET last_login = datetime('now','localtime') WHERE id = ?`).run(adminUser.id);

    return {
      user: {
        id: adminUser.id,
        username: adminUser.username,
        nama: adminUser.nama,
        role: adminUser.role,
      },
      token,
    };
  }

  // Pengguna biasa / kasir
  const user = db.prepare(`
    SELECT id, username, password, nama, role, aktif
    FROM app_users
    WHERE LOWER(username) = ?
  `).get(u) as any;

  if (!user) {
    throw new Error('Username tidak ditemukan');
  }

  if (user.aktif !== 1) {
    throw new Error('Akun sedang dinonaktifkan. Hubungi Administrator.');
  }

  const { valid, needsUpgrade } = verifyPasswordHash(p, user.password);
  if (!valid) {
    throw new Error('Password salah');
  }

  // Auto-upgrade ke hash scrypt jika masih plaintext
  if (needsUpgrade) {
    const hashed = hashPassword(p);
    db.prepare(`UPDATE app_users SET password = ? WHERE id = ?`).run(hashed, user.id);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 hari

  db.prepare(`
    INSERT INTO app_sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(token, user.id, expiresAt);

  db.prepare(`UPDATE app_users SET last_login = datetime('now','localtime') WHERE id = ?`).run(user.id);

  return {
    user: {
      id: user.id,
      username: user.username,
      nama: user.nama,
      role: user.role,
    },
    token,
  };
}

/**
 * Validasi Session Token
 */
export function validateSession(token: string | null | undefined): AuthUser | null {
  if (!token) return null;

  const session = db.prepare(`
    SELECT s.token, s.expires_at, u.id, u.username, u.nama, u.role, u.aktif
    FROM app_sessions s
    JOIN app_users u ON s.user_id = u.id
    WHERE s.token = ?
  `).get(token) as any;

  if (!session) return null;
  if (session.aktif !== 1) return null;

  // Cek apakah expired
  const now = new Date().toISOString();
  if (session.expires_at < now) {
    db.prepare(`DELETE FROM app_sessions WHERE token = ?`).run(token);
    return null;
  }

  return {
    id: session.id,
    username: session.username,
    nama: session.nama,
    role: session.role,
  };
}

/**
 * Logout User
 */
export function logoutUser(token: string | null | undefined): void {
  if (!token) return;
  db.prepare(`DELETE FROM app_sessions WHERE token = ?`).run(token);
}

// ---------------------------------------------------------------------------
// 5. API Auth Guard Helper (requireAuth)
// ---------------------------------------------------------------------------

export type RequireAuthResult = { user: AuthUser } | { errorResponse: NextResponse };

/**
 * Helper untuk Route Handlers (/api/...)
 * Memverifikasi cookie crm_session atau header Authorization: Bearer <token>.
 * Menolak dengan HTTP 401 jika unauthenticated, atau 403 jika role tidak mencukupi.
 */
export function requireAuth(
  request: NextRequest,
  options?: { role?: 'admin' | 'staff' }
): RequireAuthResult {
  let token = request.cookies.get('crm_session')?.value;
  if (!token) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Akses ditolak: Anda belum login atau sesi telah berakhir', authenticated: false },
        { status: 401 }
      ),
    };
  }

  const user = validateSession(token);
  if (!user) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Akses ditolak: Sesi tidak valid atau telah kedaluwarsa', authenticated: false },
        { status: 401 }
      ),
    };
  }

  if (options?.role && user.role !== options.role) {
    return {
      errorResponse: NextResponse.json(
        { error: `Akses terlarang: Fitur ini hanya dapat diakses oleh ${options.role}`, authenticated: true },
        { status: 403 }
      ),
    };
  }

  return { user };
}
