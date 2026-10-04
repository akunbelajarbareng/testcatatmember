"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search, Store, ChevronRight } from "lucide-react";
import Pagination from "@/components/Pagination";

interface Outlet {
  id: string; nama_outlet: string; tipe: string; identity_id: string;
  nama_pemilik: string; aktif: number; aliases: string | null;
  total_transaksi: number; total_poin: number; total_kupon: number;
}
function fmt(n: number) { return n.toLocaleString("id-ID"); }
function fmtRp(n: number) { return `Rp ${fmt(n)}`; }

export default function OutletsPage() {
  const [items, setItems] = useState<Outlet[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/outlets?q=${encodeURIComponent(q)}`);
    const json = await res.json();
    setItems(json.outlets || []);
    setLoading(false);
  }, [q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q]);

  const pageSize = 10;
  const totalPages = Math.ceil(items.length / pageSize);
  const pagedItems = items.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="fade-in" style={{ padding: "28px 32px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Outlet</h1>
        <p className="page-subtitle">Semua unit usaha terdaftar per One Identity</p>
      </div>
      <div style={{ position: "relative", maxWidth: 400, marginBottom: 20 }}>
        <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="input" style={{ paddingLeft: 36 }} placeholder="Cari outlet atau member..." value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: "center" }}><div className="spinner" style={{ margin: "0 auto" }} /></div>
        ) : items.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center" }}>
            <Store size={40} style={{ color: "var(--text-muted)", margin: "0 auto 12px" }} />
            <div style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Belum ada outlet</div>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ whiteSpace: "nowrap", minWidth: 140 }}>ID Outlet</th>
                    <th>Nama Outlet</th>
                    <th>Tipe</th>
                    <th>One Identity</th>
                    <th>Aliases</th>
                    <th className="col-num">Total Transaksi</th>
                    <th className="col-num">Poin</th>
                    <th className="col-num">Kupon</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map(o => (
                    <tr key={o.id}>
                      <td style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "var(--navy-700)", whiteSpace: "nowrap" }}>
                        {o.id}
                      </td>
                      <td style={{ fontWeight: 500, fontSize: 13 }}>{o.nama_outlet}</td>
                      <td><span className={`badge badge-${o.tipe}`}>{o.tipe}</span></td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{o.nama_pemilik}</td>
                      <td style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o.aliases ? o.aliases.split(" || ").length + " alias" : "—"}
                      </td>
                      <td className="col-num" style={{ fontSize: 12 }}>{fmtRp(o.total_transaksi)}</td>
                      <td className="col-num" style={{ fontWeight: 600, color: "var(--gold-700)" }}>{fmt(o.total_poin)}</td>
                      <td className="col-num" style={{ fontWeight: 600, color: "var(--success-600)" }}>{fmt(o.total_kupon)}</td>
                      <td>
                        <Link href={`/identities/${o.identity_id}`} className="btn btn-outline btn-sm">
                          <ChevronRight size={13} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={items.length}
              pageSize={pageSize}
              itemLabel="outlet"
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
