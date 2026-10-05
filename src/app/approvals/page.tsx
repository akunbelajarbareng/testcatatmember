"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  RefreshCw,
  GitMerge,
  AlertTriangle,
  Plus,
  Search,
  X,
} from "lucide-react";
import Pagination from "@/components/Pagination";

interface Approval {
  id: number;
  jenis: string;
  payload: string;
  status: string;
  created_at: string;
  filename?: string;
  bulan?: string;
}
interface Count {
  jenis: string;
  jumlah: number;
}

const JENIS_LABEL: Record<string, string> = {
  nama_belum_dipetakan: "Nama Belum Dipetakan",
  kode_tabrakan: "Kode Tabrakan",
  outlet_tanpa_induk: "Outlet Tanpa Akun Utama",
  kode_lama_131: "Kode POS Lama (131)",
  transaksi_outlet_nonaktif: "Transaksi Outlet Ditutup Manual",
  anomali_master: "Anomali Master",
  invoice_berubah: "Invoice Berubah",
  nama_mirip: "Nama Mirip",
};

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [counts, setCounts] = useState<Count[]>([]);
  const [filterJenis, setFilterJenis] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [outlets, setOutlets] = useState<{ id: string; nama_outlet: string; tipe: string; nama_pemilik: string }[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState<Record<number, string>>({});
  const [resolving, setResolving] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterJenis) params.set("jenis", filterJenis);
    if (q.trim()) params.set("q", q.trim());
    params.set("page", String(page));
    params.set("limit", "20");

    const [aRes, oRes] = await Promise.all([
      fetch(`/api/approvals?${params.toString()}`),
      fetch("/api/outlets"),
    ]);
    const aJson = await aRes.json();
    const oJson = await oRes.json();
    setApprovals(aJson.approvals || []);
    setCounts(aJson.counts || []);
    setTotal(aJson.total || 0);
    setOutlets(oJson.outlets || []);
    setLoading(false);
  }, [filterJenis, q, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFilterJenis = (jenis: string) => {
    setFilterJenis(jenis);
    setPage(1);
  };

  const handleSearchChange = (val: string) => {
    setQ(val);
    setPage(1);
  };

  const resolve = async (
    id: number,
    keputusan: string,
    outletId?: string,
    extraData?: Record<string, unknown>
  ) => {
    setResolving(id);
    await fetch(`/api/approvals/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keputusan,
        data: { ...(outletId ? { outlet_id: outletId } : {}), ...(extraData || {}) },
      }),
    });
    await load();
    setResolving(null);
  };

  const totalPending = counts.reduce((s, c) => s + c.jumlah, 0);
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="fade-in" style={{ padding: "28px 32px", maxWidth: 1040, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">Antrean Approval</h1>
          <p className="page-subtitle">Tinjau dan selesaikan item yang memerlukan keputusan Owner</p>
        </div>
        <button onClick={load} className="btn btn-outline btn-sm" disabled={loading} title="Segarkan Data">
          <RefreshCw size={14} style={loading ? { animation: "spin .7s linear infinite" } : {}} /> Refresh
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 340px", maxWidth: 480 }}>
          <Search
            size={15}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            className="input"
            style={{ paddingLeft: 36, paddingRight: q ? 32 : 12, width: "100%" }}
            placeholder="Cari kode (102/131), nama customer/POS, atau keterangan..."
            value={q}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {q && (
            <button
              onClick={() => handleSearchChange("")}
              title="Hapus pencarian"
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                padding: 4,
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {q && (
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Ditemukan <strong>{total}</strong> antrean cocok
          </span>
        )}
      </div>

      {/* Count badges / Filter Jenis */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <button
          className={`badge ${filterJenis === "" ? "badge-menunggu" : "badge-draft"}`}
          style={{ cursor: "pointer", padding: "5px 12px" }}
          onClick={() => handleFilterJenis("")}
        >
          Semua ({totalPending})
        </button>
        {counts.map((c) => (
          <button
            key={c.jenis}
            className={`badge ${filterJenis === c.jenis ? "badge-menunggu" : "badge-draft"}`}
            style={{ cursor: "pointer", padding: "5px 12px" }}
            onClick={() => handleFilterJenis(c.jenis)}
          >
            {JENIS_LABEL[c.jenis] || c.jenis} ({c.jumlah})
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}>
          <div className="spinner" style={{ margin: "0 auto" }} />
        </div>
      ) : approvals.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          {q ? (
            <>
              <AlertTriangle size={42} style={{ color: "var(--warning-600)", margin: "0 auto 12px" }} />
              <div style={{ fontWeight: 600, fontSize: 16 }}>
                Tidak ada antrean approval yang cocok dengan kata kunci &quot;{q}&quot;
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4, marginBottom: 14 }}>
                Silakan periksa kembali ejaan atau coba kata kunci kode/nama yang berbeda.
              </div>
              <button onClick={() => handleSearchChange("")} className="btn btn-outline btn-sm">
                Reset Pencarian
              </button>
            </>
          ) : (
            <>
              <CheckCircle2 size={48} style={{ color: "var(--success-600)", margin: "0 auto 12px" }} />
              <div style={{ fontWeight: 600, fontSize: 16 }}>Tidak ada item menunggu approval</div>
              <div style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 4 }}>Semua bersih!</div>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {approvals.map((ap) => {
            const payload = JSON.parse(ap.payload || "{}");
            const isBusy = resolving === ap.id;
            return (
              <div key={ap.id} className="card" style={{ padding: "18px 22px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div style={{ flexShrink: 0 }}>
                    <AlertTriangle size={18} style={{ color: "var(--warning-600)", marginTop: 2 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span className="badge badge-menunggu">{JENIS_LABEL[ap.jenis] || ap.jenis}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        #{ap.id} · {new Date(ap.created_at).toLocaleString("id-ID")}
                        {ap.filename && ` · ${ap.filename}`}
                      </span>
                    </div>

                    {/* Render per jenis */}
                    {ap.jenis === "nama_belum_dipetakan" && (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                          Nama POS: <span style={{ color: "var(--navy-700)", fontFamily: "monospace" }}>{payload.nama_pos}</span>
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
                          {payload.ada_di_master ? "Ada di master customer, tapi belum dipetakan ke outlet." : "Tidak ada di master customer."}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <select
                            className="input select"
                            style={{ maxWidth: 360, height: 36, fontSize: 13 }}
                            value={selectedOutlet[ap.id] || ""}
                            onChange={(e) => setSelectedOutlet((prev) => ({ ...prev, [ap.id]: e.target.value }))}
                          >
                            <option value="">— Pilih outlet tujuan —</option>
                            {outlets.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nama_pemilik} · {o.nama_outlet} [{o.tipe}]
                              </option>
                            ))}
                          </select>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={!selectedOutlet[ap.id] || isBusy}
                            onClick={() => resolve(ap.id, "disetujui", selectedOutlet[ap.id])}
                          >
                            <GitMerge size={13} /> Petakan &amp; Setujui
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={isBusy}
                            onClick={() => resolve(ap.id, "diabaikan")}
                          >
                            <MinusCircle size={13} /> Abaikan
                          </button>
                        </div>
                      </div>
                    )}

                    {ap.jenis === "kode_tabrakan" && (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                          Kode: <span style={{ fontFamily: "monospace", color: "var(--navy-700)" }}>{payload.kode}</span>
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
                          Kode ini digunakan oleh <strong>{payload.namas?.length}</strong> nama berbeda:
                          {payload.namas?.map((n: string, i: number) => (
                            <span key={i} style={{ display: "block", paddingLeft: 12, marginTop: 2 }}>• {n}</span>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn btn-primary btn-sm" disabled={isBusy} onClick={() => resolve(ap.id, "disetujui")}>
                            <CheckCircle2 size={13} /> Sudah Ditinjau
                          </button>
                          <button className="btn btn-outline btn-sm" disabled={isBusy} onClick={() => resolve(ap.id, "diabaikan")}>
                            <MinusCircle size={13} /> Abaikan
                          </button>
                        </div>
                      </div>
                    )}

                    {ap.jenis === "outlet_tanpa_induk" && (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                          Outlet: <span style={{ color: "var(--navy-700)", fontFamily: "monospace" }}>{payload.kode}</span> — {payload.nama} [{payload.tipe?.toUpperCase()}]
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
                          {payload.alasan}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <Link href="/identities" className="btn btn-primary btn-sm">
                            <Plus size={13} /> Buat Akun Utama ({payload.parent})
                          </Link>
                          <button className="btn btn-outline btn-sm" disabled={isBusy} onClick={() => resolve(ap.id, "disetujui")}>
                            <CheckCircle2 size={13} /> Buat Outlet (Jika Akun Sudah Ada)
                          </button>
                          <button className="btn btn-outline btn-sm" disabled={isBusy} onClick={() => resolve(ap.id, "diabaikan")}>
                            <MinusCircle size={13} /> Abaikan
                          </button>
                        </div>
                      </div>
                    )}

                    {ap.jenis === "kode_lama_131" && (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                          Kode POS Lama: <span style={{ color: "var(--navy-700)", fontFamily: "monospace" }}>{payload.kode}</span> — {payload.nama}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
                          {payload.alasan}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <select
                            className="input select"
                            style={{ maxWidth: 360, height: 36, fontSize: 13 }}
                            value={selectedOutlet[ap.id] || ""}
                            onChange={(e) => setSelectedOutlet((prev) => ({ ...prev, [ap.id]: e.target.value }))}
                          >
                            <option value="">— Petakan ke Unit Usaha CRM —</option>
                            {outlets.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nama_pemilik} · {o.nama_outlet} [{o.tipe}]
                              </option>
                            ))}
                          </select>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={!selectedOutlet[ap.id] || isBusy}
                            onClick={() => resolve(ap.id, "disetujui", selectedOutlet[ap.id])}
                          >
                            <GitMerge size={13} /> Petakan &amp; Setujui
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={isBusy}
                            onClick={() => resolve(ap.id, "diabaikan")}
                          >
                            <MinusCircle size={13} /> Abaikan
                          </button>
                        </div>
                      </div>
                    )}

                    {ap.jenis === "transaksi_outlet_nonaktif" && (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span className="badge badge-danger" style={{ background: "#FEE2E2", color: "#991B1B", fontWeight: 700 }}>
                            OUTLET NONAKTIF MANUAL
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                            Invoice: {payload.no_invoice} &bull; Tgl: {payload.tanggal}
                          </span>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, background: "#FFF7ED", border: "1px solid #FED7AA", padding: "10px 14px", borderRadius: 8, marginBottom: 10, fontSize: 12 }}>
                          <div>
                            <span style={{ color: "var(--text-muted)", display: "block" }}>Nama di Kasir POS:</span>
                            <strong style={{ color: "var(--text-primary)" }}>{payload.nama_pos}</strong>
                          </div>
                          <div>
                            <span style={{ color: "var(--text-muted)", display: "block" }}>Nilai Belanja:</span>
                            <strong style={{ color: "#C2410C" }}>Rp {Number(payload.jumlah || 0).toLocaleString("id-ID")} ({payload.jenis_pembayaran || "TUNAI"})</strong>
                          </div>
                          <div>
                            <span style={{ color: "var(--text-muted)", display: "block" }}>Target Lini Bisnis:</span>
                            <strong style={{ color: "var(--navy-700)" }}>{payload.nama_outlet} ({payload.outlet_id})</strong>
                          </div>
                          <div>
                            <span style={{ color: "var(--text-muted)", display: "block" }}>Pemilik (One Identity):</span>
                            <strong style={{ color: "var(--text-primary)" }}>{payload.nama_pemilik} ({payload.identity_id})</strong>
                          </div>
                        </div>

                        <div style={{ fontSize: 12, color: "#9A3412", marginBottom: 12, lineHeight: 1.5, background: "rgba(251, 146, 60, 0.1)", padding: "8px 12px", borderRadius: 6 }}>
                          ⚠️ <strong>Alasan Toko Dinonaktifkan:</strong> {payload.alasan_nonaktif || "Ditutup manual oleh Owner"}
                          <br />
                          💡 <em>Pilih tindakan Owner di bawah ini:</em>
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <button
                            className="btn btn-sm"
                            style={{
                              background: "#16A34A",
                              color: "white",
                              border: "none",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontWeight: 600,
                            }}
                            disabled={isBusy}
                            onClick={() => resolve(ap.id, "disetujui", undefined, { mode: "reopen_and_link" })}
                            title="Aktifkan kembali outlet & akun utama, lalu hubungkan faktur ini"
                          >
                            <CheckCircle2 size={13} /> Setujui &amp; Buka Kembali Toko
                          </button>

                          <button
                            className="btn btn-outline btn-sm"
                            style={{
                              borderColor: "#EA580C",
                              color: "#C2410C",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontWeight: 600,
                            }}
                            disabled={isBusy}
                            onClick={() => resolve(ap.id, "disetujui", undefined, { mode: "link_only" })}
                            title="Hubungkan faktur ini ke outlet untuk statement, namun status outlet TETAP ditutup"
                          >
                            <Plus size={13} /> Setujui Faktur Saja (Toko Tetap Tutup)
                          </button>

                          <button
                            className="btn btn-outline btn-sm"
                            style={{ display: "flex", alignItems: "center", gap: 6 }}
                            disabled={isBusy}
                            onClick={() => resolve(ap.id, "diabaikan")}
                            title="Abaikan faktur ini (outlet tetap tertutup dan faktur tidak dihitung poin)"
                          >
                            <MinusCircle size={13} /> Tolak / Abaikan
                          </button>
                        </div>
                      </div>
                    )}

                    {(ap.jenis === "anomali_master" || !["nama_belum_dipetakan", "kode_tabrakan", "outlet_tanpa_induk", "kode_lama_131", "transaksi_outlet_nonaktif"].includes(ap.jenis)) && (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                          {payload.nama || payload.kode || "—"}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                          Alasan: {payload.alasan || "—"}
                        </div>
                        <div style={{ fontFamily: "monospace", fontSize: 11, background: "var(--bg-page)", padding: "6px 10px", borderRadius: 6, marginBottom: 10 }}>
                          {JSON.stringify(payload, null, 2)}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn btn-primary btn-sm" disabled={isBusy} onClick={() => resolve(ap.id, "disetujui")}>
                            <CheckCircle2 size={13} /> Setujui
                          </button>
                          <button className="btn btn-danger btn-sm" disabled={isBusy} onClick={() => resolve(ap.id, "ditolak")}>
                            <XCircle size={13} /> Tolak
                          </button>
                          <button className="btn btn-outline btn-sm" disabled={isBusy} onClick={() => resolve(ap.id, "diabaikan")}>
                            <MinusCircle size={13} /> Abaikan
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pagination bar */}
          {approvals.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={total}
                pageSize={20}
                itemLabel="antrean approval"
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
