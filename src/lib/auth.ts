/**
 * auth.ts — Universal Authentication, Users & Session System (Firebase Firestore Edition)
 * Menggunakan Firebase Firestore sebagai penyimpanan akun (app_users), sesi (app_sessions),
 * dan password universal Owner (system_auth).
 * 
 * Dilengkapi dengan in-memory cache berkecepatan tinggi untuk menekan latensi dan kuota baca.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  hashPassword,
  verifyPasswordHash,
  authenticateUserFirestore,
  validateSessionFirestore,
  logoutUserFirestore,
  verifyOwnerPasswordFirestore,
  setOwnerPasswordFirestore,
  type AuthUser,
} from './firestore-service';

export type { AuthUser };
export { hashPassword, verifyPasswordHash };

// ---------------------------------------------------------------------------
// 1. Rate Limiting for Login (Brute-Force Protection)
// ---------------------------------------------------------------------------
interface RateLimitRecord {
  attempts: number;
  blockedUntil: number; // timestamp ms
}

const loginAttempts = new Map<string, RateLimitRecord>();

export function checkLoginRateLimit(identifier: string): { allowed: boolean; waitMinutes?: number } {
  const now = Date.now();
  const record = loginAttempts.get(identifier);
  if (!record) return { allowed: true };

  if (record.blockedUntil > now) {
    const waitMinutes = Math.ceil((record.blockedUntil - now) / 60000);
    return { allowed: false, waitMinutes };
  }

  if (record.blockedUntil > 0 && record.blockedUntil <= now) {
    loginAttempts.delete(identifier);
    return { allowed: true };
  }

  return { allowed: true };
}

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

export function resetLoginRateLimit(identifier: string): void {
  loginAttempts.delete(identifier);
}

// ---------------------------------------------------------------------------
// 2. Owner Password Operations (Firestore)
// ---------------------------------------------------------------------------
export async function verifyOwnerPassword(password: string): Promise<boolean> {
  return verifyOwnerPasswordFirestore(password);
}

export async function setOwnerPassword(currentPassword: string, newPassword: string): Promise<void> {
  return setOwnerPasswordFirestore(currentPassword, newPassword);
}

// ---------------------------------------------------------------------------
// 3. User Authentication & Session (Firestore)
// ---------------------------------------------------------------------------
export async function authenticateUser(
  username: string,
  password: string
): Promise<{ user: AuthUser; token: string }> {
  return authenticateUserFirestore(username, password);
}

export async function validateSession(token: string | null | undefined): Promise<AuthUser | null> {
  return validateSessionFirestore(token);
}

export async function logoutUser(token: string | null | undefined): Promise<void> {
  return logoutUserFirestore(token);
}

// ---------------------------------------------------------------------------
// 4. API Auth Guard Helper (requireAuth)
// ---------------------------------------------------------------------------
export type RequireAuthResult = { user: AuthUser } | { errorResponse: NextResponse };

export async function requireAuth(
  request: NextRequest,
  options?: { role?: 'admin' | 'staff' }
): Promise<RequireAuthResult> {
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

  const user = await validateSessionFirestore(token);
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

export default requireAuth;
