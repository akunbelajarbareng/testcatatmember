/**
 * POST /api/auth/login — Autentikasi Pengguna & Buat Session Cookie (dengan Proteksi Brute-Force)
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateUser,
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginRateLimit,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = body.username || '';
    const password = body.password || '';

    // Dapatkan identifier IP / client
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : (request.headers.get('x-real-ip') || '127.0.0.1');
    const rateLimitKey = `${ip}:${username.trim().toLowerCase()}`;

    // 1. Cek Rate Limit
    const rateLimit = checkLoginRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Terlalu banyak percobaan login gagal. Demi keamanan, silakan tunggu ${rateLimit.waitMinutes || 15} menit sebelum mencoba kembali.`,
        },
        { status: 429 }
      );
    }

    // 2. Coba Autentikasi
    try {
      const { user, token } = await authenticateUser(username, password);

      // Login sukses: reset penghitung kegagalan
      resetLoginRateLimit(rateLimitKey);

      const res = NextResponse.json({
        success: true,
        user,
        message: `Selamat datang, ${user.nama}`,
      });

      // Tentukan apakah request menggunakan HTTPS
      const isHttps =
        request.nextUrl.protocol === 'https:' ||
        request.headers.get('x-forwarded-proto') === 'https';

      // Set HTTP-only session cookie (berlaku 7 hari)
      // Catatan: Hanya pasang flag secure jika benar-benar HTTPS agar tidak ditolak browser saat diakses via HTTP VPS.
      res.cookies.set('crm_session', token, {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7 hari
      });

      return res;
    } catch (authErr) {
      const status = recordFailedLogin(rateLimitKey);
      const msg = authErr instanceof Error ? authErr.message : 'Gagal login';
      const warning = status.blocked
        ? ' Akun/IP diblokir sementara selama 15 menit.'
        : status.attemptsLeft <= 2
        ? ` (Tersisa ${status.attemptsLeft} percobaan lagi sebelum diblokir)`
        : '';

      return NextResponse.json(
        { success: false, error: `${msg}.${warning}` },
        { status: 401 }
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal memproses permintaan login';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

