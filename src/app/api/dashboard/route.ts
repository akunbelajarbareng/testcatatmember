/**
 * GET /api/dashboard
 * Summary stats for dashboard home with flexible period filtering:
 * - Bulanan (monthly)
 * - Tahunan (yearly)
 * - Custom Date Range (custom: start_date, end_date)
 * - Semua Periode (all)
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BULAN_NAMES: Record<string, string> = {
  '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
  '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember',
};

function formatBulanLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-');
  return `${BULAN_NAMES[m] || m} ${y}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const periodType = (searchParams.get('period') || 'all').toLowerCase();
    const month = searchParams.get('month') || '';
    const year = searchParams.get('year') || '';
    const startDate = searchParams.get('start_date') || '';
    const endDate = searchParams.get('end_date') || '';

    // 1. Available Months & Years in DB
    const distinctMonths = db.prepare(`
      SELECT DISTINCT substr(tanggal, 1, 7) AS m
      FROM invoices
      WHERE tanggal IS NOT NULL AND length(tanggal) >= 7
      ORDER BY m DESC
    `).all() as { m: string }[];

    const availableMonths = distinctMonths.map(row => ({
      value: row.m,
      label: formatBulanLabel(row.m),
    }));

    const distinctYears = Array.from(new Set(distinctMonths.map(row => row.m.slice(0, 4))));

    // 2. Determine Date Filter Condition & Label
    let dateCondition = '';
    const dateParams: string[] = [];
    let periodLabel = 'Semua Periode (All-Time)';
    let activeStartDate = '';
    let activeEndDate = '';

    if (periodType === 'monthly' && month) {
      const [y, m] = month.split('-');
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      activeStartDate = `${month}-01`;
      activeEndDate = `${month}-${String(lastDay).padStart(2, '0')}`;
      dateCondition = 'AND inv.tanggal >= ? AND inv.tanggal <= ?';
      dateParams.push(activeStartDate, activeEndDate);
      periodLabel = `Bulan ${formatBulanLabel(month)}`;
    } else if (periodType === 'yearly' && year) {
      activeStartDate = `${year}-01-01`;
      activeEndDate = `${year}-12-31`;
      dateCondition = 'AND inv.tanggal >= ? AND inv.tanggal <= ?';
      dateParams.push(activeStartDate, activeEndDate);
      periodLabel = `Tahun ${year}`;
    } else if (periodType === 'custom' && startDate && endDate) {
      activeStartDate = startDate;
      activeEndDate = endDate;
      dateCondition = 'AND inv.tanggal >= ? AND inv.tanggal <= ?';
      dateParams.push(startDate, endDate);
      periodLabel = `${startDate} s.d. ${endDate}`;
    } else {
      periodLabel = 'Semua Periode';
    }

    // 3. Filtered Totals (Transaksi Penjualan, Poin, Kupon, Count Invoices)
    const totalsQuery = `
      SELECT
        COALESCE(SUM(inv.poin), 0)   AS total_poin,
        COALESCE(SUM(inv.kupon), 0)  AS total_kupon,
        COALESCE(SUM(inv.jumlah), 0) AS total_transaksi,
        COUNT(inv.id)                AS total_invoices
      FROM invoices inv
      WHERE inv.is_excluded = 0 AND inv.outlet_id IS NOT NULL
        ${dateCondition}
    `;
    const totals = db.prepare(totalsQuery).get(...dateParams) as {
      total_poin: number;
      total_kupon: number;
      total_transaksi: number;
      total_invoices: number;
    };

    // 3b. Filtered Waste Purchasing Totals (Pembelian Limbah UCO)
    let wasteDateCondition = '';
    const wasteDateParams: string[] = [];
    if (activeStartDate && activeEndDate) {
      wasteDateCondition = 'AND w.tanggal >= ? AND w.tanggal <= ?';
      wasteDateParams.push(activeStartDate, activeEndDate);
    }

    const wasteTotalsQuery = `
      SELECT
        COUNT(w.id)                      AS total_waste_trx,
        COALESCE(SUM(w.berat_kg), 0)     AS total_waste_kg,
        COALESCE(SUM(w.total_rupiah), 0) AS total_waste_rupiah,
        COALESCE(SUM(w.poin), 0)         AS total_waste_poin
      FROM waste_purchases w
      WHERE 1=1
        ${wasteDateCondition}
    `;
    const wasteTotals = db.prepare(wasteTotalsQuery).get(...wasteDateParams) as {
      total_waste_trx: number;
      total_waste_kg: number;
      total_waste_rupiah: number;
      total_waste_poin: number;
    };

    // 4. Breakdown per Lini Bisnis (Retail, UKM, Grosir)
    const liniBisnisQuery = `
      SELECT
        o.tipe,
        COUNT(inv.id)                AS trx_count,
        COALESCE(SUM(inv.jumlah), 0) AS total_transaksi,
        COALESCE(SUM(inv.poin), 0)   AS total_poin,
        COALESCE(SUM(inv.kupon), 0)  AS total_kupon
      FROM outlets o
      JOIN invoices inv ON inv.outlet_id = o.id AND inv.is_excluded = 0
      WHERE 1=1
        ${dateCondition}
      GROUP BY o.tipe
      ORDER BY total_transaksi DESC
    `;
    const byLiniBisnis = db.prepare(liniBisnisQuery).all(...dateParams);

    // 5. Top 5 Member dalam Periode ini
    const topMembersQuery = `
      SELECT
        iden.id,
        iden.nama_pemilik,
        iden.kota,
        COUNT(inv.id)                AS trx_count,
        COALESCE(SUM(inv.jumlah), 0) AS total_transaksi,
        COALESCE(SUM(inv.poin), 0)   AS total_poin,
        COALESCE(SUM(inv.kupon), 0)  AS total_kupon
      FROM identities iden
      JOIN outlets o ON o.identity_id = iden.id
      JOIN invoices inv ON inv.outlet_id = o.id AND inv.is_excluded = 0
      WHERE 1=1
        ${dateCondition}
      GROUP BY iden.id
      ORDER BY total_poin DESC, total_transaksi DESC
      LIMIT 5
    `;
    const topMembers = db.prepare(topMembersQuery).all(...dateParams);

    // 6. Tren Bulanan
    const trendQuery = `
      SELECT
        substr(inv.tanggal, 1, 7)    AS bulan,
        COUNT(inv.id)                AS trx_count,
        COALESCE(SUM(inv.jumlah), 0) AS total_transaksi,
        COALESCE(SUM(inv.poin), 0)   AS total_poin,
        COALESCE(SUM(inv.kupon), 0)  AS total_kupon
      FROM invoices inv
      WHERE inv.is_excluded = 0 AND inv.outlet_id IS NOT NULL
        ${dateCondition}
      GROUP BY substr(inv.tanggal, 1, 7)
      ORDER BY bulan ASC
    `;
    const trendRows = db.prepare(trendQuery).all(...dateParams) as {
      bulan: string;
      trx_count: number;
      total_transaksi: number;
      total_poin: number;
      total_kupon: number;
    }[];

    const monthlyTrend = trendRows.map(r => ({
      ...r,
      label: formatBulanLabel(r.bulan),
    }));

    // 7. Global System Stats
    const totalIdentities = (db.prepare(`SELECT COUNT(*) as c FROM identities WHERE status = 'aktif' AND id NOT LIKE '999-%'`).get() as { c: number }).c;
    const totalOutlets    = (db.prepare(`SELECT COUNT(*) as c FROM outlets WHERE aktif = 1 AND identity_id NOT LIKE '999-%'`).get() as { c: number }).c;
    const totalAliases    = (db.prepare(`SELECT COUNT(*) as c FROM pos_aliases`).get() as { c: number }).c;
    const totalRawInvoices = (db.prepare(`SELECT COUNT(*) as c FROM invoices`).get() as { c: number }).c;
    const pendingApprovals = (db.prepare(`SELECT COUNT(*) as c FROM approvals WHERE status = 'menunggu'`).get() as { c: number }).c;
    const belumPetakan = (db.prepare(`
      SELECT COUNT(DISTINCT nama_pos) as c FROM invoices WHERE outlet_id IS NULL AND nama_pos != 'CASH'
    `).get() as { c: number }).c;
    const lastImport = db.prepare(`SELECT * FROM import_batches ORDER BY created_at DESC LIMIT 1`).get();
    const statementStats = db.prepare(`
      SELECT status, COUNT(*) as jumlah FROM statements GROUP BY status
    `).all() as { status: string; jumlah: number }[];

    return NextResponse.json({
      periodInfo: {
        type: periodType,
        label: periodLabel,
        month,
        year,
        startDate: activeStartDate,
        endDate: activeEndDate,
      },
      availableMonths,
      availableYears: distinctYears,
      totals,
      wasteTotals,
      byLiniBisnis,
      topMembers,
      monthlyTrend,
      globalStats: {
        totalIdentities,
        totalOutlets,
        totalAliases,
        totalRawInvoices,
        pendingApprovals,
        belumPetakan,
        lastImport,
        statementStats,
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
