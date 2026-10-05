"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search, Store, ChevronRight, Power, PowerOff, CheckCircle2, AlertTriangle, X } from "lucide-react";
import Pagination from "@/components/Pagination";

interface Outlet {
  id: string;
  nama_outlet: string;
  tipe: string;
  identity_id: string;
  nama_pemilik: string;
  aktif: number;
  aliases: string | null;
  nonaktif_tipe?: "manual" | "otomatis" | null;
  nonaktif_alasan?: string | null;
  nonaktif_tanggal?: string | null;
  nonaktif_oleh?: string | null;
  total_transaksi: number;
  total_poin: number;
  total_kupon: number;
}

function fmt(n: number) { return n.toLocaleString("id-ID"); }
function fmtRp(n: number) { return `Rp ${fmt(n)}`; }

export default function OutletsPage() {
  const [items, setItems] = useState<Outlet[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "aktif" | "nonaktif">("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Deactivation Modal State
  const [selectedOutlet, setSelectedOutlet] = useState<Outlet | null>(null);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [submittingStatus, setSubmittingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const statusParam = statusFilter !== "all" ? `&status=${statusFilter}` : "";
    const res = await fetch(`/api/outlets?q=${encodeURIComponent(q)}${statusParam}`);
    const json = await res.json();
    setItems(json.outlets || []);
    setLoading(false);
  }, [q, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, statusFilter]);

  const handleOpenDeactivateModal = (o: Outlet) => {
    setSelectedOutlet(o);
    setDeactivateReason("Toko / lini usaha telah ditutup oleh pemilik");
    setStatusError("");
    setShowDeactivateModal(true);
  };

  const handleExecuteDeactivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOutlet) return;
    if (!deactivateReason.trim()) {
      setStatusError("Alasan penonaktifan wajib diisi");
      return;
    }

    setSubmittingStatus(true);
    setStatusError("");
    try {
      const res = await fetch(`/api/outlets/${encodeURIComponent(selectedOutlet.id)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deactivate",
          alasan: deactivateReason.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menonaktifkan outlet");

      setShowDeactivateModal(false);
      setSelectedOutlet(null);
      await load();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Terjadi kesalahan saat memproses");
    } finally {
      setSubmittingStatus(false);
    }
  };

  const handleExecuteActivate = async (o: Outlet) => {
    if (!confirm(`Aktifkan kembali outlet "${o.nama_outlet}" (${o.id})?`)) return;

    try {
      const res = await fetch(`/api/outlets/${encodeURIComponent(o.id)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate" }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mengaktifkan outlet");

      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Terjadi kesalahan");
    }
  };

  const pageSize = 10;
  const totalPages = Math.ceil(items.length / pageSize);
  const pagedItems = items.slice((page - 1) * pageSize, page * pageSize);

  const presetReasons = [
    "Toko / lini usaha telah ditutup oleh pemilik",
    "Vakum transaksi / berhenti beroperasi sementara",
    "Permintaan dari pemilik member",
  ];

  return (
    <div className="fade-in" style={{ padding: "28px 32px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Lini Bisnis &amp; Outlet</h1>
        <p className="page-subtitle">Semua unit usaha terdaftar per One Identity dan status keaktifan operasional</p>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, background: "var(--bg-page)", padding: 4, borderRadius: 8, border: "1px solid var(--border)" }}>
          <button
            onClick={() => setStatusFilter("all")}
            className={`btn btn-sm ${statusFilter === "all" ? "btn-primary" : "btn-ghost"}`}
            style={{ fontSize: 12, padding: "5px 12px" }}
          >
            Semua
          </button>
          <button
            onClick={() => setStatusFilter("aktif")}
            className={`btn btn-sm ${statusFilter === "aktif" ? "btn-primary" : "btn-ghost"}`}
            style={{ fontSize: 12, padding: "5px 12px" }}
          >
            Aktif
          </button>
          <button
            onClick={() => setStatusFilter("nonaktif")}
            className={`btn btn-sm ${statusFilter === "nonaktif" ? "btn-primary" : "btn-ghost"}`}
            style={{ fontSize: 12, padding: "5px 12px" }}
          >
            Nonaktif
          </button>
        </div>

        <div style={{ position: "relative", minWidth: 320 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            className="input"
            style={{ paddingLeft: 36, width: "100%" }}
            placeholder="Cari ID outlet, nama usaha, atau pemilik..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: "center" }}><div className="spinner" style={{ margin: "0 auto" }} /></div>
        ) : items.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center" }}>
            <Store size={40} style={{ color: "var(--text-muted)", margin: "0 auto 12px" }} />
            <div style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Tidak ada data outlet yang sesuai</div>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ whiteSpace: "nowrap", minWidth: 140 }}>ID Outlet</th>
                    <th>Nama Outlet</th>
                    <th>Status</th>
                    <th>Tipe</th>
                    <th>One Identity</th>
                    <th>Aliases</th>
                    <th className="col-num">Total Transaksi</th>
                    <th className="col-num">Poin</th>
                    <th className="col-num">Kupon</th>
                    <th style={{ textAlign: "center", width: 110 }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((o) => (
                    <tr key={o.id} style={{ opacity: o.aktif ? 1 : 0.75, background: o.aktif ? "transparent" : "#FFF7ED" }}>
                      <td style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "var(--navy-700)", whiteSpace: "nowrap" }}>
                        {o.id}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{o.nama_outlet}</div>
                        {!o.aktif && o.nonaktif_alasan && (
                          <div style={{ fontSize: 11, color: "#C2410C", marginTop: 2 }} title={o.nonaktif_alasan}>
                            ⚠️ {o.nonaktif_alasan}
                          </div>
                        )}
                      </td>
                      <td>
                        {o.aktif ? (
                          <span className="badge badge-final" style={{ background: "#DCFCE7", color: "#166534" }}>
                            Aktif
                          </span>
                        ) : (
                          <span className="badge badge-danger" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                            Nonaktif ({o.nonaktif_tipe || "manual"})
                          </span>
                        )}
                      </td>
                      <td><span className={`badge badge-${o.tipe}`}>{o.tipe}</span></td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{o.nama_pemilik}</td>
                      <td style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o.aliases ? o.aliases.split(" || ").length + " alias" : "—"}
                      </td>
                      <td className="col-num" style={{ fontSize: 12 }}>{fmtRp(o.total_transaksi)}</td>
                      <td className="col-num" style={{ fontWeight: 600, color: "var(--gold-700)" }}>{fmt(o.total_poin)}</td>
                      <td className="col-num" style={{ fontWeight: 600, color: "var(--success-600)" }}>{fmt(o.total_kupon)}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          {o.aktif ? (
                            <button
                              onClick={() => handleOpenDeactivateModal(o)}
                              title="Nonaktifkan Lini Bisnis Ini"
                              className="btn btn-sm"
                              style={{
                                background: "#FFF1F2",
                                color: "#E11D48",
                                border: "1px solid #FECDD3",
                                padding: "4px 8px",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                fontSize: 11,
                              }}
                            >
                              <PowerOff size={12} /> Nonaktif
                            </button>
                          ) : (
                            <button
                              onClick={() => handleExecuteActivate(o)}
                              title="Aktifkan Kembali Lini Bisnis Ini"
                              className="btn btn-sm"
                              style={{
                                background: "#F0FDF4",
                                color: "#16A34A",
                                border: "1px solid #BBF7D0",
                                padding: "4px 8px",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                fontSize: 11,
                              }}
                            >
                              <Power size={12} /> Aktifkan
                            </button>
                          )}
                          <Link href={`/identities/${encodeURIComponent(o.identity_id)}`} className="btn btn-outline btn-sm" title="Lihat Profil Customer" style={{ padding: "4px 8px" }}>
                            <ChevronRight size={13} />
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
              totalItems={items.length}
              pageSize={pageSize}
              itemLabel="outlet"
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {/* Deactivate Outlet Modal */}
      {showDeactivateModal && selectedOutlet && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8, color: "#BE123C" }}>
                <PowerOff size={18} /> Nonaktifkan Lini Bisnis
              </h3>
              <button onClick={() => setShowDeactivateModal(false)} className="btn btn-ghost btn-sm">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleExecuteDeactivate}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {statusError && (
                  <div className="alert alert-danger" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <AlertTriangle size={16} />
                    <span>{statusError}</span>
                  </div>
                )}

                <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#9F1239" }}>{selectedOutlet.nama_outlet}</div>
                  <div style={{ fontSize: 11, color: "#BE123C", fontFamily: "monospace", marginTop: 2 }}>
                    ID: {selectedOutlet.id} &bull; Tipe: {selectedOutlet.tipe.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 11, color: "#881337", marginTop: 2 }}>
                    Pemilik: {selectedOutlet.nama_pemilik} ({selectedOutlet.identity_id})
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  💡 <em>Poin dan kupon yang telah diperoleh tetap aman tersimpan. Jika ini adalah satu-satunya lini bisnis aktif milik customer, akun utama One Identity juga akan ikut ditandai nonaktif secara otomatis.</em>
                </div>

                <div>
                  <label className="label" style={{ fontSize: 12, fontWeight: 600 }}>Alasan Penonaktifan *</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                    {presetReasons.map((p) => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setDeactivateReason(p)}
                        className="btn btn-ghost btn-sm"
                        style={{
                          textAlign: "left",
                          justifyContent: "flex-start",
                          fontSize: 11,
                          padding: "6px 10px",
                          border: deactivateReason === p ? "1px solid #F43F5E" : "1px solid var(--border)",
                          background: deactivateReason === p ? "#FFF1F2" : "white",
                          color: deactivateReason === p ? "#BE123C" : "var(--text-primary)",
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Tulis alasan spesifik jika diperlukan..."
                    value={deactivateReason}
                    onChange={(e) => setDeactivateReason(e.target.value)}
                    required
                    style={{ fontSize: 12, width: "100%", resize: "vertical" }}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowDeactivateModal(false)}
                  disabled={submittingStatus}
                  className="btn btn-outline btn-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingStatus || !deactivateReason.trim()}
                  className="btn btn-sm"
                  style={{
                    background: "#E11D48",
                    color: "white",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <PowerOff size={13} />
                  {submittingStatus ? "Memproses..." : "Konfirmasi Nonaktifkan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
