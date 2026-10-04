"use client";
import { useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type Tab = "master" | "transaksi";

interface Result {
  success?: boolean;
  error?: string;
  batchId?: number;
  totalBaris?: number;
  barisOk?: number;
  barisSkip?: number;
  barisWarn?: number;
  peringatan?: string[];
  approvalCount?: number;
}

export default function ImportPage() {
  const [tab, setTab] = useState<Tab>("master");
  const [file, setFile] = useState<File | null>(null);
  const [bulan, setBulan] = useState("2026-09");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File | null) => {
    setFile(f);
    setResult(null);
  };

  const submit = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);
    if (tab === "transaksi") fd.append("bulan", bulan);

    const endpoint = tab === "master" ? "/api/import/master" : "/api/import/transaksi";
    const res = await fetch(endpoint, { method: "POST", body: fd });
    const json = await res.json();
    setResult(json);
    setLoading(false);
  };

  return (
    <div className="fade-in" style={{ padding: "28px 32px", maxWidth: 780 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Import Data</h1>
        <p className="page-subtitle">Unggah file Excel dari sistem POS Oriental</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {(["master", "transaksi"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setFile(null); setResult(null); }}
            className={`btn ${tab === t ? "btn-primary" : "btn-outline"}`}
          >
            {t === "master" ? "Master Customer" : "Transaksi Bulanan"}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: "28px 32px" }}>
        {/* Tab Info */}
        <div className="alert alert-info" style={{ marginBottom: 24 }}>
          <Info size={15} style={{ flexShrink: 0 }} />
          {tab === "master" ? (
            <span>Unggah file <strong>List Costumer.xlsx</strong> dari POS. Kolom yang digunakan: Kode, Nama, Alamat, Kota, Kategori, Kontak, HP. Kode 131- dan 102- diterima.</span>
          ) : (
            <span>Unggah file <strong>export transaksi bulanan</strong> dari POS. Header wajib: Tanggal, No Invoice, Nama Customer, Jenis, Jumlah.</span>
          )}
        </div>

        {/* Bulan selector (transaksi only) */}
        {tab === "transaksi" && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
              Periode Bulan *
            </label>
            <input
              type="month"
              className="input"
              value={bulan}
              onChange={e => setBulan(e.target.value)}
              style={{ maxWidth: 200 }}
              min="2026-09"
              max="2027-09"
            />
          </div>
        )}

        {/* Drop Zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0] || null); }}
          onClick={() => document.getElementById("fileInput")?.click()}
          style={{
            border: `2px dashed ${dragOver ? "var(--navy-400)" : file ? "var(--success-600)" : "var(--border-strong)"}`,
            borderRadius: "var(--radius-lg)",
            padding: "36px 24px",
            textAlign: "center",
            cursor: "pointer",
            background: dragOver ? "var(--navy-50)" : file ? "var(--success-100)" : "var(--bg-page)",
            transition: "all .2s",
          }}
        >
          <input
            id="fileInput"
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={e => handleFile(e.target.files?.[0] || null)}
          />
          {file ? (
            <div>
              <FileSpreadsheet size={36} style={{ color: "var(--success-600)", margin: "0 auto 10px" }} />
              <div style={{ fontWeight: 600, fontSize: 15, color: "var(--success-600)" }}>{file.name}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                {(file.size / 1024).toFixed(1)} KB — Klik untuk ganti file
              </div>
            </div>
          ) : (
            <div>
              <Upload size={36} style={{ color: "var(--text-muted)", margin: "0 auto 10px" }} />
              <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)" }}>
                Drag & drop file Excel di sini
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                atau klik untuk memilih file (.xlsx, .xls)
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20, gap: 10 }}>
          {file && (
            <button className="btn btn-outline" onClick={() => { setFile(null); setResult(null); }}>
              <X size={14} /> Batal
            </button>
          )}
          <button
            className="btn btn-primary btn-lg"
            onClick={submit}
            disabled={!file || loading || (tab === "transaksi" && !bulan)}
          >
            {loading ? (
              <><div className="spinner" style={{ width: 16, height: 16 }} /> Memproses...</>
            ) : (
              <><Upload size={16} /> Mulai Import</>
            )}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div style={{ marginTop: 24 }}>
            {result.error ? (
              <div className="alert alert-danger">
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                <span><strong>Gagal:</strong> {result.error}</span>
              </div>
            ) : (
              <div>
                <div className="alert alert-success" style={{ marginBottom: 14 }}>
                  <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                  <span>
                    Import selesai! Batch #{result.batchId} —{" "}
                    <strong>{result.barisOk}</strong> berhasil,{" "}
                    <strong>{result.barisSkip}</strong> dilewati,{" "}
                    <strong>{result.barisWarn}</strong> peringatan
                    {result.approvalCount ? `, ${result.approvalCount} masuk antrean approval` : ""}.
                  </span>
                </div>

                {/* Stats grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: result.peringatan?.length ? 14 : 0 }}>
                  {[
                    { label: "Total Baris", val: result.totalBaris ?? 0, color: "var(--text-primary)" },
                    { label: "Berhasil", val: result.barisOk ?? 0, color: "var(--success-600)" },
                    { label: "Dilewati", val: result.barisSkip ?? 0, color: "var(--text-muted)" },
                    { label: "Peringatan", val: result.barisWarn ?? 0, color: "var(--warning-600)" },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="card" style={{ padding: "12px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Warnings list */}
                {(result.peringatan?.length ?? 0) > 0 && (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--warning-600)", marginBottom: 8 }}>
                      <AlertTriangle size={13} style={{ display: "inline", marginRight: 4 }} />
                      Peringatan ({result.peringatan!.length}):
                    </div>
                    <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", background: "var(--bg-page)" }}>
                      {result.peringatan!.map((p, i) => (
                        <div key={i} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                          {p}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
