import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Bypass static files, images, favicon, and login API
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth/login') ||
    pathname === '/favicon.ico' ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.webp')
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('crm_session')?.value;
  const isLoginPage = pathname === '/login';

  // 2. Jika belum login dan bukan di halaman login
  if (!sessionCookie && !isLoginPage) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Sesi login telah berakhir atau belum terautentikasi', authenticated: false },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 3. Jika sudah login tapi mencoba akses halaman /login
  if (sessionCookie && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
