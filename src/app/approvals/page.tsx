"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, MinusCircle, RefreshCw, GitMerge, AlertTriangle, Plus } from "lucide-react";

interface Approval {
  id: number;
  jenis: string;
  payload: string;
  status: string;
  created_at: string;
  filename?: string;
  bulan?: string;
}
interface Count { jenis: string; jumlah: number; }

const JENIS_LABEL: Record<string, string> = {
  nama_belum_dipetakan: "Nama Belum Dipetakan",
  kode_tabrakan: "Kode Tabrakan",
  outlet_tanpa_induk: "Outlet Tanpa Akun Utama",
  kode_lama_131: "Kode POS Lama (131)",
  anomali_master: "Anomali Master",
  invoice_berubah: "Invoice Berubah",
  nama_mirip: "Nama Mirip",
};

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [counts, setCounts] = useState<Count[]>([]);
  const [filterJenis, setFilterJenis] = useState("");
  const [loading, setLoading] = useState(true);
  const [outlets, setOutlets] = useState<{ id: string; nama_outlet: string; tipe: string; nama_pemilik: string }[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState<Record<number, string>>({});
  const [resolving, setResolving] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = filterJenis ? `?jenis=${filterJenis}` : "";
    const [aRes, oRes] = await Promise.all([
      fetch(`/api/approvals${params}`),
      fetch("/api/outlets"),
    ]);
    const aJson = await aRes.json();
    const oJson = await oRes.json();
    setApprovals(aJson.approvals || []);
    setCounts(aJson.counts || []);
    setOutlets(oJson.outlets || []);
    setLoading(false);
  }, [filterJenis]);

  useEffect(() => { load(); }, [load]);

  const resolve = async (id: number, keputusan: string, outletId?: string) => {
    setResolving(id);
    await fetch(`/api/approvals/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keputusan, data: outletId ? { outlet_id: outletId } : {} }),
    });
    await load();
    setResolving(null);
  };

  const totalPending = counts.reduce((s, c) => s + c.jumlah, 0);

  return (
    <div className="fade-in" style={{ padding: "28px 32px", maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Antrean Approval</h1>
          <p className="page-subtitle">Tinjau dan selesaikan item yang memerlukan keputusan Owner</p>
        </div>
        <button onClick={load} className="btn btn-outline btn-sm" disabled={loading}>
          <RefreshCw size={14} style={loading ? { animation: "spin .7s linear infinite" } : {}} /> Refresh
        </button>
      </div>

      {/* Count badges */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <button
          className={`badge ${filterJenis === "" ? "badge-menunggu" : "badge-draft"}`}
          style={{ cursor: "pointer", padding: "5px 12px" }}
          onClick={() => setFilterJenis("")}
        >
          Semua ({totalPending})
        </button>
        {counts.map(c => (
          <button
            key={c.jenis}
            className={`badge ${filterJenis === c.jenis ? "badge-menunggu" : "badge-draft"}`}
            style={{ cursor: "pointer", padding: "5px 12px" }}
            onClick={() => setFilterJenis(c.jenis)}
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
          <CheckCircle2 size={48} style={{ color: "var(--success-600)", margin: "0 auto 12px" }} />
          <div style={{ fontWeight: 600, fontSize: 16 }}>Tidak ada item menunggu approval</div>
          <div style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 4 }}>Semua bersih!</div>
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
                            onChange={e => setSelectedOutlet(prev => ({ ...prev, [ap.id]: e.target.value }))}
                          >
                            <option value="">— Pilih outlet tujuan —</option>
                            {outlets.map(o => (
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
                            <GitMerge size={13} /> Petakan & Setujui
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
                            onChange={e => setSelectedOutlet(prev => ({ ...prev, [ap.id]: e.target.value }))}
                          >
                            <option value="">— Petakan ke Unit Usaha CRM —</option>
                            {outlets.map(o => (
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

                    {(ap.jenis === "anomali_master" || !["nama_belum_dipetakan", "kode_tabrakan", "outlet_tanpa_induk", "kode_lama_131"].includes(ap.jenis)) && (
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
        </div>
      )}
    </div>
  );
}
