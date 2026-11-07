"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Users, Store, GitMerge, FileText, AlertTriangle,
  RefreshCw, ChevronRight, Award, Ticket, Banknote, Calendar,
  Filter, Droplets
} from "lucide-react";

interface LiniBisnisStat {
  tipe: string;
  trx_count: number;
  total_transaksi: number;
  total_poin: number;
  total_kupon: number;
}

interface TopMember {
  id: string;
  nama_pemilik: string;
  kota: string;
  trx_count: number;
  total_transaksi: number;
  total_poin: number;
  total_kupon: number;
}

interface MonthlyTrendItem {
  bulan: string;
  label: string;
  trx_count: number;
  total_transaksi: number;
  total_poin: number;
  total_kupon: number;
}

interface DashboardData {
  periodInfo: {
    type: string;
    label: string;
    month: string;
    year: string;
    startDate: string;
    endDate: string;
  };
  availableMonths: { value: string; label: string }[];
  availableYears: string[];
  totals: {
    total_poin: number;
    total_kupon: number;
    total_transaksi: number;
    total_invoices: number;
  };
  wasteTotals?: {
    total_waste_trx: number;
    total_waste_kg: number;
    total_waste_rupiah: number;
    total_waste_poin: number;
  };
  byLiniBisnis: LiniBisnisStat[];
  topMembers: TopMember[];
  monthlyTrend: MonthlyTrendItem[];
  globalStats: {
    totalIdentities: number;
    totalOutlets: number;
    totalAliases: number;
    totalRawInvoices: number;
    pendingApprovals: number;
    belumPetakan: number;
    belumPetakanInvoices?: number;
    lastImport: { filename: string; created_at: string; bulan: string; tipe: string } | null;
    statementStats: { status: string; jumlah: number }[];
  };
}

function fmt(n: number) {
  return (n || 0).toLocaleString("id-ID");
}

function fmtRp(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)} M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} Jt`;
  return `Rp ${fmt(n)}`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Period Filter States
  const [periodType, setPeriodType] = useState<"all" | "monthly" | "yearly" | "custom">("all");
  const [selectedMonth, setSelectedMonth] = useState("2026-09");
  const [selectedYear, setSelectedYear] = useState("2026");
  const [customStartDate, setCustomStartDate] = useState("2026-09-01");
  const [customEndDate, setCustomEndDate] = useState("2026-09-30");

  const loadData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ period: periodType });
    if (periodType === "monthly") params.set("month", selectedMonth);
    if (periodType === "yearly") params.set("year", selectedYear);
    if (periodType === "custom") {
      params.set("start_date", customStartDate);
      params.set("end_date", customEndDate);
    }

    try {
      const res = await fetch(`/api/dashboard?${params}`);
      const json = await res.json();
      setData(json);

      // Auto-set default month/year if not set
      if (json?.availableMonths?.length && !selectedMonth) {
        setSelectedMonth(json.availableMonths[0].value);
      }
      if (json?.availableYears?.length && !selectedYear) {
        setSelectedYear(json.availableYears[0]);
      }
    } catch (err) {
      console.error("Gagal memuat dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, [periodType, selectedMonth, selectedYear, customStartDate, customEndDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && !data) {
    return (
      <div style={{ padding: "60px 32px", textAlign: "center", color: "var(--text-muted)" }}>
        <RefreshCw size={28} style={{ animation: "spin .7s linear infinite", margin: "0 auto 16px" }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--navy-800)" }}>Memuat ringkasan dashboard...</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>Mengambil data dari Firebase Firestore</div>
      </div>
    );
  }

  const statDraft = data?.globalStats?.statementStats?.find((s) => s.status === "draft")?.jumlah ?? 0;
  const statFinal = data?.globalStats?.statementStats?.find((s) => s.status === "final")?.jumlah ?? 0;
  const statRevisi = data?.globalStats?.statementStats?.find((s) => s.status === "perlu_revisi")?.jumlah ?? 0;
  const totalStatements = statDraft + statFinal + statRevisi;

  return (
    <div className="fade-in" style={{ padding: "28px 32px", maxWidth: 1160 }}>
      {/* Top Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Ringkasan analitik Oriental CRM — Multi-Lini Bisnis &amp; Reward Poin</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href="/identities"
            className="btn btn-outline btn-sm"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <Users size={14} /> Daftar Member
          </Link>
          <button
            onClick={loadData}
            className="btn btn-outline btn-sm"
            style={{ gap: 6 }}
            disabled={loading}
          >
            <RefreshCw size={14} style={loading ? { animation: "spin .7s linear infinite" } : {}} />
            Refresh
          </button>
        </div>
      </div>

      {/* Period Filter Card */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: 24, borderLeft: "4px solid var(--navy-600)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          {/* Mode Switcher Tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginRight: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <Filter size={13} /> Filter Periode:
            </span>
            <button
              onClick={() => setPeriodType("all")}
              className={`btn btn-sm ${periodType === "all" ? "btn-primary" : "btn-outline"}`}
              style={{ fontSize: 12, padding: "5px 12px" }}
            >
              Semua Periode
            </button>
            <button
              onClick={() => setPeriodType("monthly")}
              className={`btn btn-sm ${periodType === "monthly" ? "btn-primary" : "btn-outline"}`}
              style={{ fontSize: 12, padding: "5px 12px" }}
            >
              Bulanan
            </button>
            <button
              onClick={() => setPeriodType("yearly")}
              className={`btn btn-sm ${periodType === "yearly" ? "btn-primary" : "btn-outline"}`}
              style={{ fontSize: 12, padding: "5px 12px" }}
            >
              Tahunan
            </button>
            <button
              onClick={() => setPeriodType("custom")}
              className={`btn btn-sm ${periodType === "custom" ? "btn-primary" : "btn-outline"}`}
              style={{ fontSize: 12, padding: "5px 12px" }}
            >
              Rentang Kustom
            </button>
          </div>

          {/* Dynamic Filter Inputs */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {periodType === "monthly" && (
              <select
                className="input select"
                style={{ height: 34, fontSize: 12, minWidth: 160 }}
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {data?.availableMonths?.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}

            {periodType === "yearly" && (
              <select
                className="input select"
                style={{ height: 34, fontSize: 12, minWidth: 120 }}
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                {data?.availableYears?.map((y) => (
                  <option key={y} value={y}>
                    Tahun {y}
                  </option>
                ))}
              </select>
            )}

            {periodType === "custom" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="date"
                  className="input"
                  style={{ height: 34, fontSize: 12, padding: "2px 8px" }}
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                />
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>s/d</span>
                <input
                  type="date"
                  className="input"
                  style={{ height: 34, fontSize: 12, padding: "2px 8px" }}
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                />
              </div>
            )}

            <div className="badge badge-menunggu" style={{ fontSize: 11, padding: "4px 10px" }}>
              {data?.periodInfo?.label || "Semua Periode"}
            </div>
          </div>
        </div>
      </div>

      {/* Alert: Pending Approvals */}
      {(data?.globalStats?.pendingApprovals ?? 0) > 0 && (
        <Link href="/approvals" style={{ textDecoration: "none" }}>
          <div className="alert alert-warn" style={{ marginBottom: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>
                <strong>{data?.globalStats?.pendingApprovals} item</strong> memerlukan persetujuan Owner di antrean Approval.
              </span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, textDecoration: "underline" }}>Tinjau Sekarang →</span>
          </div>
        </Link>
      )}

      {/* Alert: Belum Dipetakan */}
      {(data?.globalStats?.belumPetakan ?? 0) > 0 && (
        <Link href="/aliases?belum=1" style={{ textDecoration: "none" }}>
          <div className="alert alert-info" style={{ marginBottom: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <GitMerge size={16} style={{ flexShrink: 0 }} />
              <span>
                <strong>{data?.globalStats?.belumPetakan} nama POS</strong> ({fmt(data?.globalStats?.belumPetakanInvoices || 0)} transaksi kasir) belum dipetakan ke lini bisnis outlet mana pun.
              </span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, textDecoration: "underline" }}>Petakan Sekarang →</span>
          </div>
        </Link>
      )}

      {/* Primary KPI Stats Cards (Dynamically Filtered: Penjualan vs Pembelian Waste) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        {/* 1. Total Transaksi Penjualan (Sales POS) */}
        <div className="card card-hover" style={{ padding: "20px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: "var(--navy-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Banknote size={22} style={{ color: "var(--navy-600)" }} />
            </div>
            <span className="badge badge-retail" style={{ fontSize: 10 }}>
              {data?.totals?.total_invoices ?? 0} Invoices POS
            </span>
          </div>
          <div className="stat-value" style={{ color: "var(--navy-800)" }}>
            {loading ? "—" : fmtRp(data?.totals?.total_transaksi ?? 0)}
          </div>
          <div className="stat-label">Total Transaksi Penjualan</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
            Omzet Belanja Member ({data?.periodInfo?.label || "Semua Periode"})
          </div>
        </div>

        {/* 2. Total Pembelian Waste (UCO - Minyak Jelantah) */}
        <Link href="/waste-purchases" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card card-hover" style={{ padding: "20px 22px", height: "100%", borderLeft: "4px solid #10b981" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: "rgba(16, 185, 129, 0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Droplets size={22} style={{ color: "#10b981" }} />
              </div>
              <span className="badge badge-success" style={{ fontSize: 10, background: "rgba(16, 185, 129, 0.15)", color: "#065f46" }}>
                {data?.wasteTotals?.total_waste_trx ?? 0} Trx UCO
              </span>
            </div>
            <div className="stat-value" style={{ color: "#065f46" }}>
              {loading ? "—" : fmtRp(data?.wasteTotals?.total_waste_rupiah ?? 0)}
            </div>
            <div className="stat-label">Total Pembelian Waste (UCO)</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
              Volume: {(data?.wasteTotals?.total_waste_kg ?? 0).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Kg
            </div>
          </div>
        </Link>

        {/* 3. Total Poin */}
        <div className="card card-hover" style={{ padding: "20px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: "var(--gold-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Award size={22} style={{ color: "var(--gold-600)" }} />
            </div>
            <span className="badge badge-grosir" style={{ fontSize: 10 }}>Point Reward</span>
          </div>
          <div className="stat-value" style={{ color: "var(--navy-800)" }}>
            {loading ? "—" : fmt(data?.totals?.total_poin ?? 0)}
          </div>
          <div className="stat-label">Poin Belanja POS</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
            +{fmt(data?.wasteTotals?.total_waste_poin ?? 0)} Pt tambahan dari Waste
          </div>
        </div>

        {/* 4. Total Kupon */}
        <div className="card card-hover" style={{ padding: "20px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: "var(--success-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Ticket size={22} style={{ color: "var(--success-600)" }} />
            </div>
            <span className="badge badge-final" style={{ fontSize: 10 }}>Kupon Undian</span>
          </div>
          <div className="stat-value" style={{ color: "var(--navy-800)" }}>
            {loading ? "—" : fmt(data?.totals?.total_kupon ?? 0)}
          </div>
          <div className="stat-label">Kupon Belanja Fisik</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
            Setiap kelipatan Rp 150.000 belanja
          </div>
        </div>
      </div>

      {/* Breakdown per Lini Bisnis */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>
          Distribusi per Lini Bisnis ({data?.periodInfo?.label || "Semua Periode"})
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {["retail", "ukm", "grosir"].map((tipe) => {
            const stat = data?.byLiniBisnis?.find((b) => b.tipe === tipe) || {
              tipe,
              trx_count: 0,
              total_transaksi: 0,
              total_poin: 0,
              total_kupon: 0,
            };
            const rateLabel = tipe === "grosir" ? "Rp 200.000 / pt" : tipe === "retail" ? "Rp 100.000 / pt" : "Rp 50.000 / pt";

            return (
              <div key={tipe} className="card" style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span className={`badge badge-${tipe}`} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                    Lini {tipe}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{rateLabel}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>
                  {fmtRp(stat.total_transaksi)}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)" }}>
                  <span>{stat.trx_count} Transaksi</span>
                  <span><strong>{fmt(stat.total_poin)}</strong> Poin · <strong>{fmt(stat.total_kupon)}</strong> Kupon</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Middle Grid: Top 5 Members Leaderboard & Monthly Trend */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16, marginBottom: 28 }}>
        {/* Top Members */}
        <div className="card">
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
              Top Member Periode Ini
            </div>
            <Link href="/identities" className="btn btn-outline btn-sm" style={{ fontSize: 11, padding: "3px 8px" }}>
              Semua Member <ChevronRight size={12} />
            </Link>
          </div>
          <div className="table-wrap">
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Member</th>
                  <th className="col-num">Transaksi</th>
                  <th className="col-num">Poin</th>
                  <th className="col-num">Kupon</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topMembers?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>
                      Tidak ada transaksi pada periode yang dipilih
                    </td>
                  </tr>
                ) : (
                  data?.topMembers?.map((m, idx) => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 700, color: idx === 0 ? "var(--gold-600)" : "var(--text-muted)" }}>
                        {idx + 1}
                      </td>
                      <td>
                        <Link href={`/identities/${m.id}`} style={{ fontWeight: 600, color: "var(--navy-600)", textDecoration: "none" }}>
                          {m.nama_pemilik}
                        </Link>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>{m.id} · {m.kota || "WATAMPONE"}</div>
                      </td>
                      <td className="col-num" style={{ fontWeight: 500 }}>{fmtRp(m.total_transaksi)}</td>
                      <td className="col-num"><span className="badge badge-grosir" style={{ fontSize: 11 }}>{fmt(m.total_poin)}</span></td>
                      <td className="col-num"><span className="badge badge-final" style={{ fontSize: 11 }}>{fmt(m.total_kupon)}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Monthly Trend / History in this view */}
        <div className="card">
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
              Histori Transaksi Bulanan
            </div>
            <Calendar size={14} style={{ color: "var(--text-muted)" }} />
          </div>
          <div style={{ padding: "12px 16px" }}>
            {(data?.monthlyTrend?.length ?? 0) === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontSize: 12 }}>
                Tidak ada data histori bulanan
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data?.monthlyTrend?.map((t) => (
                  <div key={t.bulan} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--bg-page)", borderRadius: 6, border: "1px solid var(--border)" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.trx_count} invoice</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: "var(--navy-800)" }}>{fmtRp(t.total_transaksi)}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{fmt(t.total_poin)} pts · {fmt(t.total_kupon)} kpn</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Global System Stats Footer */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 12, textTransform: "uppercase", letterSpacing: ".06em" }}>
          Kesehatan &amp; Master Sistem (Global)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
          {[
            { icon: Users, label: "One Identity Terdaftar", value: data?.globalStats?.totalIdentities, href: "/identities", color: "var(--navy-600)" },
            { icon: Store, label: "Outlet Aktif", value: data?.globalStats?.totalOutlets, href: "/outlets", color: "var(--info-600)" },
            { icon: GitMerge, label: "Alias Kasir Terpetakan", value: data?.globalStats?.totalAliases, href: "/aliases", color: "var(--success-600)" },
            { icon: FileText, label: "Total Transaksi di DB", value: data?.globalStats?.totalRawInvoices, href: "/import", color: "var(--warning-600)" },
          ].map(({ icon: Icon, label, value, href, color }) => (
            <Link key={href} href={href} style={{ textDecoration: "none" }}>
              <div className="card card-hover" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "#f0f4fd", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={17} style={{ color }} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-.02em" }}>
                    {loading ? "—" : fmt(value ?? 0)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>{label}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Statement Status Bar */}
        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Status Statement Bulanan</div>
            <Link href="/statements" className="btn btn-outline btn-sm" style={{ fontSize: 11 }}>
              Buka Modul Statement <ChevronRight size={12} />
            </Link>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="badge badge-draft">Draft: {fmt(statDraft)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="badge badge-final">Final: {fmt(statFinal)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="badge badge-perlu_revisi">Perlu Revisi: {fmt(statRevisi)}</span>
            </div>
            <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>
              Total: <strong>{fmt(totalStatements)}</strong> statement tercatat
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
