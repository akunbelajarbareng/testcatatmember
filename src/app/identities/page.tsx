"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Users, ChevronRight, Award, Ticket, UserPlus, Download, X, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import Pagination from "@/components/Pagination";

interface Identity {
  id: string;
  nama_pemilik: string;
  alamat: string;
  kota: string;
  status: string;
  jumlah_outlet: number;
  total_poin: number;
  total_kupon: number;
}

function fmt(n: number) { return (n || 0).toLocaleString("id-ID"); }

export default function IdentitiesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Identity[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Form Fields
  const [formId, setFormId] = useState("");
  const [formNama, setFormNama] = useState("");
  const [formAlamat, setFormAlamat] = useState("");
  const [formKecamatan, setFormKecamatan] = useState("");
  const [formKota, setFormKota] = useState("WATAMPONE");
  const [formKodePos, setFormKodePos] = useState("");
  const [formProvinsi, setFormProvinsi] = useState("SULAWESI SELATAN");
  const [formCreateRetail, setFormCreateRetail] = useState(true);

  const pageSize = 10;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ q, page: String(page), limit: String(pageSize) });
    const res = await fetch(`/api/identities?${params}`);
    const json = await res.json();
    const rawList: Identity[] = json.identities || [];
    // Urutkan selalu berdasarkan ID One Identity (01, 02, 03, dst)
    const sorted = [...rawList].sort((a, b) => (a.id || '').localeCompare(b.id || '', undefined, { numeric: true }));
    setItems(sorted);
    setTotal(json.total || sorted.length);
    setLoading(false);
  }, [q, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q]);

  // Generate clean next ID from server
  const generateNextId = async () => {
    setGenLoading(true);
    try {
      const res = await fetch("/api/identities/next-id");
      const json = await res.json();
      if (json.nextId) {
        setFormId(json.nextId);
      }
    } catch {
      // fallback
      const now = new Date();
      const yy = String(now.getFullYear()).slice(2);
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      setFormId(`102-${yy}${mm}${dd}-01`);
    } finally {
      setGenLoading(false);
    }
  };

  const openAddModal = () => {
    setErrorMsg("");
    setFormNama("");
    setFormAlamat("");
    setFormKecamatan("");
    setFormKota("WATAMPONE");
    setFormKodePos("");
    setFormProvinsi("SULAWESI SELATAN");
    setFormCreateRetail(true);
    setShowModal(true);
    generateNextId();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNama.trim()) {
      setErrorMsg("Nama pemilik wajib diisi");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/identities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: formId.trim(),
          nama_pemilik: formNama.trim(),
          alamat: formAlamat.trim(),
          kecamatan: formKecamatan.trim(),
          kota: formKota.trim(),
          kode_pos: formKodePos.trim(),
          provinsi: formProvinsi.trim(),
          create_retail_outlet: formCreateRetail,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Gagal membuat Akun Utama");
      }

      setShowModal(false);
      await load();
      // Optional: langsung buka halaman detail
      router.push(`/identities/${encodeURIComponent(json.id)}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="fade-in" style={{ padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Daftar Member</h1>
          <p className="page-subtitle">{fmt(total)} One Identity terdaftar</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a
            href={`/api/identities/export${q ? `?q=${encodeURIComponent(q)}` : ""}`}
            className="btn btn-outline"
            style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}
            title="Download seluruh data Member, Outlet, dan Aliases dalam format Excel (.xlsx)"
            download
          >
            <Download size={15} /> Export Excel Lengkap
          </a>
          <button onClick={openAddModal} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserPlus size={16} /> Tambah Akun Utama Baru
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", maxWidth: 400, marginBottom: 20 }}>
        <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input
          className="input"
          style={{ paddingLeft: 36 }}
          placeholder="Cari nama atau ID..."
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: "center" }}><div className="spinner" style={{ margin: "0 auto" }} /></div>
        ) : items.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center" }}>
            <Users size={40} style={{ color: "var(--text-muted)", margin: "0 auto 12px" }} />
            <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>
              {q ? "Tidak ada hasil pencarian" : "Belum ada member. Buat Akun Utama pertama Anda."}
            </div>
            {!q && (
              <button onClick={openAddModal} className="btn btn-primary btn-sm">
                <UserPlus size={14} /> Buat Akun Utama Sekarang
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ whiteSpace: "nowrap", minWidth: 150 }}>ID One Identity</th>
                    <th>Nama Pemilik</th>
                    <th>Kota</th>
                    <th style={{ textAlign: "center" }}>Outlet</th>
                    <th className="col-num"><Award size={12} style={{ display:"inline", marginRight:3 }}/>Poin</th>
                    <th className="col-num"><Ticket size={12} style={{ display:"inline", marginRight:3 }}/>Kupon</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--navy-700)", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {item.id}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{item.nama_pemilik}</td>
                      <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>{item.kota || "—"}</td>
                      <td style={{ textAlign: "center" }}>
                        <span className="badge badge-draft">{item.jumlah_outlet}</span>
                      </td>
                      <td className="col-num" style={{ fontWeight: 600, color: "var(--gold-700)" }}>
                        {fmt(item.total_poin)}
                      </td>
                      <td className="col-num" style={{ fontWeight: 600, color: "var(--success-600)" }}>
                        {fmt(item.total_kupon)}
                      </td>
                      <td>
                        <span className={`badge badge-${item.status === "aktif" ? "final" : "ditolak"}`}>
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <Link href={`/identities/${item.id}`} className="btn btn-outline btn-sm">
                          Detail <ChevronRight size={13} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination & Counter */}
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={pageSize}
              itemLabel="member"
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {/* MODAL: Tambah Akun Utama Baru */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            {/* Modal Header */}
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--navy-50)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--navy-700)" }}>
                  <UserPlus size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Tambah Akun Utama Baru</h3>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Daftarkan One Identity (1 KTP Pemilik)</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="btn btn-outline btn-sm" style={{ padding: 6 }}>
                <X size={16} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {errorMsg && (
                <div style={{ padding: "10px 14px", background: "var(--danger-100)", color: "var(--danger-600)", borderRadius: "var(--radius-sm)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertCircle size={16} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Nomor ID */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Nomor ID One Identity (Format: 102-YYMMDD-NN)
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 14 }}
                    value={formId}
                    onChange={e => setFormId(e.target.value)}
                    placeholder="Contoh: 102-261003-01"
                    required
                  />
                  <button
                    type="button"
                    onClick={generateNextId}
                    className="btn btn-outline"
                    disabled={genLoading}
                    title="Generate ID Bersih Otomatis"
                    style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
                  >
                    <RefreshCw size={14} className={genLoading ? "spinner" : ""} />
                    Auto ID
                  </button>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                  ID bersih Watampone (kode 102). Terjamin unik dan terformat rapi.
                </p>
              </div>

              {/* Nama Pemilik */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Nama Pemilik Resmi (Sesuai KTP) <span style={{ color: "var(--danger-600)" }}>*</span>
                </label>
                <input
                  className="input"
                  value={formNama}
                  onChange={e => setFormNama(e.target.value)}
                  placeholder="Contoh: H. MUHAMMAD SYARIF"
                  required
                />
              </div>

              {/* Alamat & Kota */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                    Kota
                  </label>
                  <input
                    className="input"
                    value={formKota}
                    onChange={e => setFormKota(e.target.value)}
                    placeholder="WATAMPONE"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                    Kecamatan
                  </label>
                  <input
                    className="input"
                    value={formKecamatan}
                    onChange={e => setFormKecamatan(e.target.value)}
                    placeholder="Contoh: TANETE RIATTANG"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Alamat Lengkap
                </label>
                <textarea
                  className="input"
                  style={{ height: 60, resize: "none", fontSize: 13 }}
                  value={formAlamat}
                  onChange={e => setFormAlamat(e.target.value)}
                  placeholder="Jalan, No Rumah, RT/RW, Kelurahan..."
                />
              </div>

              {/* Option Checkbox */}
              <div style={{ background: "var(--bg-page)", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={formCreateRetail}
                    onChange={e => setFormCreateRetail(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                      Buat Otomatis Outlet Retail Default
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                      Sesuai aturan PRD (1 KTP = 1 Kartu Retail). Outlet ini akan memakai ID <code style={{ fontSize: 11 }}>{formId || "102-YYMMDD-NN"}</code>.
                    </div>
                  </div>
                </label>
              </div>

              {/* Modal Footer */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-outline"
                  disabled={submitting}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  {submitting ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <CheckCircle2 size={16} />}
                  Simpan & Buka Profil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
