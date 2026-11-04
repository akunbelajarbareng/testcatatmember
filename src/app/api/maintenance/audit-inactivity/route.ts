/**
 * GET  /api/maintenance/audit-inactivity — Preview audit inaktivitas (Admin Only)
 * POST /api/maintenance/audit-inactivity — Eksekusi audit inaktivitas otomatis (Admin Only)
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { auditInactivity } from '@/lib/identity-manager';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const row = db.prepare(`SELECT nilai FROM rules_config WHERE kunci = 'periode_tidak_aktif_bulan'`).get() as { nilai: number } | undefined;
    const thresholdMonths = row && row.nilai > 0 ? Number(row.nilai) : 3;

    const url = new URL(request.url);
    const asOfDateParam = url.searchParams.get('asOfDate');
    const now = asOfDateParam ? new Date(asOfDateParam) : new Date();
    const asOfDateStr = now.toISOString().slice(0, 10);

    const cutoffTarget = new Date(now.getFullYear(), now.getMonth() - thresholdMonths, now.getDate());
    const cutoffDate = cutoffTarget.toISOString().slice(0, 10);

    const activeOutlets = db.prepare(`
      SELECT id, identity_id, nama_outlet, created_at
      FROM outlets
      WHERE aktif = 1
    `).all() as { id: string; identity_id: string; nama_outlet: string; created_at: string }[];

    const dormantCandidates: { id: string; nama: string; lastActivity: string }[] = [];

    for (const o of activeOutlets) {
      const lastInv = db.prepare(`SELECT MAX(tanggal) as max_d FROM invoices WHERE outlet_id = ?`).get(o.id) as { max_d: string | null } | undefined;
      const lastWaste = db.prepare(`SELECT MAX(tanggal) as max_d FROM waste_purchases WHERE outlet_id = ?`).get(o.id) as { max_d: string | null } | undefined;
      const createdDate = o.created_at ? o.created_at.slice(0, 10) : '2026-09-01';

      const candidateDates = [lastInv?.max_d, lastWaste?.max_d, createdDate].filter((d): d is string => Boolean(d));
      candidateDates.sort().reverse();
      const lastActivity = candidateDates[0] || '2026-09-01';

      if (lastActivity < cutoffDate) {
        dormantCandidates.push({
          id: o.id,
          nama: o.nama_outlet,
          lastActivity,
        });
      }
    }

    const lastAudit = db.prepare(`
      SELECT * FROM audit_log
      WHERE aksi = 'auto_deactivate'
      ORDER BY created_at DESC LIMIT 1
    `).get();

    return NextResponse.json({
      thresholdMonths,
      cutoffDate,
      asOfDate: asOfDateStr,
      activeOutletsCount: activeOutlets.length,
      dormantCount: dormantCandidates.length,
      dormantCandidates,
      lastAudit,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const asOfDate = body.asOfDate as string | undefined;

    const result = auditInactivity(asOfDate);

    return NextResponse.json({
      success: true,
      message: `Audit inaktivitas selesai: ${result.deactivatedOutlets.length} outlet dan ${result.deactivatedIdentities.length} akun utama dinonaktifkan otomatis.`,
      result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
