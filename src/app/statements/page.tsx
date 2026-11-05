"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search, FileText, Download, RefreshCw } from "lucide-react";
import Pagination from "@/components/Pagination";

interface StatRow {
  identity_id: string;
  bulan: string;
  status: string;
  revisi: number;
  total_transaksi: number;
  total_poin: number;
  total_kupon: number;
  kumulatif_poin: number;
  kumulatif_kupon: number;
}

// We'll fetch identities list and let user pick a month
const BULAN_ID: Record<string, string> = {
  "01":"Jan","02":"Feb","03":"Mar","04":"Apr","05":"Mei","06":"Jun",
  "07":"Jul","08":"Agu","09":"Sep","10":"Okt","11":"Nov","12":"Des",
};

function fmt(n: number) { return (n || 0).toLocaleString("id-ID"); }
function fmtRp(n: number) {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)} Jt`;
  return `${fmt(n)}`;
}

export default function StatementsPage() {
  const [identities, setIdentities] = useState<{ id: string; nama_pemilik: string; kota: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [bulan, setBulan] = useState("2026-09");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/identities?q=${encodeURIComponent(q)}&page=${page}&limit=10`);
    const json = await res.json();
    setIdentities(json.identities || []);
    setTotal(json.total || 0);
    setLoading(false);
  }, [q, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q]);

  const totalPages = Math.ceil(total / 10);

  return (
    <div className="fade-in" style={{ padding: "28px 32px", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">Statement</h1>
          <p className="page-subtitle">Pratinjau dan cetak statement per member per bulan</p>
        </div>
        <Link
          href={`/print/batch?bulan=${bulan}`}
          target="_blank"
          className="btn btn-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}
        >
          <Download size={16} /> Download Semua Statement ({bulan})
        </Link>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 360 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="input" style={{ paddingLeft: 36 }} placeholder="Cari nama member..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>Periode:</label>
          <input
            type="month"
            className="input"
            value={bulan}
            onChange={e => setBulan(e.target.value)}
            style={{ width: 160 }}
            min="2026-09"
            max="2027-09"
          />
        </div>
        <button onClick={load} className="btn btn-outline btn-sm" disabled={loading} title="Refresh data">
          <RefreshCw size={14} style={loading ? { animation: "spin .7s linear infinite" } : {}} />
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden", width: "100%" }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: "center" }}><div className="spinner" style={{ margin: "0 auto" }} /></div>
        ) : identities.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)" }}>
            Belum ada member. Import master customer terlebih dahulu.
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ whiteSpace: "nowrap", minWidth: 150 }}>ID One Identity</th>
                    <th style={{ whiteSpace: "nowrap", minWidth: 200 }}>Nama Member</th>
                    <th style={{ whiteSpace: "nowrap", minWidth: 120 }}>Kota</th>
                    <th style={{ whiteSpace: "nowrap", minWidth: 100 }}>Periode</th>
                    <th style={{ textAlign: "right", whiteSpace: "nowrap" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {identities.map(item => (
                    <tr key={item.id}>
                      <td style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "var(--navy-700)", whiteSpace: "nowrap" }}>
                        {item.id}
                      </td>
                      <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{item.nama_pemilik}</td>
                      <td style={{ color: "var(--text-secondary)", fontSize: 13, whiteSpace: "nowrap" }}>{item.kota || "—"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className="badge badge-draft">
                          {BULAN_ID[bulan.split("-")[1]]} {bulan.split("-")[0]}
                        </span>
                      </td>
                      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <Link href={`/statements/${item.id}/${bulan}`} className="btn btn-gold btn-sm" style={{ whiteSpace: "nowrap" }}>
                            <FileText size={13} /> Pratinjau &amp; Cetak
                          </Link>
                          <Link href={`/identities/${item.id}`} className="btn btn-outline btn-sm" style={{ whiteSpace: "nowrap" }}>
                            Detail
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={10}
              itemLabel="member"
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
