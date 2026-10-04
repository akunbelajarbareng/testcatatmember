"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search, GitMerge, CheckCircle2, X, ChevronDown, ArrowRightLeft, Unlink, Store } from "lucide-react";
import Pagination from "@/components/Pagination";

interface AliasRow {
  id: number; nama_pos: string; outlet_id: string; nama_outlet: string;
  tipe: string; identity_id: string; nama_pemilik: string; created_at: string;
}
interface UnmappedRow {
  nama_pos: string; jumlah_transaksi: number; total_jumlah: number;
}
interface OutletOption {
  id: string; nama_outlet: string; tipe: string; nama_pemilik: string; identity_id: string;
}

function fmt(n: number) { return n.toLocaleString("id-ID"); }
function fmtRp(n: number) { return `Rp ${fmt(n)}`; }

export default function AliasesPage() {
  const [tab, setTab] = useState<"mapped" | "unmapped">("unmapped");
  const [mapped, setMapped] = useState<AliasRow[]>([]);
  const [unmapped, setUnmapped] = useState<UnmappedRow[]>([]);
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedOutlet, setSelectedOutlet] = useState<Record<string, string>>({});
  const [mapping, setMapping] = useState<string | null>(null);

  // Transfer Modal State
  const [transferModal, setTransferModal] = useState<{ open: boolean; alias: AliasRow | null }>({ open: false, alias: null });
  const [newTargetOutletId, setNewTargetOutletId] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [mRes, uRes, oRes] = await Promise.all([
      fetch(`/api/aliases?q=${encodeURIComponent(q)}`),
      fetch(`/api/aliases?belum=1&q=${encodeURIComponent(q)}`),
      fetch("/api/outlets"),
    ]);
    const mJson = await mRes.json();
    const uJson = await uRes.json();
    const oJson = await oRes.json();
    setMapped(mJson.aliases || []);
    setUnmapped(uJson.rows || []);
    setOutlets(oJson.outlets || []);
    setLoading(false);
  }, [q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [tab, q]);

  const pageSize = 10;
  const currentTotal = tab === "unmapped" ? unmapped.length : mapped.length;
  const totalPages = Math.max(1, Math.ceil(currentTotal / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pagedUnmapped = unmapped.slice((page - 1) * pageSize, page * pageSize);
  const pagedMapped = mapped.slice((page - 1) * pageSize, page * pageSize);

  const petakan = async (namaPos: string) => {
    const outletId = selectedOutlet[namaPos];
    if (!outletId) return;
    setMapping(namaPos);
    try {
      const res = await fetch("/api/aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama_pos: namaPos, outlet_id: outletId }),
      });
      const json = await res.json();
      if (!res.ok) alert(json.error || "Gagal memetakan alias");
      await load();
    } finally {
      setMapping(null);
    }
  };

  const handleDetach = async (id: number, namaPos: string) => {
    if (!confirm(`Lepaskan alias "${namaPos}"?\n\nTransaksi kasir dengan nama ini akan dikembalikan ke antrean Belum Dipetakan.`)) return;
    await fetch("/api/aliases", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  };

  const openTransferModal = (row: AliasRow) => {
    setTransferModal({ open: true, alias: row });
    setNewTargetOutletId("");
    setTransferError("");
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTargetOutletId || !transferModal.alias) return;

    setTransferring(true);
    setTransferError("");

    try {
      const res = await fetch("/api/aliases/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alias_id: transferModal.alias.id,
          target_outlet_id: newTargetOutletId,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memindahkan alias");

      setTransferModal({ open: false, alias: null });
      await load();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setTransferring(false);
    }
  };

  // Group outlets by Member for cleanly structured dropdowns
  const groupedOutlets: Record<string, OutletOption[]> = {};
  for (const o of outlets) {
    const key = o.nama_pemilik || "Lainnya";
    if (!groupedOutlets[key]) groupedOutlets[key] = [];
    groupedOutlets[key].push(o);
  }

  return (
    <div className="fade-in" style={{ padding: "28px 32px", maxWidth: 1040 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Pemetaan Alias Kasir POS</h1>
        <p className="page-subtitle">Hubungkan nama transaksi di POS ke lini bisnis (Retail, UKM, atau Grosir) yang tepat</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button onClick={() => setTab("unmapped")} className={`btn ${tab === "unmapped" ? "btn-primary" : "btn-outline"}`}>
          Belum Dipetakan {unmapped.length > 0 && <span className="badge badge-menunggu pulse" style={{ marginLeft: 4 }}>{unmapped.length}</span>}
        </button>
        <button onClick={() => setTab("mapped")} className={`btn ${tab === "mapped" ? "btn-primary" : "btn-outline"}`}>
          Sudah Dipetakan ({mapped.length})
        </button>
      </div>

      {/* Search */}
      <div style={{ position: "relative", maxWidth: 400, marginBottom: 20 }}>
        <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="input" style={{ paddingLeft: 36 }} placeholder="Cari nama POS..." value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}><div className="spinner" style={{ margin: "0 auto" }} /></div>
      ) : tab === "unmapped" ? (
        unmapped.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: "center" }}>
            <CheckCircle2 size={48} style={{ color: "var(--success-600)", margin: "0 auto 12px" }} />
            <div style={{ fontWeight: 600, fontSize: 16 }}>Semua nama POS sudah terpetakan!</div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Semua transaksi dihitung otomatis ke statement member.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ whiteSpace: "nowrap" }}>Nama Customer di POS</th>
                    <th className="col-num" style={{ whiteSpace: "nowrap" }}>Transaksi</th>
                    <th className="col-num" style={{ whiteSpace: "nowrap" }}>Total Nilai</th>
                    <th style={{ minWidth: 320 }}>Petakan ke Unit Usaha &amp; Lini Bisnis</th>
                    <th style={{ whiteSpace: "nowrap" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedUnmapped.map(row => (
                    <tr key={row.nama_pos}>
                      <td style={{ fontWeight: 500, fontSize: 13 }}>{row.nama_pos}</td>
                      <td className="col-num" style={{ whiteSpace: "nowrap" }}>{row.jumlah_transaksi}</td>
                      <td className="col-num" style={{ fontSize: 13, whiteSpace: "nowrap" }}>{fmtRp(row.total_jumlah)}</td>
                      <td>
                        <select
                          className="input select"
                          style={{ fontSize: 12, height: 36 }}
                          value={selectedOutlet[row.nama_pos] || ""}
                          onChange={e => setSelectedOutlet(prev => ({ ...prev, [row.nama_pos]: e.target.value }))}
                        >
                          <option value="">— Pilih Outlet / Lini Bisnis Tujuan —</option>
                          {Object.entries(groupedOutlets).map(([owner, items]) => (
                            <optgroup key={owner} label={`▶ Member: ${owner}`}>
                              {items.map(o => (
                                <option key={o.id} value={o.id}>
                                  {o.nama_outlet} [{o.tipe.toUpperCase()} - Rate {o.tipe === "grosir" ? "200rb" : o.tipe === "retail" ? "100rb" : "50rb"}]
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={!selectedOutlet[row.nama_pos] || mapping === row.nama_pos}
                          onClick={() => petakan(row.nama_pos)}
                        >
                          {mapping === row.nama_pos ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <><GitMerge size={13} /> Petakan</>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={unmapped.length}
              pageSize={pageSize}
              itemLabel="nama POS"
              onPageChange={setPage}
            />
          </div>
        )
      ) : mapped.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <Store size={48} style={{ color: "var(--text-muted)", margin: "0 auto 12px" }} />
          <div style={{ fontWeight: 600, fontSize: 16 }}>Tidak ada alias yang ditemukan</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            {q ? `Tidak ada alias yang cocok dengan "${q}".` : "Belum ada nama kasir POS yang dipetakan."}
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: "nowrap" }}>Nama Kasir di POS</th>
                  <th style={{ whiteSpace: "nowrap" }}>Outlet Tujuan</th>
                  <th style={{ whiteSpace: "nowrap" }}>Lini Bisnis</th>
                  <th style={{ whiteSpace: "nowrap" }}>Pemilik (Akun Utama)</th>
                  <th style={{ whiteSpace: "nowrap" }}>Dipetakan</th>
                  <th style={{ textAlign: "right", whiteSpace: "nowrap" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pagedMapped.map(row => (
                  <tr key={row.id}>
                    <td style={{ fontSize: 13, fontWeight: 500 }}>{row.nama_pos}</td>
                    <td style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{row.nama_outlet}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className={`badge badge-${row.tipe}`}>
                        {row.tipe} ({row.tipe === "grosir" ? "200rb" : row.tipe === "retail" ? "100rb" : "50rb"})
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      <Link href={`/identities/${row.identity_id}`} style={{ color: "var(--navy-600)", fontWeight: 500 }}>
                        {row.nama_pemilik}
                      </Link>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{new Date(row.created_at).toLocaleDateString("id-ID")}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button
                          className="btn btn-outline btn-sm"
                          title="Pindahkan alias ke outlet atau member lain"
                          onClick={() => openTransferModal(row)}
                          style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", fontSize: 11 }}
                        >
                          <ArrowRightLeft size={12} /> Pindah
                        </button>
                        <button
                          className="btn btn-sm"
                          title="Lepaskan alias ke antrean unmapped"
                          onClick={() => handleDetach(row.id, row.nama_pos)}
                          style={{
                            background: "var(--danger-100)",
                            color: "var(--danger-600)",
                            border: "1px solid var(--danger-100)",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "4px 8px",
                            fontSize: 11
                          }}
                        >
                          <Unlink size={12} /> Lepas
                        </button>
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
            totalItems={mapped.length}
            pageSize={pageSize}
            itemLabel="alias terpetakan"
            onPageChange={setPage}
          />
        </div>
      )}

      {/* MODAL: Pindahkan Alias */}
      {transferModal.open && transferModal.alias && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--navy-50)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--navy-700)" }}>
                  <ArrowRightLeft size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Pindahkan Alias Kasir</h3>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Ubah outlet tujuan untuk transaksi nama kasir ini</p>
                </div>
              </div>
              <button onClick={() => setTransferModal({ open: false, alias: null })} className="btn btn-outline btn-sm" style={{ padding: 6 }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleExecuteTransfer} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {transferError && (
                <div style={{ padding: "10px 14px", background: "var(--danger-100)", color: "var(--danger-600)", borderRadius: "var(--radius-sm)", fontSize: 13 }}>
                  {transferError}
                </div>
              )}

              <div style={{ background: "var(--bg-page)", padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Nama Kasir POS:</div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--navy-900)", marginTop: 2 }}>
                  {transferModal.alias.nama_pos}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  Saat ini terhubung ke: <strong>{transferModal.alias.nama_outlet}</strong> [{transferModal.alias.tipe.toUpperCase()}] milik {transferModal.alias.nama_pemilik}
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Pilih Outlet / Lini Bisnis Tujuan Baru <span style={{ color: "var(--danger-600)" }}>*</span>
                </label>
                <select
                  className="input select"
                  value={newTargetOutletId}
                  onChange={(e) => setNewTargetOutletId(e.target.value)}
                  required
                >
                  <option value="">— Pilih Outlet Tujuan —</option>
                  {Object.entries(groupedOutlets).map(([owner, items]) => (
                    <optgroup key={owner} label={`▶ Member: ${owner}`}>
                      {items.filter(o => o.id !== transferModal.alias?.outlet_id).map(o => (
                        <option key={o.id} value={o.id}>
                          {o.nama_outlet} [{o.tipe.toUpperCase()} - Rate {o.tipe === "grosir" ? "200rb" : o.tipe === "retail" ? "100rb" : "50rb"}]
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                  Semua transaksi dari kasir ini akan dihitung ulang secara otomatis menggunakan rate outlet tujuan.
                </p>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setTransferModal({ open: false, alias: null })}
                  className="btn btn-outline"
                  disabled={transferring}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={transferring || !newTargetOutletId}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  {transferring ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <ArrowRightLeft size={16} />}
                  Pindahkan &amp; Hitung Ulang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
