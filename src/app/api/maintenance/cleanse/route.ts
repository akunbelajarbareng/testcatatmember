/**
 * GET  /api/maintenance/cleanse — Preview data cleansing (Admin Only)
 * POST /api/maintenance/cleanse — Eksekusi pembersihan master data (Admin Only + Verifikasi Password Owner)
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { cleanseMasterData } from '@/lib/identity-manager';
import { requireAuth, verifyOwnerPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // Wajib role Admin
  const auth = requireAuth(request, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const totalIdentities = (db.prepare(`SELECT count(*) as c FROM identities`).get() as { c: number }).c;
    const totalOutlets = (db.prepare(`SELECT count(*) as c FROM outlets`).get() as { c: number }).c;
    const totalAliases = (db.prepare(`SELECT count(*) as c FROM pos_aliases`).get() as { c: number }).c;
    const totalInvoices = (db.prepare(`SELECT count(*) as c FROM invoices`).get() as { c: number }).c;
    const mappedInvoices = (db.prepare(`SELECT count(*) as c FROM invoices WHERE outlet_id IS NOT NULL`).get() as { c: number }).c;

    const pakCatur = db.prepare(`SELECT * FROM identities WHERE id = '102-260901-01'`).get();
    const pakCaturOutlets = db.prepare(`SELECT count(*) as c FROM outlets WHERE identity_id = '102-260901-01'`).get() as { c: number };
    const pakCaturInvoices = db.prepare(`
      SELECT count(*) as c FROM invoices i JOIN outlets o ON o.id = i.outlet_id WHERE o.identity_id = '102-260901-01'
    `).get() as { c: number };

    return NextResponse.json({
      totalIdentities,
      totalOutlets,
      totalAliases,
      totalInvoices,
      mappedInvoices,
      pakCaturFound: !!pakCatur,
      pakCaturOutlets: pakCaturOutlets.c,
      pakCaturInvoices: pakCaturInvoices.c,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // 1. Wajib role Admin
  const auth = requireAuth(request, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const ownerPassword = body.owner_password;

    // 2. Proteksi Krusial: Wajib Sertakan Password Owner yang Sah
    if (!ownerPassword || !verifyOwnerPassword(ownerPassword)) {
      return NextResponse.json(
        { error: 'Akses ditolak: Password Owner salah atau belum disertakan. Tindakan destruktif dibatalkan.' },
        { status: 403 }
      );
    }

    const keepPakCatur = body.keep_pak_catur !== false; // default true
    const specificKeepIds = Array.isArray(body.specific_keep_ids) ? body.specific_keep_ids : undefined;

    const result = cleanseMasterData({
      keepPakCatur,
      specificKeepIds,
    });

    return NextResponse.json({
      success: true,
      message: 'Master data berhasil dibersihkan! Transaksi invoice tetap aman.',
      result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

